import { SolcStorageLayoutTypes } from "tevm/bundler/solc";
import { AbiType, AbiTypeToPrimitiveType } from "abitype";

/* -------------------------------------------------------------------------- */
/*                              TYPE HELPERS                                  */
/* -------------------------------------------------------------------------- */

/** Makes all properties of an object readonly deeply */
export type DeepReadonly<T> = T extends (infer R)[]
  ? ReadonlyArray<DeepReadonly<R>>
  : T extends Function
    ? T
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** Extract the final value type from a Solidity type ID */
export type ParseSolidityType<TypeId extends string, Types extends SolcStorageLayoutTypes> = TypeId extends keyof Types
  ? Types[TypeId] extends { label: infer Label extends string }
    ? Label
    : never
  : TypeId;

/* -------------------------------------------------------------------------- */
/*                           TYPE EXTRACTION UTILITIES                        */
/* -------------------------------------------------------------------------- */

/** Extract key type from a mapping declaration */
export type ExtractMappingKeyType<T extends string> = T extends `mapping(${infer KeyType} => ${string})`
  ? KeyType
  : never;

/** Extract value type from a mapping declaration */
export type ExtractMappingValueType<T extends string> = T extends `mapping(${string} => ${infer ValueType})`
  ? ValueType
  : never;

/** Extract base type from an array declaration */
export type ExtractArrayBaseType<T extends string> = T extends `${infer BaseType}[]` | `${infer BaseType}[${string}]`
  ? BaseType
  : never;

/** Get the Solidity key type and convert to appropriate TS type */
export type SolidityKeyToTsType<KeyType extends string, Types extends SolcStorageLayoutTypes> = KeyType extends AbiType
  ? AbiTypeToPrimitiveType<KeyType>
  : KeyType extends `t_${infer SolidityType}`
    ? SolidityType extends AbiType
      ? AbiTypeToPrimitiveType<SolidityType>
      : any
    : any;

/* -------------------------------------------------------------------------- */
/*                           STORAGE DATA TYPE MAPPING                        */
/* -------------------------------------------------------------------------- */

/** Map Solidity types to TypeScript return types */
export type SolidityTypeToTsType<T extends string, Types extends SolcStorageLayoutTypes> =
  // Handle primitive types
  T extends AbiType
    ? AbiTypeToPrimitiveType<T>
    : // Handle struct types
      T extends `struct ${string}`
      ? StructToObject<T, Types>
      : // Handle arrays
        T extends `${string}[]` | `${string}[${string}]`
        ? SolidityTypeToTsType<ExtractArrayBaseType<T>, Types>[]
        : // Handle mappings (return value type)
          T extends `mapping(${string} => ${string})`
          ? SolidityTypeToTsType<ExtractMappingValueType<T>, Types>
          : // Handle bytes/string
            T extends "bytes" | "string"
            ? string
            : // Default case
              unknown;

/** Convert a struct type to an object with fields */
export type StructToObject<StructName extends string, Types extends Record<string, any>> = {
  // TODO: replace with SolcStorageLayoutTypes and fix label index
  [TypeId in keyof Types]: Types[TypeId]["label"] extends StructName
    ? Types[TypeId] extends { members: readonly any[] }
      ? // TODO: properties are optional as for now we don't fetch members that were not in the trace
        Partial<{
          [Member in Types[TypeId]["members"][number] as Member["label"]]: SolidityTypeToTsType<
            ParseSolidityType<Member["type"], Types>,
            Types
          >;
        }>
      : never
    : never;
}[keyof Types];

/* -------------------------------------------------------------------------- */
/*                            MAPPING TYPE HELPERS                            */
/* -------------------------------------------------------------------------- */

/** Extract mapping key types with their corresponding TypeScript types */
export type GetMappingKeyTypePairs<
  T extends string,
  Types extends SolcStorageLayoutTypes,
  Result extends readonly [string, any][] = [],
> = T extends `mapping(${infer KeyType} => ${infer ValueType})`
  ? ValueType extends `mapping(${string} => ${string})`
    ? GetMappingKeyTypePairs<ValueType, Types, [...Result, [KeyType, SolidityKeyToTsType<KeyType, Types>]]>
    : [...Result, [KeyType, SolidityKeyToTsType<KeyType, Types>]]
  : Result;

/** Get just the Solidity type strings for mapping keys as a tuple */
export type GetMappingKeyTypes<T extends string, Types extends SolcStorageLayoutTypes> =
  GetMappingKeyTypePairs<T, Types> extends readonly [...infer Pairs]
    ? { [K in keyof Pairs]: Pairs[K] extends [infer SolType, any] ? SolType : never }
    : [];

/** Get just the TypeScript types for mapping keys as a tuple */
export type GetMappingKeyTsTypes<T extends string, Types extends SolcStorageLayoutTypes> =
  GetMappingKeyTypePairs<T, Types> extends readonly [...infer Pairs]
    ? { [K in keyof Pairs]: Pairs[K] extends [string, infer TsType] ? TsType : never }
    : [];

/**
 * Create a tuple type of mapping keys with their types (for display/debugging) Each element has both type and value
 * properties
 */
export type GetMappingKeysTuple<T extends string, Types extends SolcStorageLayoutTypes> =
  GetMappingKeyTypePairs<T, Types> extends readonly [...infer Pairs]
    ? {
        [K in keyof Pairs]: Pairs[K] extends [infer SolType, infer TsType] ? { type: SolType; value: TsType } : never;
      }
    : [];

