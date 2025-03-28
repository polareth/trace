import fs from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "path";
import { createCache } from "@tevm/bundler-cache";
import { createMemoryClient } from "tevm";
import { FileAccessObject } from "tevm/bundler";
import { ResolvedCompilerConfig } from "tevm/bundler/config";
import { createSolc, SolcStorageLayout, SolcStorageLayoutItem, SolcStorageLayoutTypes } from "tevm/bundler/solc";
import { EthjsAccount, parseEther } from "tevm/utils";
import { toFunctionSelector } from "viem";
import { beforeEach, vi } from "vitest";

import { ACCOUNTS, CONTRACTS } from "@test/constants";
import { debug } from "@/debug";
import * as storageLayout from "@/lib/storage-layout";

beforeEach(async () => {
  const client = createMemoryClient({ loggingLevel: "warn" });
  // @ts-expect-error type
  globalThis.client = client;

  // Initialize accounts
  const vm = await client.transport.tevm.getVm();
  await Promise.all(
    Object.values(ACCOUNTS).map((account) =>
      vm.stateManager.putAccount(
        account,
        EthjsAccount.fromAccountData({
          balance: parseEther("10"),
          nonce: 0n,
        }),
      ),
    ),
  );

  // Initialize contracts
  await Promise.all(Object.values(CONTRACTS).map((contract) => client.tevmSetAccount(contract)));

  // Setup mocks for contract-related functions
  if (process.env.TEST_ENV !== "staging") setupContractsMock();
});

const config = JSON.parse(fs.readFileSync(join(__dirname, "../tevm.config.json"), "utf8")) as ResolvedCompilerConfig;
const fileAccess: FileAccessObject = {
  writeFileSync: fs.writeFileSync,
  writeFile,
  readFile: (path, encoding) => fs.promises.readFile(path, { encoding }),
  readFileSync: fs.readFileSync,
  exists: async (path) => !!(await fs.promises.stat(path).catch(() => false)),
  existsSync: fs.existsSync,
  statSync: fs.statSync,
  stat,
  mkdirSync: fs.mkdirSync,
  mkdir,
};

const cache = createCache(config.cacheDir, fileAccess, process.cwd());

/**
 * Create a mock for the getContracts function that returns contract information directly from our test contracts rather
 * than fetching from external APIs.
 */
const setupContractsMock = () => {
  // Mock the getContracts function
  vi.spyOn(storageLayout, "getContracts").mockImplementation(async ({ addresses }) => {
    return Object.fromEntries(
      addresses.map((address) => {
        const contract = Object.values(CONTRACTS).find((contract) => contract.address === address);
        if (!contract) {
          return [
            address,
            {
              sources: [],
              abi: [],
            },
          ];
        }

        const output = cache.readArtifactsSync(getContractPath(contract.name ?? ""));
        return [
          address,
          {
            metadata: {
              name: contract.name,
            },
            sources: Object.fromEntries(
              Object.entries(output?.modules ?? {}).map(([path, source]) => [path, source.code]),
            ),
            abi: Object.values(output?.artifacts ?? {})
              .flatMap((artifact) => artifact.abi)
              .map((item) => {
                if (item.type === "function") {
                  return { ...item, selector: toFunctionSelector(item) };
                } else {
                  return item;
                }
              }),
          },
        ];
      }),
    );
  });

  vi.spyOn(storageLayout, "getStorageLayout").mockImplementation(async ({ address, sources }) => {
    // Return empty layout if we're missing critical information
    if (!sources || sources.length === 0) {
      debug(`Missing compiler info for ${address}. Cannot generate storage layout.`);
      return undefined;
    }

    try {
      const contract = Object.values(CONTRACTS).find((contract) => contract.address === address);
      const contractPath = getContractPath(contract?.name ?? "");
      const artifacts = cache.readArtifactsSync(contractPath);

      let layouts = Object.values(artifacts?.solcOutput?.contracts ?? {})
        .flatMap(
          (source) =>
            Object.values(source).flatMap((contract) => contract.storageLayout as unknown as SolcStorageLayout), // TODO: wrong type, soon fixed
        )
        .filter(Boolean);

      if (layouts.length === 0) {
        const solcInput = artifacts?.solcInput;
        const solc = await createSolc("0.8.23");

        const output = solc.compile({
          language: solcInput?.language ?? "Solidity",
          settings: {
            evmVersion: solcInput?.settings?.evmVersion ?? "paris",
            outputSelection: {
              "*": {
                "*": [...(solcInput?.settings?.outputSelection["*"]["*"] ?? []), "storageLayout"],
              },
            },
          },
          sources: solcInput?.sources ?? {},
        });

        layouts = Object.values(output.contracts)
          .flatMap((layouts) => Object.values(layouts))
          .map((l) => l.storageLayout) as unknown as Array<SolcStorageLayout>;

        cache.writeArtifactsSync(contractPath, {
          ...artifacts,
          solcOutput: {
            ...artifacts?.solcOutput,
            // @ts-expect-error undefined abi
            contracts: {
              ...artifacts?.solcOutput?.contracts,
              [join(process.cwd(), contractPath)]: {
                ...artifacts?.solcOutput?.contracts?.[contractPath],
                [contract?.name ?? ""]: {
                  ...artifacts?.solcOutput?.contracts?.[contractPath]?.[contract?.name ?? ""],
                  storageLayout: layouts,
                },
              },
            },
          },
        });
      }

      // Aggregate all storage items and types from different layouts
      const aggregatedTypes: SolcStorageLayoutTypes = layouts.reduce((acc, layout) => {
        if (!layout?.types) return acc;
        return { ...acc, ...layout.types };
      }, {} as SolcStorageLayoutTypes);

      // Now that we have all types, we can properly type the storage items
      const aggregatedStorage: Array<SolcStorageLayoutItem<typeof aggregatedTypes>> = layouts.reduce(
        (acc, layout) => {
          if (!layout?.storage) return acc;
          return [...acc, ...layout.storage];
        },
        [] as Array<SolcStorageLayoutItem<typeof aggregatedTypes>>,
      );

      // Return a storage layout adapter for advanced access patterns
      return {
        storage: aggregatedStorage,
        types: aggregatedTypes,
      };
    } catch (error) {
      debug(`Error generating storage layout for ${address}:`, error);
      return undefined;
    }
  });
};

const getContractPath = (name: string) => {
  const indexPath = join(__dirname, "contracts/index.ts");

  try {
    const indexContent = fs.readFileSync(indexPath, "utf8");
    // Find the export line for this contract
    const regex = new RegExp(`export\\s+\\{\\s*${name}(?:\\s*,\\s*[\\w]+)*\\s*\\}\\s+from\\s+["'](.+?)["']`);
    const match = indexContent.match(regex);

    if (match && match[1]) {
      const path = match[1].replace(/^\.\//, ""); // Remove leading "./" if present
      return `test/contracts/${path}`;
    }
  } catch (error) {
    console.warn(`Could not find contract path for ${name}:`, error);
  }

  return "";
};
