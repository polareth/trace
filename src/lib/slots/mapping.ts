import { Hex, keccak256 } from "tevm";
import { SolcStorageLayoutItem, SolcStorageLayoutMappingType, SolcStorageLayoutTypes } from "tevm/bundler/solc";
import { AbiType } from "abitype";

import { StorageAdapter, StorageLayoutAdapter } from "@/lib/adapter";
import { MappingKey, SlotLabelResult } from "@/lib/types";

import { ExtractMappingValueType, GetMappingKeyTypes } from "../adapter/types";

// Maximum nesting depth to prevent excessive computation
const NESTED_MAPPINGS_LIMIT = 4;
// Limit the number of explored states to prevent excessive computation
// e.g. with 20 potential keys and a mapping with 2 levels of nesting, there are 20² = 400 possible combinations to check
// -> meaning that the mapping will be fully explored
// with 3 levels of nesting, that jumps to 20³ = 8,000 combinations
// with 4 levels, it would be 20⁴ = 160,000 combinations
// -> meaning that 3 levels would be partially explored, and 4 levels is just too much (this is both pretty rare and unprobable to end up in a match anyway)
// BUT we prioritize address keys, which is the most common key type in mappings, so this is a good compromise
const MAX_EXPLORED_STATES = 5_000;

/**
 * Computes the storage slot for a mapping given the base slot and key
 *
 * `keccak256(abi.encode(key, slot))
 */
export const computeMappingSlot = (baseSlot: Hex, key: Hex): Hex =>
  keccak256(`0x${key.replace("0x", "")}${baseSlot.replace("0x", "")}`);

/**
 * Finds all matching mapping key combinations that produce the target storage slots. Works with both simple mappings
 * and nested mappings. Uses a straightforward and reliable approach focused on direct slot computation.
 *
 * @param variableName The name of the mapping variable
 * @param targetSlot The storage slot we're trying to match
 * @param mapping The mapping adapter containing type information
 * @param potentialKeys Array of potential keys from transaction data
 * @returns Array of SlotLabelResult for all matches found, empty array if none found
 */
