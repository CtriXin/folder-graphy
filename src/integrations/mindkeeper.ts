import { existsSync, statSync } from "fs";
import { resolve } from "path";
import { execFileSync } from "child_process";
import { findProjectRoot, resolveMapLayout } from "../project.js";

export interface IndexState {
  exists: boolean;
  expired: boolean;
  path: string | null;
  ageMs: number | null;
}

export interface MindKeeperConfig {
  enabled: boolean;
  maxAgeMs: number;
  triggerOnEntry: boolean;
  silent: boolean;
}

const DEFAULT_CONFIG: MindKeeperConfig = {
  enabled: true,
  maxAgeMs: 4 * 60 * 60 * 1000,
  triggerOnEntry: true,
  silent: false,
};

export function checkIndexStatus(projectRoot: string, config?: Partial<MindKeeperConfig>): IndexState {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const root = projectRoot || findProjectRoot(process.cwd());
  if (!root) {
    return { exists: false, expired: false, path: null, ageMs: null };
  }

  const { dbPath } = resolveMapLayout(root);
  if (!existsSync(dbPath)) {
    return { exists: false, expired: true, path: null, ageMs: null };
  }

  try {
    const ageMs = Date.now() - statSync(dbPath).mtimeMs;
    return { exists: true, expired: ageMs > cfg.maxAgeMs, path: dbPath, ageMs };
  } catch {
    return { exists: false, expired: true, path: dbPath, ageMs: null };
  }
}

export async function triggerMap(projectRoot: string, config?: Partial<MindKeeperConfig>): Promise<boolean> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.enabled || !cfg.triggerOnEntry) {
    return false;
  }

  const root = projectRoot || findProjectRoot(process.cwd());
  if (!root) {
    return false;
  }

  const mapCli = resolve(root, "dist/cli/map.js");
  try {
    execFileSync("node", [mapCli, root], {
      cwd: root,
      stdio: cfg.silent ? "pipe" : "inherit",
      timeout: 60_000,
    });
    return true;
  } catch {
    if (!cfg.silent) {
      console.warn("[map] map index failed. Skipping auto-index.");
    }
    return false;
  }
}

export function createConfig(overrides?: Partial<MindKeeperConfig>): MindKeeperConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

export { findProjectRoot, DEFAULT_CONFIG };
