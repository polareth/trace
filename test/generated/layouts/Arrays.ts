// Generated storage layout for Arrays
export default {
  "storage": [
    {
      "astId": 5,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Arrays.s.sol:Arrays",
      "label": "fixedArray",
      "offset": 0,
      "slot": "0",
      "type": "t_array(t_uint256)5_storage"
    },
    {
      "astId": 8,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Arrays.s.sol:Arrays",
      "label": "dynamicArray",
      "offset": 0,
      "slot": "5",
      "type": "t_array(t_uint256)dyn_storage"
    },
    {
      "astId": 19,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Arrays.s.sol:Arrays",
      "label": "items",
      "offset": 0,
      "slot": "6",
      "type": "t_array(t_struct(Item)15_storage)dyn_storage"
    },
    {
      "astId": 23,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Arrays.s.sol:Arrays",
      "label": "nestedArrays",
      "offset": 0,
      "slot": "7",
      "type": "t_array(t_array(t_uint256)dyn_storage)dyn_storage"
    }
  ],
  "types": {
    "t_array(t_array(t_uint256)dyn_storage)dyn_storage": {
      "base": "t_array(t_uint256)dyn_storage",
      "encoding": "dynamic_array",
      "label": "uint256[][]",
      "numberOfBytes": "32"
    },
    "t_array(t_struct(Item)15_storage)dyn_storage": {
      "base": "t_struct(Item)15_storage",
      "encoding": "dynamic_array",
      "label": "struct Arrays.Item[]",
      "numberOfBytes": "32"
    },
    "t_array(t_uint256)5_storage": {
      "base": "t_uint256",
      "encoding": "inplace",
      "label": "uint256[5]",
      "numberOfBytes": "160"
    },
    "t_array(t_uint256)dyn_storage": {
      "base": "t_uint256",
      "encoding": "dynamic_array",
      "label": "uint256[]",
      "numberOfBytes": "32"
    },
    "t_bool": {
      "encoding": "inplace",
      "label": "bool",
      "numberOfBytes": "1"
    },
    "t_string_storage": {
      "encoding": "bytes",
      "label": "string",
      "numberOfBytes": "32"
    },
    "t_struct(Item)15_storage": {
      "encoding": "inplace",
      "label": "struct Arrays.Item",
      "members": [
        {
          "astId": 10,
          "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Arrays.s.sol:Arrays",
          "label": "id",
          "offset": 0,
          "slot": "0",
          "type": "t_uint256"
        },
        {
          "astId": 12,
          "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Arrays.s.sol:Arrays",
          "label": "name",
          "offset": 0,
          "slot": "1",
          "type": "t_string_storage"
        },
        {
          "astId": 14,
          "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Arrays.s.sol:Arrays",
          "label": "active",
          "offset": 0,
          "slot": "2",
          "type": "t_bool"
        }
      ],
      "numberOfBytes": "96"
    },
    "t_uint256": {
      "encoding": "inplace",
      "label": "uint256",
      "numberOfBytes": "32"
    }
  }
} as const;
