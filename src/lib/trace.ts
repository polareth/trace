import { Abi, AbiFunction, Address, CallResult, ContractFunctionName, Hex } from "tevm";
import { toFunctionSignature } from "viem";

import { debug } from "@/debug";
import { createAccountDiff, intrinsicDiff, intrinsicSnapshot, storageDiff, storageSnapshot } from "@/lib/access-list";
import { StorageLayoutAdapter } from "@/lib/adapter";
import { extractPotentialKeys } from "@/lib/slots/engine";
import { formatLabeledStorageOp, getContracts, getStorageLayoutAdapter } from "@/lib/storage-layout";
import {
  LabeledStorageAccess,
  LabeledStorageRead,
  LabeledStorageWrite,
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

  // Get contracts' storage layouts
  const filteredContracts = addresses.filter((address) => {
    const preTxStorage = storagePreTx[address];
    const postTxStorage = storagePostTx[address];
    return preTxStorage && postTxStorage;
  });

  const contractsInfo = await getContracts({ client, addresses: filteredContracts, explorers: args.explorers });

  // Map to store storage layouts adapter per contract
  const layoutAdapters: Record<Address, StorageLayoutAdapter> = {};

  // Get layout adapters for each contract
  await Promise.all(
    Object.entries(contractsInfo).map(async ([address, contract]) => {
      // Get storage layout adapter for this contract
      layoutAdapters[address as Address] = await getStorageLayoutAdapter({ ...contract, address: address as Address });
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
      const slotsDiff =
        storage.pre && storage.post ? storageDiff(storage.pre, storage.post) : { reads: {}, writes: {} };

      // Compare account state changes
      const accountDiff = intrinsicDiff(intrinsics.pre, intrinsics.post);

      // Combine into complete diff
      const trace = createAccountDiff(slotsDiff, accountDiff);

      // Grab the adapter for this contract
      const layoutAdapter = layoutAdapters[address];

      // TODO: Redesign
      // Current design:
      // Go through each read, and for each go through all known variables to try to decode
      // Same for writes
      // If we can't decode, return a generic variable name
      // New design:
      // let exploredSlots: Set<Hex> = new Set();
      // // variable name -> decoded (+ maybe add slots that contain data?)
      // const decodedAccess: Record<string, LabeledStorageAccess> = Object.fromEntries(
      //   Object.entries(layoutAdapter).map(([label, storageAdapter]) => {
      //     // Use a way to explore slots specific to each variable type
      //     // Explore all slots because there might be packed variables (unexplored will just be to signify that we couldn't label it at all)
      //     // Pass the slot values as well
      //     // When decoding, find out if the slot(s) changed before/after tx to not decode twice if not necessary

      //     // 1. It's a mapping (try all keys to try to compute slots; we could get multiple slots if the mapping was modified multiple times)
      //     // 3. It's an array (decode the highest length of the array—before and after tx—and try to compute slots—could be multiple— with all possible indexes)
      //     // 2. It's a struct (compute slots for each member from the base slot, find out if one was affected, if it's the case decode members we can decode entirely)
      //     // 4. It's a bytes/string (decode the highest length of the variable—before and after tx—and decode it—might need to extract out 0 bytes?)
      //     // 5. It's a "primitive" (decode using the type directly and using the extracting relevant bytes if there is an offset)

      //     // TODO: implement

      //     return [label, {}];
      //   }),
      // );

      // const unknownAccess: Record<string, LabeledStorageAccess> = {}; // generic variable name -> undecoded slot value(s)

      // Create labeled reads and writes
      const labeledReads = Object.entries(trace.reads).reduce(
        (acc, [slotHex, read]) => {
          acc[slotHex as Hex] = formatLabeledStorageOp({
            op: read,
            slot: slotHex as Hex,
            adapter: layoutAdapter,
            potentialKeys,
          });
          return acc;
        },
        {} as Record<Hex, [LabeledStorageRead, ...LabeledStorageRead[]]>,
      );

      const labeledWrites = Object.entries(trace.writes).reduce(
        (acc, [slotHex, write]) => {
          acc[slotHex as Hex] = formatLabeledStorageOp({
            op: write,
            slot: slotHex as Hex,
            adapter: layoutAdapter,
            potentialKeys,
          });
          return acc;
        },
        {} as Record<Hex, [LabeledStorageWrite, ...LabeledStorageWrite[]]>,
      );

      // Return enhanced trace with labels
      acc[address] = {
        reads: labeledReads,
        writes: labeledWrites,
        intrinsic: trace.intrinsic,
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
