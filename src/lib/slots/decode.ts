import {
  SolcStorageLayoutBytesType,
  SolcStorageLayoutInplaceType,
  SolcStorageLayoutItem,
  SolcStorageLayoutMappingType,
  SolcStorageLayoutStructType,
  SolcStorageLayoutTypeBase,
  SolcStorageLayoutTypes,
} from "tevm/bundler/solc";
import { decodeAbiParameters, Hex, hexToBigInt, hexToString, keccak256, padHex, toHex } from "viem";

import { debug } from "@/debug";
import { ExtractMappingValueType, GetMappingKeyTypes, SolidityKeyToTsType } from "@/lib/adapter/types";
import { findMappingMatch } from "@/lib/slots/mapping";
import { LabeledStorageAccess, MappingKey, StorageDiff } from "@/lib/types";

export const decode = <T extends SolcStorageLayoutTypes>(
  storageTrace: StorageDiff,
  storageItems: Array<SolcStorageLayoutItem<T>>,
  types: T,
  potentialKeys: Array<MappingKey>,
) => {
  const byType = getItemsByType(storageItems, types);
  let unexploredSlots: Set<Hex> = new Set([...Object.keys(storageTrace)] as Array<Hex>);

  // 1. Decode any primitive that has its slot in the trace
  const primitives = handlePrimitives(storageTrace, byType.primitives, types, unexploredSlots);
  // 2. Same for structs (keep the original unexplored slots because it could be packed in the same slot as a primitive)
  const structs = handleStructs(storageTrace, byType.structs, types, unexploredSlots);
  // 3. Same for bytes (string or bytes)
  const bytes = handleBytes(storageTrace, byType.bytes, types, unexploredSlots);

  // 4. Remove occupied slots from unexplored slots
  Object.values(primitives).forEach(({ trace: { slots } }) => slots.forEach((slot) => unexploredSlots.delete(slot)));
  Object.values(structs).forEach(({ trace: { slots } }) => slots.forEach((slot) => unexploredSlots.delete(slot)));
  Object.values(bytes).forEach(({ trace: { slots } }) => slots.forEach((slot) => unexploredSlots.delete(slot)));

  // 5. Try to retrieve mapping slots and decode them
  const mappings = handleMappings(storageTrace, byType.mappings, types, unexploredSlots, potentialKeys);
  // and directly remove any computed slot from unexplored slots
  Object.values(mappings).forEach(({ trace }) =>
    trace.forEach(({ slots }) => slots.forEach((slot) => unexploredSlots.delete(slot))),
  );

  return {
    decoded: { ...primitives, ...structs, ...bytes, ...mappings } as Record<string, LabeledStorageAccess>,
    unexploredSlots,
  };
};

const getItemsByType = <T extends SolcStorageLayoutTypes>(storageItems: Array<SolcStorageLayoutItem<T>>, types: T) => ({
  primitives: storageItems.filter((item) =>
    Object.entries(types).find(
      ([typeId, type]) => item.type === typeId && type.encoding === "inplace" && !type.label.startsWith("struct"),
    ),
  ),
  structs: storageItems.filter((item) =>
    Object.entries(types).find(([typeId, type]) => item.type === typeId && type.label.startsWith("struct")),
  ),
  bytes: storageItems.filter((item) =>
    Object.entries(types).find(([typeId, type]) => item.type === typeId && type.encoding === "bytes"),
  ),
  mappings: storageItems
    .filter((item) =>
      Object.entries(types).find(([typeId, type]) => item.type === typeId && type.encoding === "mapping"),
    )
    // sort from lowest to highest level of nesting
    .sort((a, b) => nestingLevel(a.type.toString()) - nestingLevel(b.type.toString())),
  arrays: {
    static: storageItems.filter((item) =>
      Object.entries(types).find(([typeId, type]) => item.type === typeId && type.label.match(/\[\d+\]$/)),
    ),
    dynamic: storageItems.filter((item) =>
      Object.entries(types).find(([typeId, type]) => item.type === typeId && type.encoding === "dynamic_array"),
    ),
  },
});

