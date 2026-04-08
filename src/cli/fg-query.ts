#!/usr/bin/env node
import {
  findDefinition,
  findReferences,
  findCallers,
  QueryResult,
} from "../query/engine.js";

type QueryCommand = "findDefinition" | "findReferences" | "findCallers";

function usage(): void {
  const lines = [
    "Usage: fg-query <command> <symbol> [options]",
    "",
    "Commands:",
    "  findDefinition <symbol>   Find where a symbol is defined",
    "  findReferences <symbol>   Find all references to a symbol",
    "  findCallers <symbol>      Find all callers of a symbol",
    "",
    "Options:",
    "  --cwd <dir>               Working directory (default: git root or cwd)",
    "  --json                    Output results as JSON",
    "  -h, --help                Show this help",
  ];
  console.error(lines.join("\n"));
}

function formatResult(r: QueryResult): string {
  const kindTag =
    r.kind === "definition"
      ? "[DEF]"
      : r.kind === "call"
        ? "[CALL]"
        : "[REF]";
  return `${kindTag} ${r.file}:${r.line}  ${r.text}`;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    usage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const validCommands = new Set<string>([
    "findDefinition",
    "findReferences",
    "findCallers",
  ]);
  const command = args[0] as QueryCommand;

  if (!validCommands.has(command)) {
    console.error(`Error: unknown command "${command}"\n`);
    usage();
    process.exit(2);
  }

  const symbol = args[1];
  if (!symbol) {
    console.error(`Error: <symbol> is required for "${command}"\n`);
    usage();
    process.exit(2);
  }

  let cwd: string | undefined;
  let jsonOutput = false;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--cwd" && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === "--json") {
      jsonOutput = true;
    }
  }

  const options = cwd ? { cwd } : {};
  let results: QueryResult[];

  switch (command) {
    case "findDefinition":
      results = findDefinition(symbol, options);
      break;
    case "findReferences":
      results = findReferences(symbol, options);
      break;
    case "findCallers":
      results = findCallers(symbol, options);
      break;
  }

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    if (results.length === 0) {
      console.log(`No results found for "${symbol}".`);
      return;
    }
    console.log(`Found ${results.length} result(s) for "${symbol}":\n`);
    results.forEach((r) => console.log(formatResult(r)));
  }
}

main();
