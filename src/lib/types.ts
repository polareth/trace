import { Abi, Address, ContractFunctionName, GetAccountResult, Hex, MemoryClient } from "tevm";
import { SolcStorageLayout, SolcStorageLayoutTypes } from "tevm/bundler/solc";
import { Common } from "tevm/common";
import { abi } from "@shazow/whatsabi";
import { AbiType, AbiTypeToPrimitiveType } from "abitype";
import { AbiStateMutability, ContractFunctionArgs } from "viem";

import { DeepReadonly, GetMappingKeysTuple, ParseSolidityType, SolidityTypeToTsType } from "@/lib/adapter/types";

/* -------------------------------------------------------------------------- */
/*                                    TRACE                                   */
/* -------------------------------------------------------------------------- */

/**
 * Base options for analyzing storage access patterns during transaction simulation.
 *
 * Note: You will need to provide either a memory client or a JSON-RPC URL.
 *
 * @param client - Use existing memory client (either this or fork/rpcUrl is required)
 * @param rpcUrl - JSON-RPC URL for creating a memory client
 * @param common - EVM chain configuration (improves performance by avoiding fetching chain info)
 * @param explorers - Explorers urls and keys to use for fetching contract sources and ABI
 */
export type TraceStorageAccessOptions = {
  client?: MemoryClient;
  rpcUrl?: string;
  common?: Common;

  explorers?: {
    etherscan?: {
      baseUrl: string;
      apiKey?: string;
    };
    blockscout?: {
      baseUrl: string;
      apiKey?: string;
    };
  };
};

/**
 * Transaction parameters for analyzing storage access patterns during transaction simulation.
 *
 * - Option 1: simulate a new transaction with the encoded calldata {@link TraceStorageAccessTxWithData}
 * - Option 2: simulate a new transaction with the ABI and function name/args {@link TraceStorageAccessTxWithAbi}
 * - Option 3: replay a transaction with its hash {@link TraceStorageAccessTxWithReplay}
 *
 * @example
 *   const simulateParams: TraceStorageAccessTxParams = {
 *     from: "0x123...",
 *     to: "0x456...", // optional
 *     data: "0x789...",
 *   };
 *
 * @example
 *   const simulateParams: TraceStorageAccessTxParams = {
 *   from: "0x123...",
 *   to: "0x456...", // optional
 *   abi: [...],
 *   functionName: "mint",
 *   args: [69420n],
 *   };
 *
 * @example
 *   const replayParams: TraceStorageAccessTxParams = {
 *     txHash: "0x123...",
 *   };
 */
export type TraceStorageAccessTxParams<
  TAbi extends Abi | readonly unknown[] = Abi,
  TFunctionName extends ContractFunctionName<TAbi> = ContractFunctionName<TAbi>,
> =
  | (Partial<
      Record<keyof TraceStorageAccessTxWithReplay | keyof Omit<TraceStorageAccessTxWithAbi, "from" | "to">, never>
    > &
      TraceStorageAccessTxWithData)
  | (Partial<
      Record<keyof TraceStorageAccessTxWithReplay | keyof Omit<TraceStorageAccessTxWithData, "from" | "to">, never>
    > &
      TraceStorageAccessTxWithAbi<TAbi, TFunctionName>)
  | (Partial<Record<keyof TraceStorageAccessTxWithData | keyof TraceStorageAccessTxWithAbi, never>> &
      TraceStorageAccessTxWithReplay);

/**
 * Transaction parameters with encoded calldata.
 *
 * @param from - Sender address
 * @param data - Transaction calldata
 * @param to - Target contract address (optional for contract creation)
 */
export type TraceStorageAccessTxWithData = { from: Address; data: Hex; to?: Address };

/**
 * Contract transaction parameters with ABI typed function name and arguments.
 *
 * @param from - Sender address
 * @param to - Target contract address
 * @param abi - Contract ABI
 * @param functionName - Function name
 * @param args - Function arguments
 */
