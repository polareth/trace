import { MemoryClient } from "tevm";
import {
  SolcStorageLayout,
  SolcStorageLayoutItem,
  SolcStorageLayoutStructType,
  SolcStorageLayoutTypeBase,
  SolcStorageLayoutTypes,
} from "tevm/bundler/solc";
import { Address, decodeAbiParameters, encodeAbiParameters, Hex, hexToBigInt, padHex, toHex } from "viem";

import { debug } from "@/debug";
import {
  DecodedSnapshot,
  DeepReadonly,
  ExtractArrayBaseType,
  ExtractMappingValueType,
  GetDataParams,
  GetDataReturnType,
  GetMappingKeyTypes,
  GetSlotParams,
  ParseSolidityType,
  SolidityKeyToTsType,
  StructToObject,
} from "@/lib/adapter/types";
import { computeArraySlot } from "@/lib/slots/array";
import { computeMappingSlot } from "@/lib/slots/mapping";
import { extractRelevantHex } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                              STORAGE ADAPTERS                              */
/* -------------------------------------------------------------------------- */

export class BaseStorageAdapter<T extends string, Types extends SolcStorageLayoutTypes> {
  // public type: Types[T]["label"];
  public type: SolidityKeyToTsType<T, Types>;
  public label: string;
  public encoding: SolcStorageLayoutTypeBase["encoding"];
  public byteLength: number;

  constructor(
    public storageItem: SolcStorageLayoutItem<Types>,
    private types: Types,
    public client?: MemoryClient,
    public address?: Address,
  ) {
    const typeInfo = this.types[this.storageItem.type] as SolcStorageLayoutTypeBase; // TODO: why can't we access properties otherwise (same issue as with struct in types)
    this.label = this.storageItem.label;
    this.type = typeInfo.label as SolidityKeyToTsType<T, Types>;
    this.encoding = typeInfo.encoding;
    this.byteLength = Number(typeInfo.numberOfBytes);
  }

  getSlot(): Hex {
    return toHex(BigInt(this.storageItem.slot), { size: 32 });
  }

  async getData<P extends GetDataParams<T, Types>>(params?: P): Promise<GetDataReturnType<T, Types, P>> {
    if (!this.client) throw new Error("A client is required retrieve storage data");
    if (!this.address) throw new Error("An address is required retrieve storage data");

    const slot = this.getSlot();
    const storageValue = await this.client.getStorageAt({ address: this.address, slot });
    if (!storageValue) throw new Error("Failed to retrieve storage value");

    const extractedHex = extractRelevantHex(storageValue, this.storageItem.offset ?? 0, this.byteLength);

    return decodeAbiParameters([{ type: this.type }], padHex(extractedHex, { size: 32 }))[0] as GetDataReturnType<
      T,
      Types,
      P
    >;
  }
}

export class MappingStorageAdapter<
  T extends `mapping(${string} => ${string})`,
  Types extends SolcStorageLayoutTypes,
> extends BaseStorageAdapter<T, Types> {
  public keys: GetMappingKeyTypes<T, Types>;
  public value: ExtractMappingValueType<T>;

  constructor(storageItem: SolcStorageLayoutItem<Types>, types: Types, client?: MemoryClient, address?: Address) {
    super(storageItem, types, client, address);
    [this.keys, this.value] = this.extractMappingTypes();
  }

  getSlot(params?: GetSlotParams<T, Types> & { encode?: boolean }): Hex {
    if (!params?.keys || params.keys.length !== this.keys.length) {
      debug("No keys provided, returning base slot");
      return super.getSlot();
    }

    // @ts-expect-error: TODO: why is it typed as any here
    return this.computeMappingSlot(super.getSlot(), params.keys, params.encode);
  }

  async getData<P extends GetDataParams<T, Types>>(params?: P): Promise<GetDataReturnType<T, Types, P>> {
    if (!this.client) throw new Error("A client is required retrieve storage data");
    if (!this.address) throw new Error("An address is required retrieve storage data");

    // TODO: return single items at index
    // TODO: return range of items
    // TODO: return multiple items at indexes
    return undefined as GetDataReturnType<T, Types, P>;
  }

  /**
   * Recursively extracts all key types from a mapping type
   *
   * @param mappingType The mapping type string (e.g. "mapping(uint256 => mapping(address => bool))")
   * @param types The types dictionary from the storage layout
   * @returns Array of key types in order
   */
  private extractMappingTypes(): [GetMappingKeyTypes<T, Types>, ExtractMappingValueType<T>] {
    const keyTypes = [] as GetMappingKeyTypes<T, Types>;
    let currentType = this.type;

    // Continue extracting keys as long as we have a mapping
    while (currentType.startsWith("mapping(")) {
      const match = currentType.match(/mapping\((.+?) => (.+)\)/);
      if (!match) break;

      const keyType = match[1];
      const valueType = match[2];

      // Add the current key type
      // @ts-expect-error: not assignable to type never
      keyTypes.push(keyType);

      // If the value is another mapping, continue with that
      currentType = valueType as SolidityKeyToTsType<T, Types>;
      if (!valueType.startsWith("mapping(")) {
        break;
      }
    }

    return [keyTypes, currentType as ExtractMappingValueType<T>];
  }

  private computeMappingSlot(baseSlot: Hex, keys: GetMappingKeyTypes<T, Types>, encode = true): Hex {
    return keys.reduce((slot, key, index) => {
      const hexKey = encode ? encodeAbiParameters([{ type: this.keys[index] }], [key]) : key;
      return computeMappingSlot(slot, padHex(hexKey, { size: 32 }));
    }, baseSlot);
  }
}

