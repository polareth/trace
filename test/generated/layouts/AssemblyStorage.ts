// Generated storage layout for AssemblyStorage
export default {
  "storage": [
    {
      "astId": 3,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/advanced/AssemblyStorage.s.sol:AssemblyStorage",
      "label": "value",
      "offset": 0,
      "slot": "0",
      "type": "t_uint256"
    },
    {
      "astId": 7,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/advanced/AssemblyStorage.s.sol:AssemblyStorage",
      "label": "balances",
      "offset": 0,
      "slot": "1",
      "type": "t_mapping(t_address,t_uint256)"
    }
  ],
  "types": {
    "t_address": {
      "encoding": "inplace",
      "label": "address",
      "numberOfBytes": "20"
    },
    "t_mapping(t_address,t_uint256)": {
      "encoding": "mapping",
      "key": "t_address",
      "label": "mapping(address => uint256)",
      "numberOfBytes": "32",
      "value": "t_uint256"
    },
    "t_uint256": {
      "encoding": "inplace",
      "label": "uint256",
      "numberOfBytes": "32"
    }
  }
} as const;