/* -------------------------------------------------------------------------- */
/*                                 PARAMETERS                                 */
/* -------------------------------------------------------------------------- */

/** Parameters for array getData operations */
type ArrayDataParams =
  | { index: number } // Get single item
  | { startIndex: number; endIndex: number } // Get range
  | { indexes: number[] }; // Get multiple items

/** Parameters for getData based on type */
export type GetDataParams<T extends string, Types extends SolcStorageLayoutTypes> =
  // Mappings with typed keys
  T extends `mapping(${string} => ${string})`
    ? { keys: GetMappingKeyTsTypes<T, Types> }
    : // Arrays with flexible access patterns
      T extends `${string}[]` | `${string}[${string}]`
      ? ArrayDataParams
      : // Default (empty params)
        Record<string, never>;

/** Parameters for getSlot based on type */
export type GetSlotParams<T extends string, Types extends SolcStorageLayoutTypes> =
  // For mappings with typed keys
  T extends `mapping(${string} => ${string})`
    ? { keys: GetMappingKeyTsTypes<T, Types> }
    : // Arrays need index
      T extends `${string}[]` | `${string}[${string}]`
      ? { index: number }
      : // Default (empty params)
        Record<string, never>;

/* -------------------------------------------------------------------------- */
/*                               RETURN TYPES                                 */
/* -------------------------------------------------------------------------- */

/** Get return type based on access pattern */
type ArrayDataReturnType<
  BaseType extends string,
  Types extends SolcStorageLayoutTypes,
  Params extends ArrayDataParams,
> = Params extends { index: number } ? SolidityTypeToTsType<BaseType, Types> : SolidityTypeToTsType<BaseType, Types>[];

/** Get return type for getData based on type and params */
export type GetDataReturnType<
  T extends string,
  Types extends SolcStorageLayoutTypes,
  Params extends GetDataParams<T, Types>,
> =
  // For arrays, return depends on access pattern
  T extends `${infer BaseType}[]` | `${infer BaseType}[${string}]`
    ? Params extends ArrayDataParams
      ? ArrayDataReturnType<BaseType, Types, Params>
      : never
    : // For other types, standard conversion
      SolidityTypeToTsType<T, Types>;

// TODO: type recursively for nested complex types (but no logic for that yet)
export type DecodedSnapshot<T extends string, Types extends SolcStorageLayoutTypes> = T extends
  | `${infer BaseType}[]`
  | `${infer BaseType}[${string}]`
  ? { index: number; value: SolidityTypeToTsType<BaseType, Types> }
  : T extends `struct ${string}`
    ? StructField<T, Types>
    : SolidityTypeToTsType<T, Types>;

type StructField<T extends string, Types extends SolcStorageLayoutTypes, K = keyof StructToObject<T, Types>> = {
  member: K;
  value: StructToObject<T, Types>[K];
};

/* -------------------------------------------------------------------------- */
/*                              STORAGE VARIABLE                              */
/* -------------------------------------------------------------------------- */

/** A storage adapter with type-safe methods - base interface */
// TODO: will probably not use these if we use the classes
// interface BaseStorageAdapter<T extends string, Types extends SolcStorageLayoutTypes> {
//   /** Type information about this storage variable */
//   type: SolidityKeyToTsType<T, Types>;

//   /** Encoding type of this storage variable */
//   encoding: SolcStorageLayoutTypeBase["encoding"];

//   /** Number of bytes used by this storage variable */
//   byteLength: number;

//   /** Optional offset of this storage variable within its slot */
//   offset?: number;

//   /**
//    * Get the slot for this variable or its nested elements
//    *
//    * - For static arrays: baseSlot + index
//    * - For dynamic arrays: keccak256(baseSlot) + index
//    */
//   getSlot(params?: GetSlotParams<T, Types>): Hex;

//   /** Get the data stored at this location - asynchronous since it accesses storage */
//   getData<P extends GetDataParams<T, Types>>(params?: P): Promise<GetDataReturnType<T, Types, P>>;
// }

// /** Storage adapter interface for array types with additional methods */
// interface ArrayStorageAdapter<T extends string, Types extends SolcStorageLayoutTypes>
//   extends BaseStorageAdapter<T, Types> {
//   /** The base type of items in this array */
//   base: ExtractArrayBaseType<T>;

//   /** Get the length of the array */
//   getLength(): Promise<bigint>;
// }

// /** Storage adapter interface for mapping types with additional methods */
// interface MappingStorageAdapter<T extends string, Types extends SolcStorageLayoutTypes>
//   extends BaseStorageAdapter<T, Types> {
//   /** The Solidity types of the keys for this mapping */
//   keys: GetMappingKeyTypes<T, Types>;
// }

// /** Storage adapter interface for struct types with additional methods */
// interface StructStorageAdapter<T extends string, Types extends SolcStorageLayoutTypes>
//   extends BaseStorageAdapter<T, Types> {
//   /** The Solidity types of the fields for this struct */
//   fields: StructToObject<T, Types>;
// }

/** Storage variable with conditional array methods */
// export type StorageAdapter<T extends string, Types extends SolcStorageLayoutTypes> = T extends
//   | `${string}[]`
//   | `${string}[${string}]`
//   ? ArrayStorageAdapter<T, Types>
//   : T extends `mapping(${string} => ${string})`
//     ? MappingStorageAdapter<T, Types>
//     : T extends `struct ${string}`
//       ? StructStorageAdapter<T, Types>
//       : BaseStorageAdapter<T, Types>;
