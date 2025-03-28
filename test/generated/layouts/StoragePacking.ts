// Generated storage layout for StoragePacking
export default {
  "storage": [
    {
      "astId": 3,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/basic/StoragePacking.s.sol:StoragePacking",
      "label": "smallValue1",
      "offset": 0,
      "slot": "0",
      "type": "t_uint8"
    },
    {
      "astId": 5,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/basic/StoragePacking.s.sol:StoragePacking",
      "label": "smallValue2",
      "offset": 1,
      "slot": "0",
      "type": "t_uint8"
    },
    {
      "astId": 7,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/basic/StoragePacking.s.sol:StoragePacking",
      "label": "flag",
      "offset": 2,
      "slot": "0",
      "type": "t_bool"
    },
    {
      "astId": 9,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/basic/StoragePacking.s.sol:StoragePacking",
      "label": "someAddress",
      "offset": 3,
      "slot": "0",
      "type": "t_address"
    },
    {
      "astId": 11,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/basic/StoragePacking.s.sol:StoragePacking",
      "label": "largeValue1",
      "offset": 0,
      "slot": "1",
      "type": "t_uint256"
    },
    {
      "astId": 13,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/basic/StoragePacking.s.sol:StoragePacking",
      "label": "data",
      "offset": 0,
      "slot": "2",
      "type": "t_bytes32"
    },
    {
      "astId": 15,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/basic/StoragePacking.s.sol:StoragePacking",
      "label": "mediumValue1",
      "offset": 0,
      "slot": "3",
      "type": "t_uint16"
    },
    {
      "astId": 17,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/basic/StoragePacking.s.sol:StoragePacking",
      "label": "mediumValue2",
      "offset": 2,
      "slot": "3",
      "type": "t_uint32"
    },
    {
      "astId": 19,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/basic/StoragePacking.s.sol:StoragePacking",
      "label": "mediumValue3",
      "offset": 6,
      "slot": "3",
      "type": "t_uint64"
    }
  ],
  "types": {
    "t_address": {
      "encoding": "inplace",
      "label": "address",
      "numberOfBytes": "20"
    },
    "t_bool": {
      "encoding": "inplace",
      "label": "bool",
      "numberOfBytes": "1"
    },
    "t_bytes32": {
      "encoding": "inplace",
      "label": "bytes32",
      "numberOfBytes": "32"
    },
    "t_uint16": {
      "encoding": "inplace",
      "label": "uint16",
      "numberOfBytes": "2"
    },
    "t_uint256": {
      "encoding": "inplace",
      "label": "uint256",
      "numberOfBytes": "32"
    },
    "t_uint32": {
      "encoding": "inplace",
      "label": "uint32",
      "numberOfBytes": "4"
    },
    "t_uint64": {
      "encoding": "inplace",
      "label": "uint64",
      "numberOfBytes": "8"
    },
    "t_uint8": {
      "encoding": "inplace",
      "label": "uint8",
      "numberOfBytes": "1"
    }
  }
} as const;
