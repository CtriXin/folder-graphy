#!/usr/bin/env node
import { resolve } from "path";
import { existsSync } from "fs";
import { detectProjectType, buildIndex, IndexResult } from "../indexer/builder.js";

interface CliArgs {
  project: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { project: process.cwd(), help: false };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--project" || flag === "-p") {
      args.project = argv[++i];
    } else if (flag === "--help" || flag === "-h") {
      args.help = true;
    } else {
      console.error(`Unknown argument: ${flag}`);
      process.exit(1);
    }
  }
  return args;
}

function printUsage(): void {
  console.log("Usage: fg-index --project <path>");
  console.log("");
  console.log("Options:");
  console.log("  --project, -p  Path to the project root (default: cwd)");
  console.log("  --help,    -h  Show this help message");
  console.log("");
  console.log("Automatically detects project type (ts/go), runs the");
  console.log("appropriate SCIP indexer, and writes results to SQLite.");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const projectPath = resolve(args.project);
  if (!existsSync(projectPath)) {
    console.error(`Error: project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  const projectType = detectProjectType(projectPath);
  if (!projectType) {
    console.error(`Error: unable to detect project type in ${projectPath}`);
    console.error("Supported types: typescript (tsconfig.json), go (go.mod)");
    process.exit(1);
  }

  console.log(`Detected project type: ${projectType}`);
  console.log(`Project path: ${projectPath}`);

  const result: IndexResult = await buildIndex(projectPath, projectType);

  if (result.success) {
    console.log(`Index written to: ${result.dbPath}`);
    console.log(`Documents: ${result.documentCount}, Symbols: ${result.symbolCount}`);
  } else {
    console.error(`Indexing failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