/* -------------------------------- PRIMITIVE ------------------------------- */
const handlePrimitives = <T extends SolcStorageLayoutTypes>(
  storageTrace: StorageDiff,
  primitives: Array<SolcStorageLayoutItem<T>>,
  types: T,
  unexploredSlots: Set<Hex>,
): Record<string, LabeledStorageAccess> => {
  const touchedPrimitives = primitives.filter((item) => unexploredSlots.has(toHex(BigInt(item.slot), { size: 32 })));
  return Object.fromEntries(
    touchedPrimitives.map((item) => [
      item.label,
      cleanTrace({
        trace: {
          ...decodePrimitive(
            storageTrace[toHex(BigInt(item.slot), { size: 32 })],
            types[item.type] as SolcStorageLayoutInplaceType,
            item.offset,
          ),
          slots: [toHex(BigInt(item.slot), { size: 32 })],
        },
        label: item.label,
        type: (types[item.type] as SolcStorageLayoutInplaceType).label,
        offset: item.offset,
        kind: "primitive" as const,
      }),
    ]),
  );
};

const decodePrimitive = <T extends SolcStorageLayoutTypes, I extends SolcStorageLayoutItem<T>>(
  storage: StorageDiff[Hex],
  typeInfo: SolcStorageLayoutInplaceType,
  offset?: number,
) => {
  const current = _decodePrimitive(storage.current, typeInfo.label, offset, Number(typeInfo.numberOfBytes));
  const next =
    storage.next && storage.next !== storage.current
      ? _decodePrimitive(storage.next, typeInfo.label, offset, Number(typeInfo.numberOfBytes))
      : undefined;
  const modified = next !== undefined && next !== current;

  return {
    current,
    next: modified ? next : undefined,
    modified,
  };
};

/* --------------------------------- STRUCTS -------------------------------- */
const handleStructs = <T extends SolcStorageLayoutTypes>(
  storageTrace: StorageDiff,
  structs: Array<SolcStorageLayoutItem<T>>,
  types: T,
  unexploredSlots: Set<Hex>,
): Record<string, LabeledStorageAccess> => {
  return Object.fromEntries(
    structs
      .map((item) => {
        const typeInfo = types[item.type] as SolcStorageLayoutStructType;

        // Extract current and next storage for each slot
        const currentStorage = Object.fromEntries(
          Object.entries(storageTrace).map(([slot, data]) => [slot, data.current]),
        );
        const nextStorage = Object.fromEntries(Object.entries(storageTrace).map(([slot, data]) => [slot, data.next]));

        // Extract struct members from the current storage
        const extractedMembers = extractStructMembers(currentStorage, item.slot, item.offset, typeInfo.members, types);

        const occupiedSlots = extractedMembers.map((member) => member.slot);
        const commonSlots = [...unexploredSlots].filter((slot) => occupiedSlots.includes(slot));

        // If no occupied slot is included in the unexplored slots, this struct was not touched
        if (commonSlots.length === 0) return [item.label, undefined];

        // If the struct was touched, we might not have all the storage available
        // Usually, we access an entire struct so every occupied slot should be included,
        // but if it was read/modified e.g. with assembly, it could only be partial (?)
        // In such case, we'll just ignore the missing slots and create the object with all available members (later we might want to fetch missing storage from the contract)
        return [
          item.label,
          cleanTrace({
            trace: {
              ...decodeStruct(
                extractedMembers.map((member) => ({
                  slot: member.slot,
                  current: member.data,
                  params: member.params,
                  next: nextStorage[member.slot],
                })),
              ),
              slots: extractedMembers.map((member) => member.slot),
            },
            label: item.label,
            type: typeInfo.label,
            offset: item.offset,
            kind: "struct" as const,
          }),
        ];
      })
      .filter(([_, value]) => value !== undefined),
  );
};

