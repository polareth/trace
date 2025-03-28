import {
  Abi,
  Address,
  BlockTag,
  ContractFunctionName,
  createMemoryClient,
  encodeFunctionData,
  Hex,
  http,
  MemoryClient,
} from "tevm";
import { Common } from "tevm/common";

import { debug } from "@/debug";
import { TraceStorageAccessOptions, TraceStorageAccessTxParams, TraceStorageAccessTxWithData } from "@/lib/types";

/** Creates a Tevm client from the provided options */
export const createClient = (options: { rpcUrl?: string; common?: Common; blockTag?: BlockTag | bigint }) => {
  const { rpcUrl, common, blockTag } = options;
  if (!rpcUrl) throw new Error("You need to provide a rpcUrl if you don't provide a client directly");

  return createMemoryClient({
    common,
    fork: {
      transport: http(rpcUrl),
      blockTag: blockTag ?? "latest",
    },
    miningConfig: { type: "manual" },
  });
};

export const uniqueAddresses = (addresses: Array<Address | undefined>): Array<Address> => {
  let existingAddresses = new Set<string>();

  return addresses.filter((address) => {
    if (!address || existingAddresses.has(address.toLowerCase())) return false;
    existingAddresses.add(address.toLowerCase());
    return true;
  }) as Address[];
};

export const getUnifiedParams = async <
  TAbi extends Abi | readonly unknown[] = Abi,
  TFunctionName extends ContractFunctionName<TAbi> = ContractFunctionName<TAbi>,
>(
  args: TraceStorageAccessOptions & TraceStorageAccessTxParams<TAbi, TFunctionName>,
): Promise<TraceStorageAccessTxWithData & { client: MemoryClient }> => {
  const { client: _client, rpcUrl, common } = args;

  // Create the tevm client
  const client = _client ?? createClient({ rpcUrl, common });

  // Return early if the tx was already provided in calldata format
  if (args.from && args.data) return { client, from: args.from, to: args.to, data: args.data };

  // Encode calldata if the contract call was provided (abi, functionName, args)
  if (args.from && args.to && args.abi && args.functionName && args.args) {
    try {
      // @ts-expect-error complex union type not exactly similar
      const data = encodeFunctionData(args);
      return { client, from: args.from, to: args.to, data };
    } catch (err) {
      debug(`Failed to encode function data: ${err}`);
      throw err;
    }
  }

  // In this case, we need to replay the transaction
  if (!args.txHash)
    throw new Error("You need to provide a txHash if you don't provide the transaction data or contract call");

  // If we're replaying a transaction, extract the from, to, and data from the transaction
  try {
    const tx = await client.getTransaction({ hash: args.txHash });

    // TODO: can't run tx at past block so we need to recreate the client; this won't work on the default chain so to-test in staging
    // Also it's ugly to recreate the client here
    const clientBeforeTx = createClient({
      rpcUrl: rpcUrl ?? client.chain?.rpcUrls.default.http[0],
      common,
      blockTag: tx.blockNumber > 0 ? tx.blockNumber - BigInt(1) : BigInt(0),
    });

    return {
      client: clientBeforeTx,
      from: tx.from,
      to: tx.to ?? undefined,
      // TODO: remove when correctly formatted (tx in block mined here has data instead of input)
      // @ts-expect-error Property 'data' does not exist on type Transaction
      data: tx.input ? (tx.input as Hex) : (tx.data as Hex),
    };
  } catch (err) {
    debug(`Failed to get transaction for replaying ${args.txHash}: ${err}`);
    throw err;
  }
};
