import fs from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { createCache } from "@tevm/bundler-cache";
import { FileAccessObject } from "tevm/bundler";
import { ResolvedCompilerConfig } from "tevm/bundler/config";
import { createSolc, SolcStorageLayout } from "tevm/bundler/solc";

import { debug } from "@/debug";

// Get the equivalent of __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Setup file access and cache similar to setup.ts
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

const generateStorageLayouts = async () => {
  // Create output directory if it doesn't exist
  const outputDir = join(__dirname, "generated/layouts");
  await mkdir(outputDir, { recursive: true });

  // Get the contracts directory
  const contractsDir = join(process.cwd(), ".tevm/test/contracts");

  // Find all artifacts.json files recursively
  const artifactFiles = await findArtifactFiles(contractsDir);

  // Keep track of all generated contract names for the index file
  const generatedContracts: string[] = [];

  for (const artifactFile of artifactFiles) {
    try {
      const dirPath = dirname(artifactFile);
      const relativePath = dirPath.replace(process.cwd() + "/", "");

      debug(`Processing artifact: ${relativePath}`);

      // Read and parse the artifact file
      const artifactContent = await readFile(artifactFile, "utf8");
      const artifact = JSON.parse(artifactContent);

      // Get contract name
      // @ts-ignore
      const contractName = Object.values(artifact.artifacts)[0].contractName;

      if (!contractName) {
        debug(`Could not find contract name in artifact: ${artifactFile}`);
        continue;
      }

      debug(`Processing contract: ${contractName}`);

      // Try to read from cache first
      const artifacts = cache.readArtifactsSync(relativePath);
      let storageLayout: SolcStorageLayout | undefined;

      // Check if we already have the storage layout in the cache
      if (artifacts?.solcOutput?.contracts) {
        const contracts = Object.values(artifacts.solcOutput.contracts).flatMap((source) => Object.values(source));

        for (const contract of contracts) {
          if (contract.storageLayout) {
            storageLayout = contract.storageLayout as unknown as SolcStorageLayout;
            break;
          }
        }
      }

      // If not found in cache, generate it
      if (!storageLayout) {
        const solcInput = artifact.solcInput;
        const solc = await createSolc("0.8.23");

        const output = solc.compile({
          language: solcInput?.language ?? "Solidity",
          settings: {
            evmVersion: solcInput?.settings?.evmVersion ?? "paris",
            outputSelection: {
              "*": {
                "*": ["storageLayout"],
              },
            },
          },
          sources: solcInput?.sources ?? {},
        });

        if (output.errors?.some((error) => error.severity === "error")) {
          debug(`Compilation errors for ${contractName}:`, output.errors);
          continue;
        }

        // Find the contract in the output
        for (const sourcePath in output.contracts) {
          if (output.contracts[sourcePath][contractName]) {
            storageLayout = output.contracts[sourcePath][contractName].storageLayout as unknown as SolcStorageLayout;
            break;
          }
        }

        // Update cache with the new storage layout
        if (storageLayout && artifacts) {
          // Find the source path for this contract
          const sourcePath = Object.keys(output.contracts).find((path) => output.contracts[path][contractName]);

          if (sourcePath) {
            cache.writeArtifactsSync(relativePath, {
              ...artifacts,
              // @ts-ignore
              solcOutput: {
                ...artifacts.solcOutput,
                contracts: {
                  ...artifacts.solcOutput?.contracts,
                  [sourcePath]: {
                    ...artifacts.solcOutput?.contracts?.[sourcePath],
                    [contractName]: {
                      ...artifacts.solcOutput?.contracts?.[sourcePath]?.[contractName],
                      storageLayout,
                    },
                  },
                },
              },
            });
          }
        }
      }

      if (!storageLayout) {
        debug(`No storage layout generated for ${contractName}`);
        continue;
      }

      // Generate output file
      const outputPath = join(outputDir, `${contractName}.ts`);
      const outputContent = `// Generated storage layout for ${contractName}
export default ${JSON.stringify(storageLayout, null, 2)} as const;
`;

      fs.writeFileSync(outputPath, outputContent);
      debug(`Generated storage layout for ${contractName} at ${outputPath}`);

      // Add to the list of generated contracts
      generatedContracts.push(contractName);
    } catch (error) {
      debug(`Error processing artifact:`, error);
    }
  }

  // Generate the index file
  if (generatedContracts.length > 0) {
    const indexPath = join(outputDir, "index.ts");
    const indexContent =
      generatedContracts.map((name) => `export { default as ${name} } from "./${name}";`).join("\n") + "\n";

    fs.writeFileSync(indexPath, indexContent);
    debug(`Generated index file with ${generatedContracts.length} layouts`);
  }
};

// Helper function to find all artifacts.json files recursively
async function findArtifactFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir, { withFileTypes: true });
  const artifactFiles: string[] = [];

  for (const file of files) {
    const path = join(dir, file.name);

    if (file.isDirectory()) {
      artifactFiles.push(...(await findArtifactFiles(path)));
    } else if (file.name === "artifacts.json") {
      artifactFiles.push(path);
    }
  }

  return artifactFiles;
}

// Run the script
generateStorageLayouts()
  .then(() => {
    console.log("Storage layout generation complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error generating storage layouts:", error);
    process.exit(1);
  });