/**
 * Decodes the struct members from the organized slot data into the expected trace format
 *
 * @param slotData - Organized slot data with member information
 * @returns Decoded struct trace with current and next values
 */
const decodeStruct = (
  slotData: Array<{
    slot: Hex;
    current: Hex | undefined;
    next: Hex | undefined;
    params: Array<{
      name: string;
      type: string;
      offset: number;
      size: number;
    }>;
  }>,
) => {
  const current: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  let modified = false;

  // We're decoding each member separately instead of decoding the whole struct at once to account for the potential initial slot offset
  slotData.forEach(({ params, current: currentHex, next: nextHex }) => {
    if (!currentHex) return;

    params.forEach(({ name, type, offset, size }) => {
      const decode = (hex: Hex) => {
        try {
          // Extract the relevant portion of the slot data for this member
          const extractedHex = extractRelevantHex(hex, offset, size);
          return decodeAbiParameters([{ type }], extractedHex)[0];
        } catch (error) {
          debug(`Error decoding ${name} of type ${type}:`, error);
          return undefined;
        }
      };

      // Decode current value
      const currentValue = decode(currentHex);
      current[name] = currentValue;

      // Decode next value if it exists and is different
      if (nextHex && nextHex !== currentHex) {
        const nextValue = decode(nextHex);
        if (nextValue !== currentValue) {
          next[name] = nextValue;
          modified = true;
        }
      }
    });
  });

  return {
    current,
    next: modified ? next : undefined,
    modified,
  };
};

/**
 * Extracts and organizes struct member data from storage slots
 *
 * @param storageData - Object mapping slot addresses to their hex data
 * @param baseSlot - The starting slot of the struct
 * @param baseOffset - The offset within the starting slot
 * @param members - Array of struct members with their types and sizes
 * @param types - Type definitions from the storage layout
 * @returns Organized data by slot with member information
 */
export const extractStructMembers = <T extends SolcStorageLayoutTypes>(
  storageData: Record<Hex, Hex>,
  baseSlot: string | number | bigint,
  baseOffset: number,
  members: Array<{ label: string; type: string; offset: number; slot?: string }>,
  types: T,
) => {
  const baseSlotBigInt = BigInt(baseSlot);
  const slotSize = 32; // 32 bytes per slot

  // Initialize result structure
  const result: {
    [slot: string]: {
      slotHex: Hex;
      data: Hex | undefined;
      members: Array<{
        name: string;
        type: string;
        offset: number;
        size: number;
        slotOffset: number; // Relative to the base slot
      }>;
    };
  } = {};

  // Process each member
  let currentSlotOffset = 0;
  let currentOffset = baseOffset;

  members.forEach(({ label, type }) => {
    const typeInfo = types[type as keyof T] as SolcStorageLayoutTypeBase;
    if (!typeInfo) throw new Error(`Type information not found for ${type}`);

    const memberSize = Number(typeInfo.numberOfBytes);

    // Check if this member needs to start in a new slot
    // This happens if it doesn't fit in the current slot or if it's a special type
    if (
      // Current slot doesn't have enough space
      currentOffset + memberSize > slotSize ||
      // Dynamic types or reference types always start at a new slot
      typeInfo.encoding === "dynamic_array" ||
      typeInfo.encoding === "bytes" ||
      typeInfo.encoding === "mapping" ||
      // Structs that don't fit in the remaining space start at a new slot
      (typeInfo.label.startsWith("struct") && currentOffset % slotSize !== 0 && memberSize > slotSize - currentOffset)
    ) {
      // Move to the next slot and reset offset within slot
      currentSlotOffset++;
      currentOffset = 0;
    }

    // Calculate the actual slot for this member
    const memberSlot = toHex(baseSlotBigInt + BigInt(currentSlotOffset), { size: 32 });

    // Initialize the slot in our result if it doesn't exist
    if (!result[memberSlot]) {
      result[memberSlot] = {
        slotHex: memberSlot,
        data: storageData[memberSlot], // will be undefined if not in the trace
        members: [],
      };
    }

    // Add this member to the appropriate slot
    result[memberSlot].members.push({
      name: label,
      type,
      offset: currentOffset,
      size: memberSize,
      slotOffset: currentSlotOffset,
    });

    // Update the offset for the next member
    currentOffset += memberSize;

    // If we've filled the current slot, move to the next one
    if (currentOffset >= slotSize) {
      currentSlotOffset += Math.floor(currentOffset / slotSize);
      currentOffset = currentOffset % slotSize;
    }
  });

  // Prepare the data for decodeAbiParameters
  // For each slot, create a tuple of the members in that slot
  const decodableSlots = Object.values(result).map((slot) => {
    // For each slot, we'll create parameter definitions for decodeAbiParameters
    const paramTypes = slot.members.map((member) => {
      const typeInfo = types[member.type as keyof T] as SolcStorageLayoutInplaceType;
      // Convert Solidity type to ABI type
      let abiType = typeInfo.label;

      // Handle special cases for ABI encoding
      if (typeInfo.encoding === "inplace") {
        // For basic types, we can use the label directly
        // But we need to extract the correct portion of the slot data
        return {
          name: member.name,
          type: abiType,
          offset: member.offset,
          size: member.size,
        };
      } else {
        // TODO: handle complex types; idea is to be able to recursively handle based on all the handlers/decoders we have
        return {
          name: member.name,
          type: abiType,
          offset: member.offset,
          size: member.size,
        };
      }
    });

    return {
      slot: slot.slotHex,
      data: slot.data,
      params: paramTypes,
    };
  });

  return decodableSlots;
};