export class ArrayStorageAdapter<
  T extends `${string}[]` | `${string}[${string}]`,
  Types extends SolcStorageLayoutTypes,
> extends BaseStorageAdapter<T, Types> {
  public base: ExtractArrayBaseType<T>;

  constructor(storageItem: SolcStorageLayoutItem<Types>, types: Types, client?: MemoryClient, address?: Address) {
    super(storageItem, types, client, address);
    this.base = storageItem.type.toString().replace(/\[.*\]$/, "") as ExtractArrayBaseType<T>;
  }

  getSlot(params?: GetSlotParams<T, Types>): Hex {
    if (!params?.index) {
      debug("No index provided, returning base slot");
      return super.getSlot();
    }

    return this.computeArrayItemSlot(super.getSlot(), params.index);
  }

  async getLength(): Promise<bigint> {
    if (this.encoding !== "dynamic_array") return this.getStaticArrayLength();

    if (!this.client) throw new Error("A client is required retrieve storage data");
    if (!this.address) throw new Error("An address is required retrieve storage data");

    // Retrieve the length from storage
    const slot = this.getSlot();
    const storageValue = await this.client?.getStorageAt({ address: this.address, slot });
    if (!storageValue) throw new Error("Failed to retrieve storage value");
    return hexToBigInt(storageValue);
  }

  async getData<P extends GetDataParams<T, Types>>(params?: P): Promise<GetDataReturnType<T, Types, P>> {
    if (!this.client) throw new Error("A client is required retrieve storage data");
    if (!this.address) throw new Error("An address is required retrieve storage data");

    // TODO: return single items at index
    // TODO: return range of items
    // TODO: return multiple items at indexes
    return undefined as GetDataReturnType<T, Types, P>;
  }

  /**
   * Compute the storage slot for a specific array index
   *
   * @param baseSlot The base slot of the array
   * @param index The index to compute the slot for
   * @returns The storage slot for array[index]
   */
  private computeArrayItemSlot(baseSlot: Hex, index: number): Hex {
    return computeArraySlot(baseSlot, index, this.encoding === "dynamic_array");
  }

  private getStaticArrayLength(): bigint {
    const lengthFromBrackets = this.type.match(/\[(\d+)\]$/)?.[1];
    if (!lengthFromBrackets) throw new Error("Failed to retrieve length from brackets");
    return BigInt(lengthFromBrackets);
  }
}

export class StructStorageAdapter<
  T extends `struct ${string}`,
  Types extends SolcStorageLayoutTypes,