export type TraceStorageAccessTxWithAbi<
  TAbi extends Abi | readonly unknown[] = Abi,
  TFunctionName extends ContractFunctionName<TAbi> = ContractFunctionName<TAbi>,
> = {
  from: Address;
  to: Address;
  abi: TAbi;
  functionName: TFunctionName;
  args: ContractFunctionArgs<TAbi, AbiStateMutability, TFunctionName>;
};

/**
 * Transaction parameters from replaying a transaction with its hash.
 *
 * @param txHash - Transaction hash
 */
export type TraceStorageAccessTxWithReplay = { txHash: Hex };

/**
 * Storage access trace for a transaction
 *
 * @param storage - Storage slots that were accessed during transaction (only applicable for contracts)
 * @param intrinsic - Account field changes during transaction
 */
export type StorageAccessTrace<T extends DeepReadonly<SolcStorageLayout> = SolcStorageLayout> = {
  storage: {
    [Variable in T["storage"][number] as Variable["label"]]: LabeledStorageAccess<
      Variable["label"],
      ParseSolidityType<Variable["type"], T["types"]>,
      T["types"]
    >;
  };
  intrinsic: IntrinsicsDiff;
};

export type LabeledStorageAccess<
  L extends string = string,
  T extends string | undefined = string | undefined,
  Types extends SolcStorageLayoutTypes = SolcStorageLayoutTypes,
> = {
  /** The name of the variable in the layout */
  label: L;
  /** The entire Solidity definition of the variable (e.g. "mapping(uint256 => mapping(address => bool))" or "uint256[]") */
  type?: T; // TODO: rename to definition (also everywhere we call it "T", e.g. TDef & definition/typeDef)
  /** The more global kind of variable for easier parsing of the trace (e.g. "mapping", "array", "struct", "primitive") */
  kind?: T extends `mapping(${string} => ${string})`
    ? "mapping"
    : T extends `${string}[]` | `${string}[${string}]`
      ? "array"
      : T extends `struct ${string}`
        ? "struct"
        : T extends "bytes" | "string"
          ? "bytes"
          : T extends `${string}`
            ? "primitive"
            : T extends undefined
              ? undefined
              : never;
  /** The trace of the variable's access */
  trace: LabeledStorageAccessTrace<T, Types>;
  /** The offset of the variable within the slot (for packed variables) */
  offset?: number;
};

export type LabeledStorageAccessTrace<
  T extends string | undefined = string | undefined,
  Types extends SolcStorageLayoutTypes = SolcStorageLayoutTypes,
> = T extends `mapping(${string} => ${string})`
  ? Array<_LabeledStorageAccessTrace<T, Types> & { keys: GetMappingKeysTuple<T, Types> }>
  : T extends `${string}[]` | `${string}[${string}]`
    ? Array<_LabeledStorageAccessTrace<T, Types> & { index: number }>
    : _LabeledStorageAccessTrace<T, Types>;

type _LabeledStorageAccessTrace<T extends string | undefined, Types extends SolcStorageLayoutTypes> =
  | {
      modified: false;
      /** The decoded value of the variable */
      current: T extends `struct ${string}`
        ? Partial<SolidityTypeToTsType<T, Types>>
        : T extends string
          ? SolidityTypeToTsType<T, Types>
          : Hex;
      /** The slots storing some of the variable's data that were accessed */
      slots: Array<Hex>;
    }
  | {
      modified: true;
      /** The decoded value of the variable */
      current: T extends `struct ${string}`
        ? Partial<SolidityTypeToTsType<T, Types>>
        : T extends string
          ? SolidityTypeToTsType<T, Types>
          : Hex;
      /** The next value after the transaction (if it was modified) */
      next: T extends `struct ${string}`
        ? Partial<SolidityTypeToTsType<T, Types>>
        : T extends string
          ? SolidityTypeToTsType<T, Types>
          : Hex;
      /** The slots storing some of the variable's data that were accessed */
      slots: Array<Hex>;
    };

/* -------------------------------------------------------------------------- */
/*                                 ACCESS LIST                                */
/* -------------------------------------------------------------------------- */