/* ---------------------------------- BYTES --------------------------------- */
const handleBytes = <T extends SolcStorageLayoutTypes>(
  storageTrace: StorageDiff,
  bytes: Array<SolcStorageLayoutItem<T>>,
  types: T,
  unexploredSlots: Set<Hex>,
): Record<string, LabeledStorageAccess> => {
  // We don't filter by unexplored slots yet because the bytes might have changed but its length not
  const decodedBytes = bytes.map((item) => decodeBytes(storageTrace, item, types, unexploredSlots));
  // Filter out undefined results (where we couldn't decode the bytes)
  return Object.fromEntries(
    decodedBytes
      .filter((result): result is NonNullable<typeof result> => result !== undefined)
      .map((bytes) => [bytes.label, cleanTrace(bytes)]),
  );
};

const decodeBytes = <T extends SolcStorageLayoutTypes>(
  storageTrace: StorageDiff,
  item: SolcStorageLayoutItem<T>,
  types: T,
  unexploredSlots: Set<Hex>,
) => {
  const baseSlot = toHex(BigInt(item.slot), { size: 32 });
  const baseSlotData = storageTrace[baseSlot];

  if (!baseSlotData) return undefined;

  // Get the current and next length of the bytes
  const currentLength = getBytesLength(baseSlotData.current);
  const nextLength = baseSlotData.next ? getBytesLength(baseSlotData.next) : undefined;

  // Use the maximum length to determine all slots we need to check
  const maxLength = Math.max(currentLength, nextLength || 0);

  // Early return for empty bytes
  if (maxLength === 0) {
    // Check if the base slot is in unexplored slots
    if (!unexploredSlots.has(baseSlot)) return undefined;

    return {
      trace: {
        current: "",
        next: nextLength !== undefined && nextLength !== currentLength ? "" : undefined,
        slots: [baseSlot],
      },
      label: item.label,
      type: (types[item.type] as SolcStorageLayoutBytesType).label,
      offset: item.offset,
      kind: "bytes" as const,
    };
  }

  // Calculate how many slots this bytes occupies
  const slotsNeeded = Math.ceil(maxLength / 32);

  // Get all slots that should contain this bytes data
  const occupiedSlots: Hex[] = [baseSlot];

  // For long bytes, add the data slots
  if (maxLength >= 32) {
    const baseHash = keccak256(baseSlot);
    for (let i = 0; i < slotsNeeded; i++) {
      const dataSlot = toHex(hexToBigInt(baseHash) + BigInt(i), { size: 32 });
      occupiedSlots.push(dataSlot);
    }
  }

  // Check if any of the required slots are missing from the trace
  for (const slot of occupiedSlots) {
    if (!storageTrace[slot]) {
      debug(`Missing slot ${slot} for bytes at ${baseSlot}`);
      return undefined;
    }
  }

  // Check if any of the occupied slots are in the unexplored slots
  let hasRelevantSlot = false;
  for (const slot of occupiedSlots) {
    if (unexploredSlots.has(slot)) {
      hasRelevantSlot = true;
      break;
    }
  }

  if (!hasRelevantSlot) return undefined;

  // Extract the current bytes data
  const currentBytes = extractBytesData(storageTrace, baseSlot, currentLength);

  // Extract the next bytes data if it exists and is different
  const nextBytes =
    nextLength !== undefined && nextLength !== currentLength
      ? extractBytesData(storageTrace, baseSlot, nextLength, true)
      : undefined;

  // Determine which slots are relevant (in unexplored slots)
  const relevantSlots = occupiedSlots.filter((slot) => unexploredSlots.has(slot));

  // Determine if this is a string or bytes type
  const typeInfo = types[item.type] as SolcStorageLayoutBytesType;
  const isString = typeInfo.label === "string";

  return {
    trace: {
      current: isString ? hexToString(currentBytes) : currentBytes,
      next: nextBytes !== undefined ? (isString ? hexToString(nextBytes) : nextBytes) : undefined,
      slots: relevantSlots,
    },
    label: item.label,
    type: typeInfo.label,
    offset: item.offset,
    kind: "bytes" as const,
  };
};

