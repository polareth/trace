import { createAddress } from "tevm/address";
import { mainnet } from "tevm/common";

import * as contracts from "./contracts";

export * as LAYOUTS from "./generated/layouts";

export const CONTRACTS = {
  AssemblyStorage: contracts.AssemblyStorage.withAddress(`0x${"1".repeat(40)}`),
  StoragePacking: contracts.StoragePacking.withAddress(`0x${"2".repeat(40)}`),
  Arrays: contracts.Arrays.withAddress(`0x${"3".repeat(40)}`),
  Mappings: contracts.Mappings.withAddress(`0x${"4".repeat(40)}`),
  Structs: contracts.Structs.withAddress(`0x${"5".repeat(40)}`),
  Factory: contracts.Factory.withAddress(`0x${"6".repeat(40)}`),
  SimpleContract: contracts.SimpleContract.withAddress(`0x${"7".repeat(40)}`),
  NativeTransfer: contracts.NativeTransfer.withAddress(`0x${"8".repeat(40)}`),
  ETHReceiver: contracts.ETHReceiver.withAddress(`0x${"9".repeat(40)}`),
  TransparentProxy: contracts.TransparentProxy.withAddress(`0x${"a".repeat(40)}`),
};

export const FORK = {
  mainnet: {
    common: mainnet,
    rpcUrl: process.env.MAINNET_RPC_URL ?? "https://1.rpc.thirdweb.com",
    explorers: {
      etherscan: {
        baseUrl: "https://api.etherscan.io/api",
        apiKey: process.env.MAINNET_ETHERSCAN_API_KEY,
      },
      blockscout: {
        baseUrl: "https://eth.blockscout.com/api",
        apiKey: process.env.MAINNET_BLOCKSCOUT_API_KEY,
      },
    },
    contracts: {
      // UniswapERC20: contracts.SimpleERC20.withAddress("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"),
    },
  },
} as const;

export const ACCOUNTS = {
  caller: createAddress("0x0000000000000000000000000000000000000001"),
  recipient: createAddress("0x0000000000000000000000000000000000000002"),
  admin: createAddress("0x0000000000000000000000000000000000000003"),
};