export const findMappingMatch = <T extends string, Types extends SolcStorageLayoutTypes>(
  mapping: { baseSlot: Hex; keyTypes: GetMappingKeyTypes<T, Types>; valueType: ExtractMappingValueType<T> },
  typeInfo: SolcStorageLayoutMappingType,
  targetSlots: Set<Hex>,
  potentialKeys: Array<MappingKey>,
): Array<{ slot: Hex; keys: Array<MappingKey> }> => {
  const { baseSlot, keyTypes, valueType } = mapping;
  // Early termination if we have no keys or slots to try
  if (potentialKeys.length === 0 || targetSlots.size === 0) return [];

  const matches: Array<{ slot: Hex; keys: Array<MappingKey> }> = [];
  // Track which slots we've already matched to avoid duplicates
  const matchedSlots = new Set<Hex>();

  // Filter potential keys by their types
  // Address keys are very common in mappings, prioritize them first
  const keysByType: Record<string, MappingKey[]> = {};

  // Group keys by their types
  potentialKeys.forEach((key) => {
    if (key.type) {
      if (!keysByType[key.type]) keysByType[key.type] = [];
      keysByType[key.type].push(key);
    }
  });

  // Check if we have enough address keys for the expected mapping depth
  const addressKeys = keysByType["address"] || [];

  // Special case optimization for nested address => address => ... mappings
  // which is a common pattern in Solidity
  if (keyTypes.every((t) => t === "address") && addressKeys.length >= keyTypes.length) {
    // Try all combinations of address keys with the right count
    if (keyTypes.length === 1) {
      // Single level mapping
      for (const key of addressKeys) {
        const computedSlot = computeMappingSlot(baseSlot, key.hex);
        if (targetSlots.has(computedSlot) && !matchedSlots.has(computedSlot)) {
          matches.push({
            slot: computedSlot,
            keys: [key],
          });
          matchedSlots.add(computedSlot);
        }
      }
    } else {
      // Try permutations for deeper nested mappings
      // Use the test's specific approach to computing nested slots
      const generatePermutations = (
        keys: MappingKey[],
        used: boolean[],
        current: MappingKey[],
        level: number,
        currentSlot: Hex,
      ): void => {
        // If we've used up all levels, stop
        if (level >= keyTypes.length) return;

        // Try each unused key at this level
        for (let i = 0; i < keys.length; i++) {
          if (used[i]) continue;

          // Mark this key as used
          used[i] = true;
          current.push(keys[i]);

          // Compute the next slot
          const nextSlot = computeMappingSlot(currentSlot, keys[i].hex);

          // Check if this gives us the target at the final level
          if (level === keyTypes.length - 1 && targetSlots.has(nextSlot) && !matchedSlots.has(nextSlot)) {
            matches.push({
              slot: nextSlot,
              keys: [...current],
            });
            matchedSlots.add(nextSlot);
          }

          // Recurse to the next level
          generatePermutations(keys, used, current, level + 1, nextSlot);

          // Backtrack
          current.pop();
          used[i] = false;
        }
      };

      // Start with no keys used
      const used = Array(addressKeys.length).fill(false);
      generatePermutations(addressKeys, used, [], 0, baseSlot);
    }
  }

  // For simple mappings with a single key type
  if (keyTypes.length === 1) {
    const expectedKeyType = keyTypes[0];

    // Sort keys by type relevance
    const sortedKeys = [...potentialKeys].sort((a, b) => {
      // Exact type match has highest priority
      if (a.type === expectedKeyType && b.type !== expectedKeyType) return -1;
      if (a.type !== expectedKeyType && b.type === expectedKeyType) return 1;
      // Keys with defined types have next priority
      if (a.type && !b.type) return -1;
      if (!a.type && b.type) return 1;
      return 0;
    });

    // Try direct computation with each key
    for (const key of sortedKeys) {
      const computedSlot = computeMappingSlot(baseSlot, key.hex);

      if (targetSlots.has(computedSlot) && !matchedSlots.has(computedSlot)) {
        matches.push({
          slot: computedSlot,
          keys: [key],
        });
        matchedSlots.add(computedSlot);
      }
    }
  }

  // For nested mappings with multiple key types
  // We'll use BFS without adapter calls, focusing on direct computation
  // Track visited states
  const visited = new Set<string>();

  // Queue for BFS
  const queue: Array<{
    level: number; // Current nesting level
    slot: Hex; // Current slot at this level
    keys: MappingKey[]; // Keys used so far
  }> = [{ level: 0, slot: baseSlot, keys: [] }];
  let statesExplored = 0;

  while (queue.length > 0 && statesExplored < MAX_EXPLORED_STATES) {
    const { level, slot, keys } = queue.shift()!;
    statesExplored++;

    // Create a unique state ID
    const stateId = `${slot}-${level}`;
    if (visited.has(stateId)) continue;
    visited.add(stateId);

    // Stop if we've reached the limit
    if (level >= keyTypes.length || level >= NESTED_MAPPINGS_LIMIT) continue;

    // Get expected key type for this level
    const expectedKeyType = keyTypes[level];

    // Filter valid keys for this level
    const candidateKeys = potentialKeys
      .filter((key) => {
        // Don't reuse keys we've already used
        if (keys.some((uk) => uk.hex === key.hex)) return false;

        // Type compatibility check
        if (key.type && expectedKeyType && key.type !== expectedKeyType) {
          // Special case for addresses
          if (!(expectedKeyType === "address" && key.hex.length === 66)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Prioritize by type relevance
        if (a.type === expectedKeyType && b.type !== expectedKeyType) return -1;
        if (a.type !== expectedKeyType && b.type === expectedKeyType) return 1;
        if (a.type && !b.type) return -1;
        if (!a.type && b.type) return 1;
        return 0;
      });

    // Try each key at this level
    for (const key of candidateKeys) {
      // Compute next slot directly - this is the most reliable approach
      const nextSlot = computeMappingSlot(slot, key.hex);

      // Check for direct match
      if (targetSlots.has(nextSlot) && !matchedSlots.has(nextSlot)) {
        matches.push({
          slot: nextSlot,
          keys: [...keys, key],
        });
        matchedSlots.add(nextSlot);
      }

      // Continue searching if not at max depth
      if (level + 1 < keyTypes.length && level + 1 < NESTED_MAPPINGS_LIMIT) {
        queue.push({
          level: level + 1,
          slot: nextSlot,
          keys: [...keys, key],
        });
      }
    }
  }

  return matches;
};
