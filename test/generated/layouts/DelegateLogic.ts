// Generated storage layout for DelegateLogic
export default {
  "storage": [
    {
      "astId": 3,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/delegate-calls/DelegateLogic.s.sol:DelegateLogic",
      "label": "implementation",
      "offset": 0,
      "slot": "0",
      "type": "t_address"
    },
    {
      "astId": 5,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/delegate-calls/DelegateLogic.s.sol:DelegateLogic",
      "label": "value",
      "offset": 0,
      "slot": "1",
      "type": "t_uint256"
    },
    {
      "astId": 9,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/delegate-calls/DelegateLogic.s.sol:DelegateLogic",
      "label": "balances",
      "offset": 0,
      "slot": "2",
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