> extends BaseStorageAdapter<T, Types> {
  public fields: StructToObject<T, Types>;

  constructor(storageItem: SolcStorageLayoutItem<Types>, types: Types, client?: MemoryClient, address?: Address) {
    super(storageItem, types, client, address);
    this.fields = this.extractStructFields(types);
  }

  async getData<P extends GetDataParams<T, Types>>(params?: P): Promise<GetDataReturnType<T, Types, P>> {
    if (!this.client) throw new Error("A client is required retrieve storage data");
    if (!this.address) throw new Error("An address is required retrieve storage data");

    // TODO: return struct
    // TODO: (also types) handle mapping in struct, and other annoying things

    // if (structTypeInfo?.members) {
    //   const result: Record<string, any> = {};

    //   // Process all members in parallel for better performance
    //   const memberPromises = structTypeInfo.members.map(async (member) => {
    //     const memberType = parseTypeId(member.type, types);
    //     const memberSlot = computeStructMemberSlot(baseSlot, member.slot);
    //     const memberTypeId = member.type;

    //     // Handle different member types
    //     if (isStorageType.staticArray(memberTypeId) || isStorageType.dynamicArray(memberTypeId)) {
    //       // For array types, we need to create array data
    //       const arrayTypeInfo = types[memberTypeId];
    //       const baseType = parseTypeId(arrayTypeInfo.base, types);

    //       // For dynamic arrays, first get the length from storage
    //       let length: number;
    //       if (isStorageType.dynamicArray(memberTypeId)) {
    //         const lengthValue = await client.getStorageAt({
    //           address: client.account?.address,
    //           slot: memberSlot,
    //         });
    //         length = Number(hexToBigInt(lengthValue));
    //       } else {
    //         length = getStaticArrayLength(arrayTypeInfo.label);
    //       }

    //       // Only fetch items if the array has elements (limit to 10 for performance)
    //       if (length > 0) {
    //         const arrayBaseSlot = isStorageType.dynamicArray(memberTypeId) ? keccak256(memberSlot) : memberSlot;

    //         const arrayPromises = Array(Math.min(length, 10))
    //           .fill(null)
    //           .map(async (_, i) => {
    //             const itemSlot = toHex(hexToBigInt(arrayBaseSlot) + BigInt(i), { size: 32 });
    //             const storageValue = await client.getStorageAt({
    //               address: client.account?.address,
    //               slot: itemSlot,
    //             });
    //             const decoded = decodeStorageValue(baseType, storageValue);
    //             return decoded.decoded !== undefined ? decoded.decoded : decoded.hex;
    //           });

    //         result[member.label] = await Promise.all(arrayPromises);
    //       } else {
    //         result[member.label] = [];
    //       }
    //     } else if (isStorageType.mapping(memberTypeId)) {
    //       // For mappings, we can't enumerate keys, so just provide a description
    //       result[member.label] = "Mapping: use getData with keys to access values";
    //     } else {
    //       // For simple types, fetch the storage value
    //       const storageValue = await client.getStorageAt({
    //         address: client.account?.address,
    //         slot: memberSlot,
    //       });
    //       result[member.label] = decodeStorageValue(memberType, storageValue);
    //     }
    //   });

    //   // Wait for all member operations to complete
    //   await Promise.all(memberPromises);
    //   return result;
    // }

    return undefined as GetDataReturnType<T, Types, P>;
  }

  private extractStructFields(types: Types): StructToObject<T, Types> {
    const members = (types[this.type] as SolcStorageLayoutStructType).members; // TODO: fix the key type here as well
    return members.map((field) => ({
      [field.label]: types[field.type].label,
    })) as unknown as StructToObject<T, Types>; // TODO: actually inaccurate because we don't yet support non-primitive types as members
  }
}

export class StringOrBytesStorageAdapter<
  T extends "string" | "bytes",
  Types extends SolcStorageLayoutTypes,
> extends BaseStorageAdapter<T, Types> {
  constructor(storageItem: SolcStorageLayoutItem<Types>, types: Types, client?: MemoryClient, address?: Address) {
    super(storageItem, types, client, address);
  }

  getLength(): bigint {
    // TODO: return length of string or bytes
    return 0n;
  }

  async getData<P extends GetDataParams<T, Types>>(params?: P): Promise<GetDataReturnType<T, Types, P>> {
    if (!this.client) throw new Error("A client is required retrieve storage data");
    if (!this.address) throw new Error("An address is required retrieve storage data");

    // TODO: return entire string or bytes
    return undefined as GetDataReturnType<T, Types, P>;
  }
}

export type StorageAdapter<
  T extends string = string,
  Types extends SolcStorageLayoutTypes = SolcStorageLayoutTypes,
