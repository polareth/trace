import { Address, Hex, hexToBigInt, isHex, keccak256, toHex } from "tevm";
import { abi } from "@shazow/whatsabi";
import { AbiType, AbiTypeToPrimitiveType } from "abitype";
import { decodeAbiParameters, encodeAbiParameters, padHex } from "viem";

import { isStorageAdapterType, StorageAdapter, StorageLayoutAdapter } from "@/lib/adapter";
import { findMappingMatch } from "@/lib/slots/mapping";
import { MappingKey, SlotLabelResult } from "@/lib/types";

/**
 * A slot computation engine that implements Solidity's storage layout rules to accurately compute and label storage
 * slots.
 */

/** Extract values from a transaction trace that might be used as keys or indices */
export const extractPotentialKeys = (
  trace: {
    uniqueStackValues?: Array<string>;
    relevantOps?: Array<{
      op: string;
      stack: Array<string>;
    }>;
  },
  addresses: Array<Address>,
  abiFunctions: Array<abi.ABIFunction>,
  txData?: Hex,
): MappingKey[] => {
  const keys: MappingKey[] = [];

  // Add touched addresses
  addresses.forEach((address) => {
    keys.push({
      hex: padHex(address, { size: 32 }),
      decoded: address,
      type: "address",
    });
  });

  // Extract parameters from transaction data
  if (txData && txData.length > 10) {
    const selector = txData.slice(0, 10);
    const inputs = abiFunctions.find((fn) => fn.selector === selector)?.inputs;

    if (inputs) {
      // Decode function inputs
      const params = decodeAbiParameters(inputs, `0x${txData.slice(10)}`);

      params.forEach((param, index) => {
        // If it's an array, add each element as a key
        if (Array.isArray(param)) {
          param.forEach((p) => {
            const type = inputs[index].type.replace("[]", "") as AbiType;

            if (type) {
              keys.push({
                hex: padHex(encodeAbiParameters([{ type }], [p]), { size: 32 }),
                decoded: p as AbiTypeToPrimitiveType<typeof type>,
                type,
              });
            }
          });
        } else {
          // Otherwise just add the key straight up
          const type = inputs[index].type as AbiType;

          if (type) {
            keys.push({
              hex: padHex(encodeAbiParameters([{ type }], [param]), { size: 32 }),
              decoded: param as AbiTypeToPrimitiveType<typeof type>,
              type,
            });
          }
        }
      });
    }
  }

  // Process stack values from the trace
  if (trace.uniqueStackValues?.length) {
    // Process unique stack values directly
    for (const stackValue of trace.uniqueStackValues) {
      keys.push({
        hex: isHex(stackValue) ? padHex(stackValue, { size: 32 }) : toHex(stackValue, { size: 32 }),
        type: undefined,
      });
    }
  }

  // Deduplicate keys
  const uniqueMap = new Map();
  // Add the new key only if it's not already in the map (and don't replace a key with a defined type)
  keys.forEach((k) => {
    if (!uniqueMap.has(k.hex) || k.type) uniqueMap.set(k.hex, k);
  });

  return Array.from(uniqueMap.values()).sort((a, b) => {
    // prefer address as it's more likely to be a key
    if (a.type === "address") return -1;
    if (b.type === "address") return 1;
    // prefer defined types
    if (a.type === undefined) return 1;
    if (b.type === undefined) return -1;

    return 0;
  });
};

/**
 * Finds all matching labels for a storage slot, including packed variables Using the StorageLayoutAdapter approach
 *
 * @param slot The storage slot to find information for
 * @param adapter A storage layout adapter
 * @param potentialKeys Potential mapping keys or array indices from the transaction
 * @returns Array of labeled slot results
 */
export const findLayoutInfoAtSlot = (
  slot: Hex,
  adapter: StorageLayoutAdapter,
  potentialKeys: MappingKey[],
): SlotLabelResult[] => {
  // Get all storage variables
  const variables = Object.values(adapter);

  // 1. Check for all direct variable matches at this slot (packed or unpacked)
  // TODO: if it's a bytes type we're missing some data that is on the next slot, the whole thing is broken (maybe if that's the type iterate slots? the next slots will probably also be marked in the access list)
  const directMatches = variables.filter((v) => v.getSlot() === slot);
  if (directMatches.length > 0) {
    // Return direct matches
    return (
      directMatches
        // Sort by offset to ensure consistent order (helps when there are packed variables)
        .sort((a, b) => (a.storageItem.offset ?? 0) - (b.storageItem.offset ?? 0))
        .map((v) => ({
          label: v.label,
          slot,
          matchType: "exact",
          type: v.type,
          offset: v.storageItem.offset,
        }))
    );
  }

  // 2. Check for mapping matches
  const mappings = variables.filter(
    isStorageAdapterType.mapping,
  ) as StorageAdapter<`mapping(${string} => ${string})`>[];

  for (const mapping of mappings) {
    // Try to find a match using our unified function
    const slotInfo = findMappingMatch(mapping.label, slot, mapping, potentialKeys, adapter);
    if (slotInfo) return [slotInfo];
  }

  // TODO: 3. Check for array matches
  // -> should actually provide the provider to adapters, so for arrays we can get the length (hope it was not manipulated), and get slots for all existing indexes (+1 in case an item was removed??)

  // TODO: 4. Check for struct matches

  // If no matches found, use generic variable name
  return [
    {
      label: `var_${slot.slice(0, 10)}`,
      slot: slot,
      matchType: "exact",
      type: undefined,
    },
  ];
};
