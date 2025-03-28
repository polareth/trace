// Generated storage layout for Mappings
export default {
  "storage": [
    {
      "astId": 5,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Mappings.s.sol:Mappings",
      "label": "balances",
      "offset": 0,
      "slot": "0",
      "type": "t_mapping(t_address,t_uint256)"
    },
    {
      "astId": 11,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Mappings.s.sol:Mappings",
      "label": "allowances",
      "offset": 0,
      "slot": "1",
      "type": "t_mapping(t_address,t_mapping(t_address,t_uint256))"
    },
    {
      "astId": 21,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Mappings.s.sol:Mappings",
      "label": "ridiculouslyNestedMapping",
      "offset": 0,
      "slot": "2",
      "type": "t_mapping(t_address,t_mapping(t_address,t_mapping(t_address,t_mapping(t_address,t_uint256))))"
    },
    {
      "astId": 33,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Mappings.s.sol:Mappings",
      "label": "userInfo",
      "offset": 0,
      "slot": "3",
      "type": "t_mapping(t_address,t_struct(UserInfo)28_storage)"
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
    "t_mapping(t_address,t_mapping(t_address,t_mapping(t_address,t_mapping(t_address,t_uint256))))": {
      "encoding": "mapping",
      "key": "t_address",
      "label": "mapping(address => mapping(address => mapping(address => mapping(address => uint256))))",
      "numberOfBytes": "32",
      "value": "t_mapping(t_address,t_mapping(t_address,t_mapping(t_address,t_uint256)))"
    },
    "t_mapping(t_address,t_mapping(t_address,t_mapping(t_address,t_uint256)))": {
      "encoding": "mapping",
      "key": "t_address",
      "label": "mapping(address => mapping(address => mapping(address => uint256)))",
      "numberOfBytes": "32",
      "value": "t_mapping(t_address,t_mapping(t_address,t_uint256))"
    },
    "t_mapping(t_address,t_mapping(t_address,t_uint256))": {
      "encoding": "mapping",
      "key": "t_address",
      "label": "mapping(address => mapping(address => uint256))",
      "numberOfBytes": "32",
      "value": "t_mapping(t_address,t_uint256)"
    },
    "t_mapping(t_address,t_struct(UserInfo)28_storage)": {
      "encoding": "mapping",
      "key": "t_address",
      "label": "mapping(address => struct Mappings.UserInfo)",
      "numberOfBytes": "32",
      "value": "t_struct(UserInfo)28_storage"
    },
    "t_mapping(t_address,t_uint256)": {
      "encoding": "mapping",
      "key": "t_address",
      "label": "mapping(address => uint256)",
      "numberOfBytes": "32",
      "value": "t_uint256"
    },
    "t_struct(UserInfo)28_storage": {
      "encoding": "inplace",
      "label": "struct Mappings.UserInfo",
      "members": [
        {
          "astId": 23,
          "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Mappings.s.sol:Mappings",
          "label": "balance",
          "offset": 0,
          "slot": "0",
          "type": "t_uint256"
        },
        {
          "astId": 25,
          "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Mappings.s.sol:Mappings",
          "label": "lastUpdate",
          "offset": 0,
          "slot": "1",
          "type": "t_uint256"
        },
        {
          "astId": 27,
          "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/data-structures/Mappings.s.sol:Mappings",
          "label": "isActive",
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
