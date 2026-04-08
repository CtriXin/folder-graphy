#!/usr/bin/env node
import { execFileSync } from "child_process";
import { existsSync, statSync } from "fs";
import { resolve } from "path";

// Configuration priority:
// 1. Environment variable MAP_CLI_PATH
// 2. Global npm commands (map, map-find, etc.)
// 3. Auto-detect from common install locations
// 4. Fallback to built-in local path

const LOCAL_FALLBACK_PATH = "/Users/xin/auto-skills/CtriXin-repo/folder-graphy";

function detectCliPath() {
  // 1. Environment variable override
  if (process.env.MAP_CLI_PATH) {
    return process.env.MAP_CLI_PATH;
  }

  // 2. Check for global npm installation
  try {
    const globalPath = execFileSync("which", ["map"], { encoding: "utf-8" }).trim();
    if (globalPath && existsSync(globalPath)) {
      return resolve(globalPath, "..");
    }
  } catch {
    // Global not found, continue
  }

  // 3. Auto-detect from common locations
  const commonPaths = [
    resolve(process.env.HOME || "", ".local/share/map"),
    resolve(process.env.HOME || "", ".npm-global/lib/node_modules/@ctrixin/map"),
    "/usr/local/lib/node_modules/@ctrixin/map",
    "/usr/lib/node_modules/@ctrixin/map",
  ];

  for (const p of commonPaths) {
    if (existsSync(resolve(p, "dist/cli/map.js"))) {
      return p;
    }
  }

  // 4. Fallback to local development path
  return LOCAL_FALLBACK_PATH;
}

const repoRoot = detectCliPath();
const cliPath = resolve(repoRoot, "dist/cli/map.js");
const args = process.argv.slice(2);
const first = args[0];

function isPathLike(value) {
  return value === "." || value.startsWith("/") || value.startsWith("./") || value.startsWith("../");
}

function mapDbPath(projectPath) {
  return resolve(projectPath, ".ai/map/map.db");
}

function indexIsFresh(projectPath) {
  const dbPath = mapDbPath(projectPath);
  if (!existsSync(dbPath)) return false;
  try {
    return Date.now() - statSync(dbPath).mtimeMs < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function run(runArgs) {
  if (!existsSync(cliPath)) {
    console.error(`[map] CLI not found at: ${cliPath}`);
    console.error(`[map] Please install: npm install -g @ctrixin/map`);
    console.error(`[map] Or set MAP_CLI_PATH environment variable`);
    process.exit(1);
  }
  execFileSync("node", [cliPath, ...runArgs], { cwd: repoRoot, stdio: "inherit" });
}

if (!existsSync(cliPath)) {
  console.error(`Missing repo CLI build: ${cliPath}`);
  process.exit(1);
}

const cwd = process.cwd();
if (!first) {
  if (!indexIsFresh(cwd)) run([cwd]);
  process.exit(0);
}

if (first === "find" || first === "callers" || first === "refs" || first === "index") {
  if (first !== "index" && !indexIsFresh(cwd)) run([cwd]);
  run(first === "index" ? [args[1] || cwd] : [first, args[1], "--cwd", cwd]);
  process.exit(0);
}

if (isPathLike(first) || existsSync(resolve(first))) {
  run([resolve(first)]);
  process.exit(0);
}

if (!indexIsFresh(cwd)) run([cwd]);
run([first, "--cwd", cwd]);
