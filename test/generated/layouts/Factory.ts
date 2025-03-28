// Generated storage layout for Factory
export default {
  "storage": [
    {
      "astId": 5,
      "contract": "/Users/polarzero/code/projects/transaction-access-list/test/contracts/contract-creation/Factory.s.sol:Factory",
      "label": "createdContracts",
      "offset": 0,
      "slot": "0",
      "type": "t_array(t_address)dyn_storage"
    }
  ],
  "types": {
    "t_address": {
      "encoding": "inplace",
      "label": "address",
      "numberOfBytes": "20"
    },
    "t_array(t_address)dyn_storage": {
      "base": "t_address",
      "encoding": "dynamic_array",
      "label": "address[]",
      "numberOfBytes": "32"
    }
  }
} as const;
