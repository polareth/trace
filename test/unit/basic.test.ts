import { encodeFunctionData } from "tevm";
import { describe, expect, it } from "vitest";

import { ACCOUNTS, CONTRACTS, LAYOUTS } from "@test/constants";
import { expectedStorage, getClient, getSlotHex } from "@test/utils";
import { Tracer, traceStorageAccess } from "@/index";

const { StoragePacking } = CONTRACTS;
const { caller } = ACCOUNTS;

/**
 * Basic storage access tests
 *
 * This test suite verifies:
 *
 * 1. Basic storage access tracing for both packed and unpacked variables
 * 2. Detection of storage reads and writes with proper labeling and typing
 * 3. Handling of different data types (uint8/16/32/64/256, bool, bytes32, address)
 * 4. Correct tracking of packed storage variables in a single slot
 * 5. Individual updates to variables within packed slots
 * 6. Mixed operations across packed and unpacked slots
 * 7. Account state changes tracking (nonce, balance)
 * 8. Large numeric values handling
 * 9. Tracer class
 */

// TODO: with replay on both traceStorageAccess and Tracer
describe("Basic slots access and packing", () => {
  describe("traceStorageAccess with contract call", () => {
    it("should handle packed storage variables correctly", async () => {
      const client = getClient();

      // Set packed values in a single storage slot (uint8, uint8, bool, address)
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: StoragePacking.address,
        abi: StoragePacking.abi,
        functionName: "setSmallValues",
        args: [42, 123, true, caller.toString()],
      });

      expect(trace[StoragePacking.address].storage).toEqual(
        expectedStorage(LAYOUTS.StoragePacking, {
          smallValue1: {
            label: "smallValue1",
            type: "uint8",
            kind: "primitive",
            trace: { current: 0, next: 42, modified: true, slots: [getSlotHex(0)] },
          },
          smallValue2: {
            label: "smallValue2",
            type: "uint8",
            kind: "primitive",
            trace: { current: 0, next: 123, modified: true, slots: [getSlotHex(0)] },
            offset: 1,
          },
          flag: {
            label: "flag",
            type: "bool",
            kind: "primitive",
            trace: { current: false, next: true, modified: true, slots: [getSlotHex(0)] },
            offset: 2,
          },
          someAddress: {
            label: "someAddress",
            type: "address",
            kind: "primitive",
            trace: {
              current: "0x0000000000000000000000000000000000000000",
              next: caller.toString(),
              modified: true,
              slots: [getSlotHex(0)],
            },
            offset: 3,
          },
        }),
      );
    });

    it("should handle individual updates to packed variables", async () => {
      const client = getClient();

      // Now update just one variable in the packed slot
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: StoragePacking.address,
        abi: StoragePacking.abi,
        functionName: "setMediumValue1",
        args: [999],
      });

      expect(trace[StoragePacking.address].storage).toEqual(
        expectedStorage(LAYOUTS.StoragePacking, {
          // Slot for medium values (3rd variable group but 2nd group takes 2 slots)
          mediumValue1: {
            label: "mediumValue1",
            type: "uint16",
            kind: "primitive",
            trace: { current: 0, next: 999, modified: true, slots: [getSlotHex(3)] },
          },
          mediumValue2: {
            label: "mediumValue2",
            type: "uint32",
            kind: "primitive",
            trace: { current: 0, modified: false, slots: [getSlotHex(3)] },
            offset: 2,
          },
          mediumValue3: {
            label: "mediumValue3",
            type: "uint64",
            kind: "primitive",
            trace: { current: 0n, modified: false, slots: [getSlotHex(3)] },
            offset: 6,
          },
        }),
      );
    });

    it("should track updates across multiple slots including packed and non-packed", async () => {
      const client = getClient();

      // Update values across multiple slots, including both packed and non-packed
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: StoragePacking.address,
        abi: StoragePacking.abi,
        functionName: "updateAllValues",
        args: [10, 20, 1000, 2000, 12345n],
      });

      // We expect at least 3 slots to be accessed:
      // - Slot 0: smallValue1, smallValue2, (packed) (flag & someAddress are not modified)
      // - Slot 3: mediumValue1, mediumValue2, mediumValue3 (packed) (mediumValue3 is not modified)
      // - Slot 1: largeValue1 (not packed) (written last)
      expect(trace[StoragePacking.address].storage).toEqual(
        expectedStorage(LAYOUTS.StoragePacking, {
          smallValue1: {
            label: "smallValue1",
            type: "uint8",
            kind: "primitive",
            trace: { current: 0, next: 10, modified: true, slots: [getSlotHex(0)] },
          },
          smallValue2: {
            label: "smallValue2",
            type: "uint8",
            kind: "primitive",
            trace: { current: 0, next: 20, modified: true, slots: [getSlotHex(0)] },
            offset: 1,
          },
          flag: {
            label: "flag",
            type: "bool",
            kind: "primitive",
            trace: { current: false, modified: false, slots: [getSlotHex(0)] },
            offset: 2,
          },
          someAddress: {
            label: "someAddress",
            type: "address",
            kind: "primitive",
            trace: {
              current: "0x0000000000000000000000000000000000000000",
              modified: false,
              slots: [getSlotHex(0)],
            },
            offset: 3,
          },
          mediumValue1: {
            label: "mediumValue1",
            type: "uint16",
            kind: "primitive",
            trace: { current: 0, next: 1000, modified: true, slots: [getSlotHex(3)] },
          },
          mediumValue2: {
            label: "mediumValue2",
            type: "uint32",
            kind: "primitive",
            trace: { current: 0, next: 2000, modified: true, slots: [getSlotHex(3)] },
            offset: 2,
          },
          mediumValue3: {
            label: "mediumValue3",
            type: "uint64",
            kind: "primitive",
            trace: { current: 0n, modified: false, slots: [getSlotHex(3)] },
            offset: 6,
          },
          largeValue1: {
            label: "largeValue1",
            type: "uint256",
            kind: "primitive",
            trace: { current: 0n, next: 12345n, modified: true, slots: [getSlotHex(1)] },
          },
        }),
      );
    });

    it("should handle large numeric values correctly", async () => {
      const client = getClient();

      // Set a large value in a non-packed slot
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: StoragePacking.address,
        abi: StoragePacking.abi,
        functionName: "setLargeValue1",
        args: [123456789012345678901234567890n],
      });

      // Verify that the large value was set correctly
      expect(trace[StoragePacking.address].storage).toEqual(
        expectedStorage(LAYOUTS.StoragePacking, {
          largeValue1: {
            label: "largeValue1",
            type: "uint256",
            kind: "primitive",
            trace: { current: 0n, next: 123456789012345678901234567890n, modified: true, slots: [getSlotHex(1)] },
          },
        }),
      );
    });

    it("should handle bytes32 data correctly", async () => {
      const client = getClient();

      const testBytes32 = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

      // Set the bytes32 data
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: StoragePacking.address,
        abi: StoragePacking.abi,
        functionName: "setData",
        args: [testBytes32],
      });

      // Verify that the data was set correctly
      expect(trace[StoragePacking.address].storage).toEqual(
        expectedStorage(LAYOUTS.StoragePacking, {
          data: {
            label: "data",
            type: "bytes32",
            kind: "primitive",
            trace: {
              current: "0x0000000000000000000000000000000000000000000000000000000000000000",
              next: testBytes32,
              modified: true,
              slots: [getSlotHex(2)],
            },
          },
        }),
      );
    });

    it("should capture storage reads when getting values", async () => {
      const client = getClient();

      // Read the value and trace the storage access
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: StoragePacking.address,
        abi: StoragePacking.abi,
        functionName: "getLargeValue1",
        args: [],
      });

      // Verify that we have a read operation with no modifications
      expect(trace[StoragePacking.address].storage).toEqual(
        expectedStorage(LAYOUTS.StoragePacking, {
          largeValue1: {
            label: "largeValue1",
            type: "uint256",
            kind: "primitive",
            trace: { current: 0n, modified: false, slots: [getSlotHex(1)] },
          },
        }),
      );
    });

    it("should detect account state changes (nonce, balance)", async () => {
      const client = getClient();

      // Perform a transaction that will modify caller's balance and nonce
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: StoragePacking.address,
        abi: StoragePacking.abi,
        functionName: "setLargeValue1",
        args: [1n],
      });

      const callerTrace = trace[caller.toString()];

      // No reads & writes as it's an EOA
      expect(callerTrace.storage).toEqual({});

      // Nonce should be incremented
      expect(Number(callerTrace.intrinsic.nonce.next)).toBe(Number(callerTrace.intrinsic.nonce.current) + 1);

      // Balance should be reduced (due to gas)
      expect(BigInt(callerTrace.intrinsic.balance.next ?? Infinity)).toBeLessThan(
        BigInt(callerTrace.intrinsic.balance.current ?? 0n),
      );
    });
  });

  describe("traceStorageAccess with transaction calldata", () => {
    it("should work similarily to traceStorageAccess", async () => {
      const client = getClient();

      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: StoragePacking.address,
        data: encodeFunctionData(StoragePacking.write.setSmallValues(1, 2, true, caller.toString())),
      });

      // Check the read and write operations
      expect(trace[StoragePacking.address].storage).toEqual(
        expectedStorage(LAYOUTS.StoragePacking, {
          smallValue1: {
            label: "smallValue1",
            type: "uint8",
            kind: "primitive",
            trace: { current: 0, next: 1, modified: true, slots: [getSlotHex(0)] },
          },
          smallValue2: {
            label: "smallValue2",
            type: "uint8",
            kind: "primitive",
            trace: { current: 0, next: 2, modified: true, slots: [getSlotHex(0)] },
            offset: 1,
          },
          flag: {
            label: "flag",
            type: "bool",
            kind: "primitive",
            trace: { current: false, next: true, modified: true, slots: [getSlotHex(0)] },
            offset: 2,
          },
          someAddress: {
            label: "someAddress",
            type: "address",
            kind: "primitive",
            trace: {
              current: "0x0000000000000000000000000000000000000000",
              next: caller.toString(),
              modified: true,
              slots: [getSlotHex(0)],
            },
            offset: 3,
          },
        }),
      );
    });
  });

  describe("Tracer class", () => {
    // TODO: with ABI
    it("should work similarily to traceStorageAccess", async () => {
      const client = getClient();
      const tracer = new Tracer({ client });

      const trace = await tracer.traceStorageAccess({
        from: caller.toString(),
        to: StoragePacking.address,
        data: encodeFunctionData(StoragePacking.write.setSmallValues(1, 2, true, caller.toString())),
      });

      expect(trace[StoragePacking.address].storage).toEqual(
        expectedStorage(LAYOUTS.StoragePacking, {
          smallValue1: {
            label: "smallValue1",
            type: "uint8",
            kind: "primitive",
            trace: { current: 0, next: 1, modified: true, slots: [getSlotHex(0)] },
          },
          smallValue2: {
            label: "smallValue2",
            type: "uint8",
            kind: "primitive",
            trace: { current: 0, next: 2, modified: true, slots: [getSlotHex(0)] },
            offset: 1,
          },
          flag: {
            label: "flag",
            type: "bool",
            kind: "primitive",
            trace: { current: false, next: true, modified: true, slots: [getSlotHex(0)] },
            offset: 2,
          },
          someAddress: {
            label: "someAddress",
            type: "address",
            kind: "primitive",
            trace: {
              current: "0x0000000000000000000000000000000000000000",
              next: caller.toString(),
              modified: true,
              slots: [getSlotHex(0)],
            },
            offset: 3,
          },
        }),
      );
    });
  });
});
