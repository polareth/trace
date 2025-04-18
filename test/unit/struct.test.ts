import { describe, expect, it } from "vitest";

import { ACCOUNTS, CONTRACTS, LAYOUTS } from "@test/constants";
import {
  expectedStorage,
  getArraySlotHex,
  getClient,
  getMappingSlotHex,
  getSlotHex,
  getStringHex,
  toEvenHex,
} from "@test/utils";
import { traceStorageAccess } from "@/index";
import { PathSegmentKind } from "@/lib/explore/types";

const { Structs } = CONTRACTS;
const { caller } = ACCOUNTS;

/**
 * Structs tests
 *
 * This test suite verifies:
 *
 * 1. Basic struct operations (setting, getting, updating fields)
 * 2. Packed struct operations and storage layout
 * 3. Nested struct operations
 * 4. Structs with dynamic types (arrays, mappings)
 * 5. Memory vs storage behavior
 * 6. Struct deletion
 */
describe("Structs", () => {
  describe("Basic struct operations", () => {
    it("should trace basic struct storage access", async () => {
      const client = getClient();

      // Set a basic struct
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "initializeStructs",
        args: [],
      });

      // Verify the write operation was captured for the basicStruct
      expect(trace[Structs.address].storage).toEqual(
        expectedStorage(LAYOUTS.Structs, {
          basicStruct: {
            name: "basicStruct",
            type: "struct Structs.BasicStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0n,
                },
                next: {
                  hex: toEvenHex(1, { size: 32 }),
                  decoded: 1n,
                },
                modified: true,
                slots: [getSlotHex(2)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "id",
                  },
                ],
                fullExpression: "basicStruct.id",
              },
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: "",
                },
                next: {
                  hex: getStringHex("Named Init"),
                  decoded: "Named Init",
                },
                modified: true,
                slots: [getSlotHex(3)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "name",
                  },
                ],
                fullExpression: "basicStruct.name",
              },
            ],
          },
          dynamicStruct: {
            name: "dynamicStruct",
            type: "struct Structs.DynamicStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0n,
                },
                next: {
                  hex: toEvenHex(4, { size: 32 }),
                  decoded: 4n,
                },
                modified: true,
                slots: [getSlotHex(7)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "id",
                  },
                ],
                fullExpression: "dynamicStruct.id",
              },
            ],
          },
          nestedStruct: {
            name: "nestedStruct",
            type: "struct Structs.NestedStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0n,
                },
                next: {
                  hex: toEvenHex(2, { size: 32 }),
                  decoded: 2n,
                },
                modified: true,
                slots: [getSlotHex(4)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "id",
                  },
                ],
                fullExpression: "nestedStruct.id",
              },
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0n,
                },
                next: {
                  hex: toEvenHex(3, { size: 32 }),
                  decoded: 3n,
                },
                modified: true,
                slots: [getSlotHex(5)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "basic",
                  },
                  {
                    kind: PathSegmentKind.StructField,
                    name: "id",
                  },
                ],
                fullExpression: "nestedStruct.basic.id",
              },
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: "",
                },
                next: {
                  hex: getStringHex("Nested"),
                  decoded: "Nested",
                },
                modified: true,
                slots: [getSlotHex(6)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "basic",
                  },
                  {
                    kind: PathSegmentKind.StructField,
                    name: "name",
                  },
                ],
                fullExpression: "nestedStruct.basic.name",
              },
            ],
          },
        }),
      );
    });

    it("should trace struct deletion", async () => {
      const client = getClient();

      // First initialize the struct
      await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "initializeStructs",
        args: [],
      });

      // Now delete the struct
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "deleteStruct",
        args: [],
      });

      // Verify that all fields are reset to their default values
      expect(trace[Structs.address].storage).toEqual(
        expectedStorage(LAYOUTS.Structs, {
          basicStruct: {
            name: "basicStruct",
            type: "struct Structs.BasicStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(1, { size: 32 }),
                  decoded: 1n,
                },
                next: {
                  hex: toEvenHex(0), // slot data at deleted struct
                  decoded: 0n,
                },
                modified: true,
                slots: [getSlotHex(2)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "id",
                  },
                ],
                fullExpression: "basicStruct.id",
              },
              {
                current: {
                  hex: getStringHex("Named Init"),
                  decoded: "Named Init",
                },
                next: {
                  hex: toEvenHex(0), // slot data at deleted struct
                  decoded: "",
                },
                modified: true,
                slots: [getSlotHex(3)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "name",
                  },
                ],
                fullExpression: "basicStruct.name",
              },
            ],
          },
        }),
      );
    });
  });

  describe("Packed struct operations", () => {
    it("should trace packed struct with preceding value", async () => {
      const client = getClient();
      const preceding = 42;
      const a = 123;
      const b = 45678;
      const c = 1000000;
      const d = true;

      // Set packed struct with preceding value
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "initializePackedAfterPartial",
        args: [preceding, a, b, c, d],
      });

      // Verify the write operation captures both the preceding value and packed struct
      expect(trace[Structs.address].storage).toEqual(
        expectedStorage(LAYOUTS.Structs, {
          precedingValue: {
            name: "precedingValue",
            type: "uint8",
            kind: "primitive",
            trace: [
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0,
                },
                next: {
                  hex: toEvenHex(preceding),
                  decoded: preceding,
                },
                modified: true,
                slots: [getSlotHex(0)],
                path: [],
                fullExpression: "precedingValue",
              },
            ],
          },
          packedStruct: {
            name: "packedStruct",
            type: "struct Structs.PackedStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0,
                },
                next: {
                  hex: toEvenHex(a),
                  decoded: a,
                },
                modified: true,
                slots: [getSlotHex(1)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "a",
                  },
                ],
                fullExpression: "packedStruct.a",
              },
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0,
                },
                next: {
                  hex: toEvenHex(b, { size: 2 }),
                  decoded: b,
                },
                modified: true,
                slots: [getSlotHex(1)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "b",
                  },
                ],
                fullExpression: "packedStruct.b",
              },
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0,
                },
                next: {
                  hex: toEvenHex(c, { size: 4 }),
                  decoded: c,
                },
                modified: true,
                slots: [getSlotHex(1)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "c",
                  },
                ],
                fullExpression: "packedStruct.c",
              },
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: false,
                },
                next: {
                  hex: toEvenHex(d),
                  decoded: d,
                },
                modified: true,
                slots: [getSlotHex(1)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "d",
                  },
                ],
                fullExpression: "packedStruct.d",
              },
            ],
          },
        }),
      );
    });

    it("should trace reading packed struct values", async () => {
      const client = getClient();

      // First set up the packed struct
      await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "initializePackedAfterPartial",
        args: [42, 123, 45678, 1000000, true],
      });

      // Read the packed struct values
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "getPackedValues",
        args: [],
      });

      // Verify the read operation
      expect(trace[Structs.address].storage).toEqual(
        expectedStorage(LAYOUTS.Structs, {
          precedingValue: {
            name: "precedingValue",
            type: "uint8",
            kind: "primitive",
            trace: [
              {
                current: {
                  hex: toEvenHex(42),
                  decoded: 42,
                },
                modified: false,
                slots: [getSlotHex(0)],
                path: [],
                fullExpression: "precedingValue",
              },
            ],
          },
          packedStruct: {
            name: "packedStruct",
            type: "struct Structs.PackedStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(123),
                  decoded: 123,
                },
                modified: false,
                slots: [getSlotHex(1)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "a",
                  },
                ],
                fullExpression: "packedStruct.a",
              },
              {
                current: {
                  hex: toEvenHex(45678, { size: 2 }),
                  decoded: 45678,
                },
                modified: false,
                slots: [getSlotHex(1)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "b",
                  },
                ],
                fullExpression: "packedStruct.b",
              },
              {
                current: {
                  hex: toEvenHex(1000000, { size: 4 }),
                  decoded: 1000000,
                },
                modified: false,
                slots: [getSlotHex(1)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "c",
                  },
                ],
                fullExpression: "packedStruct.c",
              },
              {
                current: {
                  hex: toEvenHex(1),
                  decoded: true,
                },
                modified: false,
                slots: [getSlotHex(1)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "d",
                  },
                ],
                fullExpression: "packedStruct.d",
              },
            ],
          },
        }),
      );
    });
  });

  describe("Struct with dynamic types", () => {
    it("should trace dynamic array in struct", async () => {
      const client = getClient();
      const value = 42n;

      // First initialize the struct
      await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "initializeStructs",
        args: [],
      });

      // Add to dynamic array in struct
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "addToDynamicArray",
        args: [value],
      });

      // The dynamicStruct.numbers array length is at slot 8
      const lengthSlot = getSlotHex(8);

      // Verify the array length update and element addition
      expect(trace[Structs.address].storage).toEqual(
        expectedStorage(LAYOUTS.Structs, {
          dynamicStruct: {
            name: "dynamicStruct",
            type: "struct Structs.DynamicStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0n,
                },
                next: {
                  hex: toEvenHex(1),
                  decoded: 1n,
                },
                modified: true,
                slots: [lengthSlot],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "numbers",
                  },
                  {
                    kind: PathSegmentKind.ArrayLength,
                    name: "_length",
                  },
                ],
                fullExpression: "dynamicStruct.numbers._length",
              },
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: 0n,
                },
                next: {
                  hex: toEvenHex(value, { size: 32 }),
                  decoded: value,
                },
                modified: true,
                slots: [getArraySlotHex(lengthSlot, 0)],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "numbers",
                  },
                  {
                    kind: PathSegmentKind.ArrayIndex,
                    index: 0n,
                  },
                ],
                fullExpression: "dynamicStruct.numbers[0]",
              },
            ],
          },
        }),
      );
    });

    it("should trace array length in struct", async () => {
      const client = getClient();

      // First add an element to the array
      await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "addToDynamicArray",
        args: [42n],
      });

      // Get the array length
      const trace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "getDynamicArrayLength",
        args: [],
      });

      // Verify the length read
      const lengthSlot = getSlotHex(8);
      expect(trace[Structs.address].storage).toEqual(
        expectedStorage(LAYOUTS.Structs, {
          dynamicStruct: {
            name: "dynamicStruct",
            type: "struct Structs.DynamicStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(1),
                  decoded: 1n,
                },
                modified: false,
                slots: [lengthSlot],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "numbers",
                  },
                  {
                    kind: PathSegmentKind.ArrayLength,
                    name: "_length",
                  },
                ],
                fullExpression: "dynamicStruct.numbers._length",
              },
            ],
          },
        }),
      );
    });

    it("should trace mapping operations in struct", async () => {
      const client = getClient();
      const key = 123n;
      const value = true;

      // Set a flag in the mapping
      const writeTrace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "setFlag",
        args: [key, value],
      });

      // Verify the mapping update
      expect(writeTrace[Structs.address].storage).toEqual(
        expectedStorage(LAYOUTS.Structs, {
          dynamicStruct: {
            name: "dynamicStruct",
            type: "struct Structs.DynamicStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(0),
                  decoded: false,
                },
                next: {
                  hex: toEvenHex(1),
                  decoded: true,
                },
                modified: true,
                // The mapping is at slot 9 in the dynamicStruct
                slots: [getMappingSlotHex(9, toEvenHex(key, { size: 32 }))],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "flags",
                  },
                  {
                    kind: PathSegmentKind.MappingKey,
                    key: key,
                    keyType: "uint256",
                  },
                ],
                fullExpression: `dynamicStruct.flags[${key}]`,
              },
            ],
          },
        }),
      );

      // Read the flag
      const readTrace = await traceStorageAccess({
        client,
        from: caller.toString(),
        to: Structs.address,
        abi: Structs.abi,
        functionName: "getFlag",
        args: [key],
      });

      // Verify the mapping read
      expect(readTrace[Structs.address].storage).toEqual(
        expectedStorage(LAYOUTS.Structs, {
          dynamicStruct: {
            name: "dynamicStruct",
            type: "struct Structs.DynamicStruct",
            kind: "struct",
            trace: [
              {
                current: {
                  hex: toEvenHex(1),
                  decoded: true,
                },
                modified: false,
                slots: [getMappingSlotHex(9, toEvenHex(key, { size: 32 }))],
                path: [
                  {
                    kind: PathSegmentKind.StructField,
                    name: "flags",
                  },
                  {
                    kind: PathSegmentKind.MappingKey,
                    key: key,
                    keyType: "uint256",
                  },
                ],
                fullExpression: `dynamicStruct.flags[${key}]`,
              },
            ],
          },
        }),
      );
    });
  });
});
