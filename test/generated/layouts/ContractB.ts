// Generated storage layout for ContractB
export default {
  "storage": [
    {
      "astId": 4,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/interactions/ContractB.s.sol:ContractB",
      "label": "valueB",
      "offset": 0,
      "slot": "0",
      "type": "t_uint256"
    },
    {
      "astId": 7,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/interactions/ContractB.s.sol:ContractB",
      "label": "contractC",
      "offset": 0,
      "slot": "1",
      "type": "t_contract(ContractC)127"
    }
  ],
  "types": {
    "t_contract(ContractC)127": {
      "encoding": "inplace",
      "label": "contract ContractC",
      "numberOfBytes": "20"
    },
    "t_uint256": {
      "encoding": "inplace",
      "label": "uint256",
      "numberOfBytes": "32"
    }
  }
} as const;
