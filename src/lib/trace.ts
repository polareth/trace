import { Abi, AbiFunction, Address, CallResult, ContractFunctionName, Hex } from "tevm";
import { SolcStorageLayout } from "tevm/bundler/solc";
import { toFunctionSignature } from "viem";

import { debug } from "@/debug";
import { intrinsicDiff, intrinsicSnapshot, storageDiff, storageSnapshot } from "@/lib/access-list";
import { cleanTrace, decode } from "@/lib/slots/decode";
import { extractPotentialKeys } from "@/lib/slots/engine";
import { getContracts, getStorageLayout } from "@/lib/storage-layout";
import {
  LabeledStorageAccess,
  StorageAccessTrace,
  TraceStorageAccessOptions,
  TraceStorageAccessTxParams,
} from "@/lib/types";
import { createClient /* , uniqueAddresses */, getUnifiedParams } from "@/lib/utils";

/**
 * Analyzes storage access patterns during transaction execution.
 *
 * Identifies which contract slots are read from and written to, with human-readable labels.
 *
 * Note: If you provide a Tevm client yourself, you're responsible for managing the fork's state; although default
 * mining configuration is "auto", so unless you know what you're doing, it should be working as expected intuitively.
 *
 * @example
 *   const analysis = await traceStorageAccess({
 *     from: "0x123",
 *     to: "0x456",
 *     data: "0x1234567890",
 *     client: memoryClient,
 *   });
 *
 * @param options - {@link TraceStorageAccessOptions}
 * @returns Promise<Record<Address, {@link StorageAccessTrace}>> - Storage access trace with labeled slots and labeled
 *   layout access for each touched account
 */
export const traceStorageAccess = async <
  TAbi extends Abi | readonly unknown[] = Abi,
  TFunctionName extends ContractFunctionName<TAbi> = ContractFunctionName<TAbi>,
