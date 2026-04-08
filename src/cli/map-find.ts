#!/usr/bin/env node
import { findDefinition, formatResult } from "../query/engine.js";
import { ensureMapIndex, parseQueryCliOptions, resolveQueryProject, toQueryOptions } from "./shared.js";

function usage(): void {
  console.error("Usage: map-find <symbol> [--cwd <dir>] [--scope <path>] [--changed] [--from <ref>] [--to <ref>] [--json]");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    usage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const symbol = args[0];
  const cliOptions = parseQueryCliOptions(args);
  const projectPath = resolveQueryProject(cliOptions.cwd);
  await ensureMapIndex(projectPath);

  const results = findDefinition(symbol, toQueryOptions(cliOptions, projectPath));
  if (cliOptions.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`No results found for \"${symbol}\".`);
    return;
  }

  results.forEach((result) => console.log(formatResult(result)));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
