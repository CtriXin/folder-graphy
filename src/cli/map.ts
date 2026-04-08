#!/usr/bin/env node
import { existsSync } from "fs";
import { resolve } from "path";
import { buildIndex } from "../indexer/builder.js";
import { findCallers, findDefinition, findReferences, formatResult } from "../query/engine.js";
import { findProjectRoot, getMapStatus } from "../project.js";
import { ensureMapIndex, parseQueryCliOptions, resolveQueryProject, toQueryOptions } from "./shared.js";

function isPathLike(value: string): boolean {
  return value === "." || value.startsWith("/") || value.startsWith("./") || value.startsWith("../");
}

function usage(): void {
  console.log("Usage: map [path]");
  console.log("       map index [path]");
  console.log("       map status [--cwd <dir>] [--json]");
  console.log("       map find <symbol> [--cwd <dir>] [--scope <path>] [--changed] [--from <ref>] [--to <ref>] [--json]");
  console.log("       map callers <symbol> [--cwd <dir>] [--scope <path>] [--changed] [--from <ref>] [--to <ref>] [--json]");
  console.log("       map refs <symbol> [--cwd <dir>] [--scope <path>] [--changed] [--from <ref>] [--to <ref>] [--json]");
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

function printStatus(args: string[]): void {
  const { cwd, json } = parseQueryCliOptions(args, 0);
  const projectPath = resolveQueryProject(cwd);
  const status = getMapStatus(projectPath);

  if (json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(`Project: ${status.projectPath}`);
  console.log(`Type: ${status.projectType ?? "unknown"}`);
  console.log(`Indexed: ${status.indexed ? "yes" : "no"}`);
  console.log(`Fresh: ${status.indexed && !status.stale ? "yes" : "no"}`);
  console.log(`Files: current=${status.sourceFileCount ?? "n/a"}, indexed=${status.indexedFileCount ?? "n/a"}`);
  console.log(`SCIP: ${status.layout.scipPath}`);
  console.log(`SQLite: ${status.layout.dbPath}`);
  console.log(`Reasons: ${status.reasons.length === 0 ? "fresh" : status.reasons.join(", ")}`);
}

async function printResults(mode: "find" | "callers" | "refs", symbol: string, args: string[]): Promise<void> {
  const cliOptions = parseQueryCliOptions(args, 0);
  const projectPath = resolveQueryProject(cliOptions.cwd);
  await ensureMapIndex(projectPath);
  const queryOptions = toQueryOptions(cliOptions, projectPath);
  const results =
    mode === "find"
      ? findDefinition(symbol, queryOptions)
      : mode === "callers"
        ? findCallers(symbol, queryOptions)
        : findReferences(symbol, queryOptions);

  if (cliOptions.json) {
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

  if (command === "status") {
    printStatus([maybeSymbol, ...rest].filter((value): value is string => Boolean(value)));
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