>(
  args: TraceStorageAccessOptions & TraceStorageAccessTxParams<TAbi, TFunctionName>,
): Promise<Record<Address, StorageAccessTrace>> => {
  const { client, from, to, data } = await getUnifiedParams(args);

  // Execute call on local vm with access list generation and trace
  let callResult: CallResult | undefined;
  try {
    callResult = await client.tevmCall({
      from,
      to,
      data,
      skipBalance: true,
      createAccessList: true,
      createTransaction: true,
      createTrace: true,
    });

    if (callResult.errors) {
      debug(`EVM exception during call: ${callResult.errors.map((err) => err.message).join(", ")}`);
      throw new Error(callResult.errors.map((err) => err.message).join(", "));
    }
  } catch (err) {
    debug(`Failed to execute call: ${err}`);
    throw err;
  }

  // Debug log showing the trace size and unique stack values
  debug(
    `Trace contains ${callResult.trace?.structLogs.length} steps and ${[...new Set(callResult.trace?.structLogs.flatMap((log) => log.stack))].length} unique stack values`,
  );

  // Get all relevant addresses (contract addresses + sender + target + any created contracts)
  // const addresses = uniqueAddresses([
  //   ...(Object.keys(callResult.accessList ?? {}) as Address[]),
  //   from,
  //   to,
  //   ...((callResult.createdAddresses ?? []) as Address[]),
  // ]);
  // TODO: research to make sure this really includes all relevant addresses but it should (all accounts touched by the tx)
  // currently enabled with createAccessList: true
  const addresses = Object.values(callResult.preimages ?? {}).filter(
    (address) => address !== "0x0000000000000000000000000000000000000000",
  );
  debug(`${addresses.length} accounts touched during the transaction`);

  // Get the storage and account values before the transaction is mined
  const storagePreTx = await storageSnapshot(client, callResult.accessList ?? {});
  const intrinsicsPreTx = await intrinsicSnapshot(client, addresses);

  // Mine the pending transaction to get post-state values
  await client.tevmMine();

  // TODO(later): just use a diff tracer
  // const debugCall = await client.request({
  //   method: "debug_traceTransaction",
  //   params: [
  //     callResult.txHash,
  //     {
  //       tracer: "prestateTracer",
  //       tracerConfig: {
  //         diffMode: true,
  //       },
  //     },
  //   ],
  // });
  // console.log(debugCall);

  // Get values after the transaction has been included
  const storagePostTx = await storageSnapshot(client, callResult.accessList ?? {});
  const intrinsicsPostTx = await intrinsicSnapshot(client, addresses);

  // Retrieve information about the contracts for which we need the storage layout
  const contractsInfo = await getContracts({
    client,
    addresses: addresses.filter((address) => storagePreTx[address] && storagePostTx[address]),
    explorers: args.explorers,
  });

  // Map to store storage layouts adapter per contract
  const layouts: Record<Address, SolcStorageLayout> = {};

  // Get layout adapters for each contract
  await Promise.all(
    Object.entries(contractsInfo).map(async ([address, contract]) => {
      // Get storage layout adapter for this contract
      const layout = await getStorageLayout({ ...contract, address: address as Address });
      if (layout) layouts[address as Address] = layout;
    }),
  );
  // Extract potential key/index values from the execution trace
  const traceLog = callResult.trace?.structLogs || [];

  // Create a slim version of the trace with deduplicated stack values for efficiency
  const dedupedTraceLog = {
    // Deduplicate stack values across all operations
    uniqueStackValues: [...new Set(traceLog.flatMap((log) => log.stack))],
    // Only keep storage-related operations for detailed analysis
    relevantOps: traceLog.filter((log) => ["SLOAD", "SSTORE", "SHA3"].includes(log.op)),
  };

  // Aggregate functions from all abis to be able to figure out types of args
  // TODO: maybe grab the function def before aggregating abis to no overwrite anything
  let abis = Object.values(contractsInfo)
    .flatMap((contract) => contract.abi)
    .filter((abi) => abi.type === "function");

  // In case the tx was a contract call with the abi and it could not be fetch, add it so we can decode potential mapping keys
  if (args.abi && args.functionName) {
    const functionDef = (args.abi as Abi).find(
      (func) => func.type === "function" && func.name === args.functionName,
    ) as AbiFunction | undefined;
    // @ts-expect-error readonly/mutable types
    if (functionDef) abis.push({ ...functionDef, selector: toFunctionSignature(functionDef) });
  }

  const potentialKeys = extractPotentialKeys(dedupedTraceLog, addresses, abis, data);
  debug(`Extracted ${potentialKeys.length} unique potential values from the trace`);

  // Process each address and create enhanced trace with labels
  const labeledTrace = addresses.reduce(
    (acc, address) => {
      const storage = { pre: storagePreTx[address], post: storagePostTx[address] };
      const intrinsics = { pre: intrinsicsPreTx[address], post: intrinsicsPostTx[address] };

      // Skip if this address has no relevant data
      if (!intrinsics.pre || !intrinsics.post) {
        debug(`Missing account state information for address ${address}`);
        return acc;
      }

      // For EOAs (accounts without code) we won't have storage data
      const storageTrace = storage.pre && storage.post ? storageDiff(storage.pre, storage.post) : {};

      const layout = layouts[address];
      if (!layout) {
        acc[address] = {
          storage: Object.fromEntries(
            Object.entries(storageTrace).map(([slot, { current, next }]) => [
              slot,
              cleanTrace({
                label: `slot_${slot}`,
                trace: {
                  current,
                  modified: next !== undefined && next !== current,
                  next,
                  slots: [slot],
                },
              }),
            ]),
          ),
          intrinsic: intrinsicDiff(intrinsics.pre, intrinsics.post),
        };

        return acc;
      }

      // 1. Decode using all known variables
      const { unexploredSlots, decoded } = decode(storageTrace, layout.storage, layout.types, potentialKeys);

      // 2. Create unknown variables access traces for remaining slots
      const unknownAccess: Record<string, LabeledStorageAccess> = Object.fromEntries(
        [...unexploredSlots].map((slot) => {
          const current = storageTrace[slot].current;
          const next = storageTrace[slot].next;

          return [
            `slot_${slot}`,
            cleanTrace({
              label: `slot_${slot}`,
              trace: {
                current,
                modified: next !== undefined && next !== current,
                next,
                slots: [slot],
              },
            }),
          ];
        }),
      );

      // Return enhanced trace with labels
      acc[address] = {
        storage: { ...decoded, ...unknownAccess },
        intrinsic: intrinsicDiff(intrinsics.pre, intrinsics.post),
      };

      return acc;
    },
    {} as Record<Address, StorageAccessTrace>,
  );

  return labeledTrace;
};

/**
 * A class that encapsulates the storage access tracing functionality.
 *
 * Allows for creating a reusable tracer with consistent configuration.
 */
export class Tracer {
  private client;
  private explorers;

  /**
   * Creates a new Tracer instance with configuration for tracing storage access.
   *
   * @param options Configuration options for the tracer
   */
  constructor(options: TraceStorageAccessOptions) {
    this.client = options.client ?? createClient(options);
    this.explorers = options.explorers;
  }

  /**
   * Traces storage access for a transaction.
   *
   * Uses the same underlying implementation as the standalone {@link traceStorageAccess} function.
   */
  async traceStorageAccess(txOptions: {
    from: Address;
    to: Address;
    data: Hex;
  }): Promise<Record<Address, StorageAccessTrace>> {
    // TODO: do we need to update the fork here? or is the "latest" blockTag enough?
    return traceStorageAccess({
      ...txOptions,
      client: this.client,
      explorers: this.explorers,
    });
  }

  // TODO: overload traceStorageAccess to accept abi, functionName, args
  // TODO: overload traceStorageAccess to accept txHash
}
