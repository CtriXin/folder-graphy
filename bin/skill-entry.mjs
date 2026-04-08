#!/usr/bin/env node

import { execFileSync } from "child_process";
import { existsSync, statSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const cliPath = resolve(repoRoot, "dist/cli/map.js");

function projectRootFromCwd() {
  return process.cwd();
}

function isPathLike(value) {
  return value === "." || value.startsWith("/") || value.startsWith("./") || value.startsWith("../");
}

function mapDbPath(projectPath) {
  return resolve(projectPath, ".ai/map/map.db");
}

function indexIsFresh(projectPath) {
  const dbPath = mapDbPath(projectPath);
  if (!existsSync(dbPath)) {
    return false;
  }

  try {
    const ageMs = Date.now() - statSync(dbPath).mtimeMs;
    return ageMs < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function run(args) {
  execFileSync("node", [cliPath, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

const args = process.argv.slice(2);
const first = args[0];

if (!existsSync(cliPath)) {
  console.error(`Missing CLI build: ${cliPath}`);
  console.error("Run `npm run build` in the map repo first.");
  process.exit(1);
}

if (!first) {
  const cwd = projectRootFromCwd();
  if (!indexIsFresh(cwd)) {
    run([cwd]);
  }
  process.exit(0);
}

if (first === "find" || first === "callers" || first === "refs" || first === "index") {
  const cwd = projectRootFromCwd();
  if (first !== "index" && !indexIsFresh(cwd)) {
    run([cwd]);
  }
  run(first === "index" ? [args[1] || cwd] : [first, args[1], "--cwd", cwd]);
  process.exit(0);
}

if (isPathLike(first) || existsSync(resolve(first))) {
  run([resolve(first)]);
  process.exit(0);
}

const cwd = projectRootFromCwd();
if (!indexIsFresh(cwd)) {
  run([cwd]);
}
run([first, "--cwd", cwd]);
