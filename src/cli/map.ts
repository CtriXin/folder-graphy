#!/usr/bin/env node
import { existsSync } from "fs";
import { resolve } from "path";
import { buildIndex } from "../indexer/builder.js";
import { findCallers, findDefinition, findReferences, formatResult } from "../query/engine.js";
import { findProjectRoot } from "../project.js";
import { ensureMapIndex, parseQueryCliOptions, resolveQueryProject } from "./shared.js";

function isPathLike(value: string): boolean {
  return value === "." || value.startsWith("/") || value.startsWith("./") || value.startsWith("../");
}

function usage(): void {
  console.log("Usage: map [path]");
  console.log("       map find <symbol> [--cwd <dir>] [--json]");
  console.log("       map callers <symbol> [--cwd <dir>] [--json]");
  console.log("       map refs <symbol> [--cwd <dir>] [--json]");
  console.log("");
  console.log("If the first argument looks like a path, map builds the index.");
  console.log("If the first argument is a symbol, map finds definitions.");
}

async function runBuild(inputPath?: string): Promise<void> {
  const projectPath = resolve(inputPath ?? findProjectRoot(process.cwd()) ?? process.cwd());
  if (!existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  const result = await buildIndex(projectPath);
  if (!result.success) {
    throw new Error(result.error ?? "map indexing failed");
  }

  console.log(`map indexed: ${projectPath}`);
  console.log(`SCIP: ${result.scipPath}`);
  console.log(`SQLite: ${result.dbPath}`);
  console.log(`Definitions: ${result.definitionCount}, Files: ${result.sourceFileCount}`);
}

async function printResults(mode: "find" | "callers" | "refs", symbol: string, args: string[]): Promise<void> {
  const { cwd, json } = parseQueryCliOptions(args, 0);
  const projectPath = resolveQueryProject(cwd);
  await ensureMapIndex(projectPath);
  const options = { cwd: projectPath };
  const results =
    mode === "find"
      ? findDefinition(symbol, options)
      : mode === "callers"
        ? findCallers(symbol, options)
        : findReferences(symbol, options);

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`No results found for \"${symbol}\".`);
    return;
  }

  console.log(`Found ${results.length} result(s) for \"${symbol}\":\n`);
  results.forEach((result) => console.log(formatResult(result)));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await runBuild();
    return;
  }

  if (args[0] === "-h" || args[0] === "--help") {
    usage();
    return;
  }

  const [command, maybeSymbol, ...rest] = args;

  if (command === "index") {
    await runBuild(maybeSymbol);
    return;
  }

  if (command === "find" || command === "callers" || command === "refs") {
    if (!maybeSymbol) {
      throw new Error(`${command} requires a symbol`);
    }
    await printResults(command, maybeSymbol, rest);
    return;
  }

  if (isPathLike(command) || existsSync(resolve(command))) {
    await runBuild(command);
    return;
  }

  await printResults("find", command, args.slice(1));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