/** Extracts the length of a bytes/string from its storage slot */
const getBytesLength = (slotData: Hex): number => {
  const slotValue = hexToBigInt(slotData);

  // Check if the bytes is long (lowest bit is set)
  if (slotValue & 1n) {
    // Long bytes: length is (value - 1) / 2
    return Number((slotValue - 1n) >> 1n);
  } else {
    // Short bytes: length is value / 2
    return Number(slotValue >> 1n);
  }
};

/** Extracts bytes data from storage slots */
const extractBytesData = (storageTrace: StorageDiff, baseSlot: Hex, length: number, useNext: boolean = false): Hex => {
  // Handle empty bytes
  if (length === 0) return "0x" as Hex;

  const slotData = useNext ? storageTrace[baseSlot].next! : storageTrace[baseSlot].current;

  // Check if this is a short bytes (< 32 bytes)
  if (length < 32) {
    // For short bytes, the data is stored in the higher-order bytes
    // Remove 0x prefix, then take the first (length * 2) characters
    const hexWithoutPrefix = slotData.slice(2);
    // The data is left-aligned, so we take from the beginning
    return `0x${hexWithoutPrefix.slice(0, length * 2)}` as Hex;
  } else {
    // For long bytes, the data is stored starting at keccak256(slot)
    const dataSlots: string[] = [];
    const slotsNeeded = Math.ceil(length / 32);
    const baseHash = keccak256(baseSlot);

    for (let i = 0; i < slotsNeeded; i++) {
      const dataSlot = toHex(hexToBigInt(baseHash) + BigInt(i), { size: 32 });
      const slotData = useNext ? storageTrace[dataSlot].next! : storageTrace[dataSlot].current;
      // Remove 0x prefix for concatenation
      dataSlots.push(slotData.slice(2));
    }

    // Concatenate all data and trim to the correct length
    const fullDataHex = dataSlots.join("");
    // Trim to the exact length needed
    return `0x${fullDataHex.slice(0, length * 2)}` as Hex;
  }
};

