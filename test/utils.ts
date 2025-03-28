import { Abi, ContractFunctionName, Hex, keccak256, MemoryClient, toHex } from "tevm";
import { SolcStorageLayout } from "tevm/bundler/solc";
import { hexToBigInt, isHex, padHex } from "viem";

import { DeepReadonly } from "@/lib/adapter/types";
import { StorageAccessTrace, TraceStorageAccessTxWithAbi } from "@/lib/types";

export const getClient = (): MemoryClient => {
  // @ts-expect-error no index signature
  return globalThis.client;
};

export const getSlotHex = (slot: number) => {
  return toHex(slot, { size: 32 });
};

export const getMappingSlotHex = (slot: number, ...keys: Hex[]) => {
  let currentSlot = getSlotHex(slot);

  for (const key of keys) {
    const paddedKey = padHex(key, { size: 32 });
    currentSlot = keccak256(`0x${paddedKey.replace("0x", "")}${currentSlot.replace("0x", "")}`);
  }

  return currentSlot;
};

export const getSlotAtOffsetHex = (slot: Hex | number, offset: number) => {
  const slotBigInt = isHex(slot) ? hexToBigInt(slot) : BigInt(slot);
  return toHex(slotBigInt + BigInt(offset), { size: 32 });
};

/** Helper to type an access trace based on a storage layout */
export const expectedStorage = <StorageLayout extends DeepReadonly<SolcStorageLayout>>(
  _: StorageLayout,
  expectedStorage: Partial<StorageAccessTrace<StorageLayout>["storage"]>,
) => expectedStorage;
