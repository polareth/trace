# References

## Notes

- pass some tx arguments, same but run with tevm directly and return access list (+ maybe some other execution info if opted-in to bonus info)
- (additional) pass some tx hash and return listed storage slot changes by this tx (get tx, fork before, dump state, run tx with tevm, dump state, compare)

- provide provider
- provide from address to impersonate
- maybe return two objects: "read" and "write" so we can include labeled slots that got only read as well

1. Run tx and see affected accounts
2. Backward fork, dump storage of these accounts
3. Run tx with tevm, dump storage of these accounts
4. Compare for each and interpret

## TODO

- [ ] new storage adapter works if there is a storage layout but make it work if there is none as well (getData, etc would return hex?) - need more research on storage layout for unverified contracts
- [ ] if a function writes to storage BUT doesn't modify the value(s), it returns a read (because pre-post state is the same)
  - -> this is an _access_ list so it makes sense, we should rather have either a single object instead of read/write, with or without a "next" property
  - -> or maybe better we track SSTOREs and SLOADs separately, so we can accurately populate read and write
- [ ] add tests for trace with txHash (replicate tx)
- [x] create a Tracer class that takes the args and env and can be user to trace by just providing tx
- [ ] provide a react package with a Tracer provider and useTracer hook
- [ ] ? add a "details" property to the returned trace, with the raw tevm call result (gas, errors, etc)
- [ ] ? pass a "label"/something flag to label or not storage slots (default true, but setting to false would save a lot on compute)
- [ ] export types and utilities for decoding abi types and mention on readme? or don't bloat the package? maybe would be good as a second package provided lattice authorization
- [ ] upstream utilities (compute mapping slot, array slot at index, etc?) to Ox
- [ ] provide same api as viem/tevm with "as const" abi except it's with the storage layout, and you get a fully typed api with decoded types, etc
- [ ] provide some state listeners -> listen to a contract's state changes; same api as listening to contract events, you get the typed state change
  ```typescript
  const sub = watchState({
    address: "0xabc...",
    // we (probably?) don't _need_ the abi, but it will help decoding inputs on function calls to retrieve potential mapping keys
    // and compute the mapping slot at which data was updated faster (we prioritize keys with known types), or even to compute it at all
    abi: [] as const,
    storageLayout: {} as const,
    onChange: (state) => {
      console.log(state);
      // An ERC20 transfer just happened
      // {
      //   label: "balances",
      //   type: "uint256",
      //   current: {
      //     hex: "0x...",
      //     decoded: 1000n
      //   },
      //   prev: {
      //     hex: "0x...",
      //     decoded: 0n
      //   },
      //   keys: [ // since this is a mapping, we get the keys (an array in case it's a nested mapping)
      //     {
      //       hex: "0x...", // the recipient address padded to 32 bytes
      //       decoded: "0x..." // the recipient address
      //       type: "address"
      //     }
      //   ]
      // }
      // An update will also fire for the sender's balance change
      // Also an update will fire for the account's state change for whoever made the transaction
      // (balance change because of gas, nonce increment if it's an EOA)
    },
  });
  ```

````

## Listen to steps during call

This might be useful for listening to EVM steps and maybe grab all storage updates accurately

```ts
import { createMemoryClient } from "tevm";
import { encodeFunctionData } from "viem";

const client = createMemoryClient();

// Listen for EVM steps and other events during execution
const result = await client.tevmCall({
  to: contractAddress,
  data: encodeFunctionData({
    abi,
    functionName: "myFunction",
    args: [arg1, arg2],
  }),
  // Listen for EVM steps
  onStep: (step, next) => {
    console.log("EVM Step:", {
      pc: step.pc, // Program counter
      opcode: step.opcode, // Current opcode
      gasLeft: step.gasLeft, // Remaining gas
      stack: step.stack, // Stack contents
      depth: step.depth, // Call depth
    });
    next?.();
  },
  // Listen for contract creation
  onNewContract: (data, next) => {
    console.log("New contract deployed:", {
      address: data.address.toString(),
      codeSize: data.code.length,
    });
    next?.();
  },
  // Listen for message execution
  onBeforeMessage: (message, next) => {
    console.log("Executing message:", {
      to: message.to?.toString(),
      value: message.value.toString(),
      delegatecall: message.delegatecall,
    });
    next?.();
  },
  onAfterMessage: (result, next) => {
    console.log("Message result:", {
      gasUsed: result.execResult.executionGasUsed.toString(),
      returnValue: result.execResult.returnValue.toString("hex"),
      error: result.execResult.exceptionError?.error,
    });
    next?.();
  },
});
````