/* -------------------------------- MAPPINGS -------------------------------- */

const handleMappings = <T extends `mapping(${string} => ${string})`, Types extends SolcStorageLayoutTypes>(
  storageTrace: StorageDiff,
  mappings: Array<SolcStorageLayoutItem<Types>>,
  types: Types,
  unexploredSlots: Set<Hex>,
  potentialKeys: Array<MappingKey>,
): Record<string, LabeledStorageAccess<string, T>> => {
  // TODO: we're only considering a match at the direct slot of a mapping value BUT if the data occupies multiple slots, we can miss an update
  // also we're only decoding simple values ("primitives"); later we can handle structs, arrays
  return Object.fromEntries(
    mappings
      .map((mapping) => {
        const typeInfo = types[mapping.type] as SolcStorageLayoutMappingType;
        const [keyTypes, valueType] = extractMappingTypes(typeInfo.label);
        const baseSlot = toHex(BigInt(mapping.slot), { size: 32 });

        // This will try to exhaust possible matches for the mapping by using the potential keys
        // Refer to the function directly for details on the tree search
        const matches = findMappingMatch({ baseSlot, keyTypes, valueType }, typeInfo, unexploredSlots, potentialKeys);
        if (matches.length === 0) return [mapping.label, undefined];

        return [
          mapping.label,
          cleanTrace({
            trace: matches
              .sort((a, b) => a.slot.localeCompare(b.slot))
              .map((match) =>
                decodeMappingMatch(storageTrace, mapping, types, { ...typeInfo, keyTypes, valueType }, match),
              ),
            label: mapping.label,
            type: typeInfo.label,
            offset: mapping.offset,
            kind: "mapping" as const,
          }),
        ];
      })
      .filter(([_, value]) => value !== undefined),
  );
};

const decodeMappingMatch = <T extends SolcStorageLayoutTypes>(
  storageTrace: StorageDiff,
  mapping: SolcStorageLayoutItem<T>,
  types: T,
  typeInfo: SolcStorageLayoutMappingType & {
    keyTypes: GetMappingKeyTypes<typeof mapping.label, T>;
    valueType: ExtractMappingValueType<typeof mapping.label>;
  },
  match: { slot: Hex; keys: Array<MappingKey> },
) => {
  const { slot, keys } = match;
  const storage = storageTrace[slot];

  const formattedKeys = keys.map((key) => ({
    type: key.type,
    value: key.decoded ?? (key.type ? _decodePrimitive(key.hex, key.type) : key.hex),
  }));

  // Get the last type (after the last nested mapping, since we handled that already)
  let valueTypeInfo = types[typeInfo.value] as SolcStorageLayoutTypeBase;
  while (valueTypeInfo.label.startsWith("mapping")) {
    valueTypeInfo = types[(valueTypeInfo as SolcStorageLayoutMappingType).value];
  }

  // TODO: this is temporary, we want something much more composable (decoder -> is value primitive? -> if not decoder -> etc)
  if (valueTypeInfo.label.startsWith("struct")) {
    const currentStorage = Object.fromEntries(Object.entries(storageTrace).map(([slot, data]) => [slot, data.current]));
    const nextStorage = Object.fromEntries(Object.entries(storageTrace).map(([slot, data]) => [slot, data.next]));

    const structType = types[typeInfo.value] as SolcStorageLayoutStructType;
    const extractedMembers = extractStructMembers(currentStorage, slot, 0, structType.members, types);

    return {
      ...decodeStruct(
        extractedMembers.map((member) => ({
          slot: member.slot,
          current: member.data,
          params: member.params,
          next: nextStorage[member.slot],
        })),
      ),
      keys: formattedKeys,
      slots: extractedMembers
        .map((member) => member.slot)
        // For now, filter out slots that are not in the trace as they won't be in the state
        .filter((slot) => Object.keys(storageTrace).includes(slot)),
    };
  }

  // TODO: if it's an array

  return {
    ...decodePrimitive(storage, valueTypeInfo as SolcStorageLayoutInplaceType, mapping.offset),
    keys: formattedKeys,
    slots: [match.slot],
  };
};

