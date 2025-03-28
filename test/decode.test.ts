import { Hex } from "viem";
import { describe, expect, it } from "vitest";

import { extractStructMembers } from "@/lib/slots/decode";

describe("Decode", () => {
  describe("structs", () => {
    // Mock types for our test
    const mockTypes = {
      t_uint8: {
        encoding: "inplace",
        label: "uint8",
        numberOfBytes: "1",
      },
      t_bool: {
        encoding: "inplace",
        label: "bool",
        numberOfBytes: "1",
      },
      t_address: {
        encoding: "inplace",
        label: "address",
        numberOfBytes: "20",
      },
      t_uint256: {
        encoding: "inplace",
        label: "uint256",
        numberOfBytes: "32",
      },
      t_uint128: {
        encoding: "inplace",
        label: "uint128",
        numberOfBytes: "16",
      },
      "t_struct(ComplexStruct)": {
        encoding: "inplace",
        label: "struct TestContract.ComplexStruct",
        numberOfBytes: "86",
        members: [
          {
            label: "smallValue",
            type: "t_uint8",
            offset: 0,
          },
          {
            label: "flag",
            type: "t_bool",
            offset: 1,
          },
          {
            label: "user",
            type: "t_address",
            offset: 2,
          },
          {
            label: "bigValue",
            type: "t_uint256",
            offset: 32,
          },
          {
            label: "mediumValue1",
            type: "t_uint128",
            offset: 64,
          },
          {
            label: "mediumValue2",
            type: "t_uint128",
            offset: 80,
          },
        ],
      },
    } as const;

    // Mock storage data
    const mockStorageData: Record<Hex, Hex> = {
      "0x0000000000000000000000000000000000000000000000000000000000000000":
        "0x0000000000000000000000001234567890123456789012345678901234567890ff01",
      "0x0000000000000000000000000000000000000000000000000000000000000001":
        "0x00000000000000000000000000000000000000000000000000000000000000ff",
      "0x0000000000000000000000000000000000000000000000000000000000000002":
        "0x000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000002a",
    };

    // Call the function
    const result = extractStructMembers(
      mockStorageData,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      0,
      [
        {
          label: "smallValue",
          type: "t_uint8",
          offset: 0,
        },
        {
          label: "flag",
          type: "t_bool",
          offset: 1,
        },
        {
          label: "user",
          type: "t_address",
          offset: 2,
        },
        {
          label: "bigValue",
          type: "t_uint256",
          offset: 32,
        },
        {
          label: "mediumValue1",
          type: "t_uint128",
          offset: 64,
        },
        {
          label: "mediumValue2",
          type: "t_uint128",
          offset: 80,
        },
      ],
      mockTypes,
    );

    // Expected result
    const expected = [
      {
        slot: "0x0000000000000000000000000000000000000000000000000000000000000000",
        data: "0x0000000000000000000000001234567890123456789012345678901234567890ff01",
        params: [
          {
            name: "smallValue",
            type: "uint8",
            offset: 0,
            size: 1,
          },
          {
            name: "flag",
            type: "bool",
            offset: 1,
            size: 1,
          },
          {
            name: "user",
            type: "address",
            offset: 2,
            size: 20,
          },
        ],
      },
      {
        slot: "0x0000000000000000000000000000000000000000000000000000000000000001",
        data: "0x00000000000000000000000000000000000000000000000000000000000000ff",
        params: [
          {
            name: "bigValue",
            type: "uint256",
            offset: 0,
            size: 32,
          },
        ],
      },
      {
        slot: "0x0000000000000000000000000000000000000000000000000000000000000002",
        data: "0x000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000002a",
        params: [
          {
            name: "mediumValue1",
            type: "uint128",
            offset: 0,
            size: 16,
          },
          {
            name: "mediumValue2",
            type: "uint128",
            offset: 16,
            size: 16,
          },
        ],
      },
    ];

    it("should correctly extract struct members with extractStructMembers", async () => {
      // Verify the result
      expect(result).toEqual(expected);

      // TODO: test with some undefined data

      // If you have the decodeStructMembers function implemented, you could also test that:
      /*
    const decodedValues = decodeStructMembers(result, mockTypes);
    expect(decodedValues).toEqual({
      smallValue: 1n,
      flag: true,
      user: "0x1234567890123456789012345678901234567890",
      bigValue: 255n,
      mediumValue1: 123n,
      mediumValue2: 42n
    });
    */
    });
  });
});
