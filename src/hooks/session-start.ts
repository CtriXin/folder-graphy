#!/usr/bin/env node
import { checkIndexStatus, findProjectRoot, triggerMap } from "../integrations/mindkeeper.js";

async function main(): Promise<void> {
  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.log("[map] Not in a project directory, skipping auto-index.");
    process.exit(0);
  }

  const status = checkIndexStatus(root);
  if (!status.exists) {
    console.log("[map] No index found. Building...");
    process.exit((await triggerMap(root)) ? 0 : 1);
  }

  if (status.expired) {
    console.log(`[map] Index expired (${Math.round((status.ageMs || 0) / 1000 / 60)}m old). Updating...`);
    process.exit((await triggerMap(root)) ? 0 : 1);
  }

  console.log("[map] Index up to date.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[map] Error:", err);
  process.exit(1);
});