> = T extends `struct ${string}`
  ? StructStorageAdapter<T, Types>
  : T extends "string" | "bytes"
    ? StringOrBytesStorageAdapter<T, Types>
    : T extends `${string}[]` | `${string}[${string}]`
      ? ArrayStorageAdapter<T, Types>
      : T extends `mapping(${string} => ${string})`
        ? MappingStorageAdapter<T, Types>
        : BaseStorageAdapter<T, Types>;

/**
 * Create a base storage variable with methods appropriate for its type
 *
 * @param storageItem The storage item for this variable
 * @param types The types dictionary from the storage layout
 * @param client The TEVM memory client for accessing storage data
 */
function createStorageAdapter<T extends string = string, Types extends SolcStorageLayoutTypes = SolcStorageLayoutTypes>(
  storageItem: SolcStorageLayoutItem<Types>,
  types: Types,
  client?: MemoryClient,
  address?: Address,
): StorageAdapter<T, Types> {
  const type = types[storageItem.type] as SolcStorageLayoutTypeBase;

  if (type.encoding === "mapping") {
    return new MappingStorageAdapter(storageItem, types, client, address) as StorageAdapter<T, Types>;
  } else if (type.encoding === "bytes") {
    return new StringOrBytesStorageAdapter(storageItem, types, client, address) as StorageAdapter<T, Types>;
  } else if (type.label.startsWith("struct")) {
    return new StructStorageAdapter(storageItem, types, client, address) as StorageAdapter<T, Types>;
  } else if (type.label.includes("[")) {
    return new ArrayStorageAdapter(storageItem, types, client, address) as StorageAdapter<T, Types>;
  } else {
    return new BaseStorageAdapter(storageItem, types, client, address) as StorageAdapter<T, Types>;
  }
}

export const isStorageAdapterType = {
  mapping: <T extends string, Types extends SolcStorageLayoutTypes>(
    adapter: BaseStorageAdapter<T, Types>,
  ): adapter is T extends `mapping(${string} => ${string})` ? MappingStorageAdapter<T, Types> : never => {
    return adapter.encoding === "mapping";
  },
  bytes: <T extends string, Types extends SolcStorageLayoutTypes>(
    adapter: BaseStorageAdapter<T, Types>,
  ): adapter is T extends "string" | "bytes" ? StringOrBytesStorageAdapter<T, Types> : never => {
    return adapter.encoding === "bytes";
  },
  struct: <T extends string, Types extends SolcStorageLayoutTypes>(
    adapter: BaseStorageAdapter<T, Types>,
  ): adapter is T extends `struct ${string}` ? StructStorageAdapter<T, Types> : never => {
    return adapter.type.startsWith("struct");
  },
  array: <T extends string, Types extends SolcStorageLayoutTypes>(
    adapter: BaseStorageAdapter<T, Types>,
  ): adapter is T extends `${string}[]` | `${string}[${string}]` ? ArrayStorageAdapter<T, Types> : never => {
    return adapter.type.includes("[");
  },
};

/* -------------------------------------------------------------------------- */
/*                              MAIN EXPORT                                   */
/* -------------------------------------------------------------------------- */

/** A fully typed storage layout adapter providing enhanced access to contract storage */
export type StorageLayoutAdapter<T extends DeepReadonly<SolcStorageLayout> = SolcStorageLayout> = {
  [Variable in T["storage"][number] as Variable["label"]]: StorageAdapter<
    ParseSolidityType<Variable["type"], T["types"]>,
    T["types"]
  >;
};

/**
 * Create a comprehensive storage layout adapter from a Solidity storage layout
 *
 * This function processes the raw Solidity storage layout into a full-featured adapter with methods for accessing and
 * manipulating storage data. It handles all Solidity storage types including:
 *
 * - Basic types (uint, int, address, bool, etc.)
 * - Arrays (both static and dynamic)
 * - Mappings (including nested mappings)
 * - Structs (including nested structs)
 *
 * @param layout The Solidity storage layout
 * @param client The TEVM memory client to use for storage access
 * @param address The address of the contract to access storage for
 * @returns An adapter object with methods to access and manipulate storage data
 */
export const createStorageLayoutAdapter = <T extends DeepReadonly<SolcStorageLayout>>(
  layout: T,
  client?: MemoryClient,
  address?: Address,
): StorageLayoutAdapter<T> => {
  return layout.storage.map((storageItem) =>
    createStorageAdapter(storageItem, layout.types, client, address),
  ) as StorageLayoutAdapter<T>;
};
