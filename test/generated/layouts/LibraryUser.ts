// Generated storage layout for LibraryUser
export default {
  "storage": [
    {
      "astId": 210,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/libraries/LibraryUser.s.sol:LibraryUser",
      "label": "internalValue",
      "offset": 0,
      "slot": "0",
      "type": "t_uint256"
    },
    {
      "astId": 213,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/libraries/LibraryUser.s.sol:LibraryUser",
      "label": "externalData",
      "offset": 0,
      "slot": "1",
      "type": "t_struct(Data)6_storage"
    }
  ],
  "types": {
    "t_bool": {
      "encoding": "inplace",
      "label": "bool",
      "numberOfBytes": "1"
    },
    "t_struct(Data)6_storage": {
      "encoding": "inplace",
      "label": "struct ExternalLibrary.Data",
      "members": [
        {
          "astId": 3,
          "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/libraries/LibraryUser.s.sol:LibraryUser",
          "label": "value",
          "offset": 0,
          "slot": "0",
          "type": "t_uint256"
        },
        {
          "astId": 5,
          "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/libraries/LibraryUser.s.sol:LibraryUser",
          "label": "initialized",
          "offset": 0,
          "slot": "1",
          "type": "t_bool"
        }
      ],
      "numberOfBytes": "64"
    },
    "t_uint256": {
      "encoding": "inplace",
      "label": "uint256",
      "numberOfBytes": "32"
    }
  }
} as const;
