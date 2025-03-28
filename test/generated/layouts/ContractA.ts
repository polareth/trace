// Generated storage layout for ContractA
export default {
  "storage": [
    {
      "astId": 4,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/interactions/ContractA.s.sol:ContractA",
      "label": "valueA",
      "offset": 0,
      "slot": "0",
      "type": "t_uint256"
    },
    {
      "astId": 7,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/interactions/ContractA.s.sol:ContractA",
      "label": "contractB",
      "offset": 0,
      "slot": "1",
      "type": "t_contract(ContractB)188"
    }
  ],
  "types": {
    "t_contract(ContractB)188": {
      "encoding": "inplace",
      "label": "contract ContractB",
      "numberOfBytes": "20"
    },
    "t_uint256": {
      "encoding": "inplace",
      "label": "uint256",
      "numberOfBytes": "32"
    }
  }
} as const;
