#!/usr/bin/env node
import { findReferences, formatResult } from "../query/engine.js";
import { ensureMapIndex, parseQueryCliOptions, resolveQueryProject } from "./shared.js";

function usage(): void {
  console.error("Usage: map-refs <symbol> [--cwd <dir>] [--json]");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    usage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const symbol = args[0];
  const { cwd, json } = parseQueryCliOptions(args);
  const projectPath = resolveQueryProject(cwd);
  await ensureMapIndex(projectPath);

  const results = findReferences(symbol, { cwd: projectPath });
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`No references found for \"${symbol}\".`);
    return;
  }

  results.forEach((result) => console.log(formatResult(result)));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
