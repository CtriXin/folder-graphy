#!/usr/bin/env node
/**
 * Session start hook for MindKeeper integration
 * Automatically triggers fg-index when entering a project with outdated/missing index
 */

import { checkIndexStatus, triggerFgIndex, findProjectRoot } from '../integrations/mindkeeper.js';

async function main(): Promise<void> {
  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.log('[folder-graphy] Not in a project directory, skipping auto-index.');
    process.exit(0);
  }

  const status = checkIndexStatus(root);

  if (!status.exists) {
    console.log('[folder-graphy] No index found. Building...');
    const triggered = await triggerFgIndex(root);
    process.exit(triggered ? 0 : 1);
  }

  if (status.expired) {
    console.log(`[folder-graphy] Index expired (${Math.round((status.ageMs || 0) / 1000 / 60)}m old). Updating...`);
    const triggered = await triggerFgIndex(root);
    process.exit(triggered ? 0 : 1);
  }

  console.log('[folder-graphy] Index up to date.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[folder-graphy] Error:', err);
  process.exit(1);
});
