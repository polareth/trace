// Generated storage layout for SimpleERC20
export default {
  "storage": [
    {
      "astId": 3,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/tokens/SimpleERC20.s.sol:SimpleERC20",
      "label": "_name",
      "offset": 0,
      "slot": "0",
      "type": "t_string_storage"
    },
    {
      "astId": 5,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/tokens/SimpleERC20.s.sol:SimpleERC20",
      "label": "_symbol",
      "offset": 0,
      "slot": "1",
      "type": "t_string_storage"
    },
    {
      "astId": 7,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/tokens/SimpleERC20.s.sol:SimpleERC20",
      "label": "_decimals",
      "offset": 0,
      "slot": "2",
      "type": "t_uint8"
    },
    {
      "astId": 9,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/tokens/SimpleERC20.s.sol:SimpleERC20",
      "label": "_totalSupply",
      "offset": 0,
      "slot": "3",
      "type": "t_uint256"
    },
    {
      "astId": 13,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/tokens/SimpleERC20.s.sol:SimpleERC20",
      "label": "_balances",
      "offset": 0,
      "slot": "4",
      "type": "t_mapping(t_address,t_uint256)"
    },
    {
      "astId": 19,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/tokens/SimpleERC20.s.sol:SimpleERC20",
      "label": "_allowances",
      "offset": 0,
      "slot": "5",
      "type": "t_mapping(t_address,t_mapping(t_address,t_uint256))"
    }
  ],
  "types": {
    "t_address": {
      "encoding": "inplace",
      "label": "address",
      "numberOfBytes": "20"
    },
    "t_mapping(t_address,t_mapping(t_address,t_uint256))": {
      "encoding": "mapping",
      "key": "t_address",
      "label": "mapping(address => mapping(address => uint256))",
      "numberOfBytes": "32",
      "value": "t_mapping(t_address,t_uint256)"
    },
    "t_mapping(t_address,t_uint256)": {
      "encoding": "mapping",
      "key": "t_address",
      "label": "mapping(address => uint256)",
      "numberOfBytes": "32",
      "value": "t_uint256"
    },
    "t_string_storage": {
      "encoding": "bytes",
      "label": "string",
      "numberOfBytes": "32"
    },
    "t_uint256": {
      "encoding": "inplace",
      "label": "uint256",
      "numberOfBytes": "32"
    },
    "t_uint8": {
      "encoding": "inplace",
      "label": "uint8",
      "numberOfBytes": "1"
    }
  }
} as const;