/**
 * Calculates the nesting level of a mapping type For example:
 *
 * - T_mapping(t_address,t_uint256) has nesting level 1
 * - T_mapping(t_address,t_mapping(t_uint256,t_bool)) has nesting level 2
 *
 * @param item Storage layout item
 * @returns The nesting level of the mapping (1 for simple mappings, >1 for nested mappings)
 */
const nestingLevel = (type: string): number => {
  // Count the number of "t_mapping" occurrences in the type string
  const matches = type.match(/t_mapping/g);
  return matches ? matches.length : 0;
};

const extractMappingTypes = <T extends string, Types extends SolcStorageLayoutTypes>(
  type: T,
): [GetMappingKeyTypes<T, Types>, ExtractMappingValueType<T>] => {
  const keyTypes = [] as GetMappingKeyTypes<T, Types>;
  let currentType = type;

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

  return [keyTypes, currentType as unknown as ExtractMappingValueType<T>];
};

/* -------------------------------------------------------------------------- */
/*                                    UTILS                                   */
/* -------------------------------------------------------------------------- */

const _decodePrimitive = <T extends SolcStorageLayoutTypes>(
  data: Hex,
  type: string,
  offset?: number,
  length?: number,
) => {
  try {
    const extractedHex = extractRelevantHex(data, offset ?? 0, length ?? 32);
    return decodeAbiParameters([{ type }], extractedHex)[0];
  } catch (error) {
    debug(`Error decoding type ${type}:`, error);
    return undefined;
  }
};
/**
 * Extract relevant hex from a hex string based on its offset and length, especially useful for packed variables
 *
 * @param {Hex} data - The hex string
 * @param {number} offset - The offset in bytes from the right where the value starts
 * @param {number} length - The length in bytes of the value to extract
 * @returns {Hex} - The extracted hex substring padded to 32 bytes
 */
const extractRelevantHex = (data: Hex, offset: number, length: number): Hex => {
  if (!data.startsWith("0x")) data = `0x${data}`;
  if (data === "0x" || data === "0x00") return padHex("0x00", { size: 32 });

  // Fill up to 32 bytes
  data = padHex(data, { size: 32, dir: "left" });

  // Calculate start and end positions (in hex characters)
  // Each byte is 2 hex characters, and we need to account for '0x' prefix
  const totalLength = (data.length - 2) / 2; // Length in bytes (excluding 0x prefix)

  // Calculate offset from left
  const offsetFromLeft = totalLength - offset - length;

  // Calculate character positions
  const startPos = offsetFromLeft * 2 + 2; // +2 for '0x' prefix
  const endPos = startPos + length * 2;

  // Extract the substring and add 0x prefix
  return padHex(`0x${data.slice(startPos, endPos)}`, { size: 32 });
};

// A helper function to clean up trace objects by removing undefined or zero values
export const cleanTrace = (obj: any) => {
  const { offset, type, trace, ...rest } = obj;
  const result = { ...rest };

  // Only include offset if it exists and is not zero
  if (offset) result.offset = offset;
  // Only include type if it exists
  if (type !== undefined) result.type = type;

  // Clean up the trace object
  if (trace) {
    // Handle array of traces (for mappings)
    if (Array.isArray(trace)) {
      result.trace = trace.map((item) => {
        const cleanedItem = { ...item };
        // Remove next if it's undefined
        if (cleanedItem.next === undefined) delete cleanedItem.next;
        return cleanedItem;
      });
    }
    // Handle single trace object
    else {
      const cleanedTrace = { ...trace };
      // Remove next if it's undefined
      if (cleanedTrace.next === undefined) delete cleanedTrace.next;
      result.trace = cleanedTrace;
    }
  }

  return result as LabeledStorageAccess;
};