/** Internal type representing the access list format from tevm. */
export type AccessList = Record<Address, Set<Hex>>;

/* --------------------------- STORAGE SLOT TYPES --------------------------- */
/** Type representing the storage at a defined slot at a specific point in time. */
export type StorageSnapshot = {
  /** Storage slot location */
  [slot: Hex]: {
    /** Current storage value (may be undefined) */
    value: Hex | undefined;
  };
};

/** Type representing a list of storage writes with modification. */
export type StorageDiff = {
  /** Storage slot location */
  [slot: Hex]: {
    /** Current storage value */
    current: Hex;
    /** New storage value after transaction */
    next?: Hex;
  };
};

/* -------------------------- ACCOUNT STORAGE TYPES ------------------------- */
/**
 * State fields at the intrinsic level of an account.
 *
 * @internal
 */
type Intrinsics = Pick<GetAccountResult, "balance" | "codeHash" | "deployedBytecode" | "nonce" | "storageRoot">;

/** Type representing the intrinsic state of an account at a specific point in time. */
export type IntrinsicsSnapshot = {
  /** Account field identifier */
  [K in keyof Intrinsics]: {
    /** Current value of the field */
    value: Intrinsics[K];
  };
};

/** Type representing the difference in intrinsic account state during transaction. */
export type IntrinsicsDiff = {
  /** Account field identifier */
  [K in keyof Intrinsics]: {
    /** Value before transaction */
    current: Intrinsics[K];
    /** Value after transaction (undefined if not modified) */
    next?: Intrinsics[K];
  };
};

/* -------------------------------------------------------------------------- */
/*                                 STORAGE LAYOUT                             */
/* -------------------------------------------------------------------------- */

/* ---------------------------------- SLOTS --------------------------------- */

export interface MappingKey<T extends AbiType = AbiType> {
  // Value padded to 32 bytes
  hex: Hex;
  // Type of the value if known
  type?: T;
  // Decoded value if known
  decoded?: AbiTypeToPrimitiveType<T>;
}

export type SlotMatchType = "exact" | "mapping" | "nested-mapping" | "array" | "struct";

export interface SlotLabelResult<M extends SlotMatchType = SlotMatchType> {
  // The variable name with formatted keys
  label: string;
  // The slot being accessed
  slot: string;
  // The type of match that was found
  matchType: M;
  // The variable type (from Solidity)
  type?: AbiType;
  // The detected keys or indices (if applicable)
  keys?: M extends "mapping" | "nested-mapping" ? Array<MappingKey> : never;
  // The detected index (if applicable)
  index?: M extends "array" ? Hex : never;
  // The offset of the variable within the slot (for packed variables)
  offset?: number;
}

/**
 * Information about a storage slot in a contract.
 *
 * Includes the variable name, type, and slot location.
 */
export interface StorageSlotInfo {
  // The variable name
  label: string;
  // The storage slot hex string
  slot: Hex;
  // The variable type (from Solidity)
  type?: AbiType;
  // The encoding of the variable (inplace, bytes, mapping, etc.)
  encoding?: "inplace" | "bytes" | "mapping" | "dynamic_array";
  // Whether this slot is computed (for mappings/arrays)
  isComputed?: boolean;
  // The base type for arrays
  baseType?: AbiType;
  // The key type for mappings
  keyType?: AbiType;
  // The value type for mappings
  valueType?: AbiType;
  // The offset of the variable within the slot (for packed variables)
  offset?: number;
}

/* -------------------------------- WHATSABI -------------------------------- */
export type GetContractsOptions = {
  client: MemoryClient;
  addresses: Array<Address>;
  explorers?: TraceStorageAccessOptions["explorers"];
};

export type GetContractsResult = Record<
  Address,
  {
    metadata: {
      name?: string;
      evmVersion?: string;
      compilerVersion?: string;
    };
    sources?: Array<{ path?: string; content: string }>;
    abi: abi.ABI;
  }
>;
