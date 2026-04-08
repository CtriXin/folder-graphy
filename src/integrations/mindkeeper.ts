import { existsSync, statSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

export interface IndexState {
  exists: boolean;
  expired: boolean;
  path: string | null;
  ageMs: number | null;
}

export interface MindKeeperConfig {
  enabled: boolean;
  indexDir: string;
  maxAgeMs: number;
  triggerOnEntry: boolean;
  silent: boolean;
}

const DEFAULT_CONFIG: MindKeeperConfig = {
  enabled: true,
  indexDir: '.ai/mindkeeper',
  maxAgeMs: 4 * 60 * 60 * 1000,
  triggerOnEntry: true,
  silent: false,
};

const INDEX_FILES = ['index.json', 'index.db', 'graph.json'];

function findProjectRoot(startPath: string): string | null {
  let dir = resolve(startPath);
  const visited = new Set<string>();
  while (!visited.has(dir)) {
    visited.add(dir);
    if (existsSync(join(dir, '.git'))) return dir;
    if (existsSync(join(dir, '.ai'))) return dir;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function probeIndexPath(root: string, config: MindKeeperConfig): string | null {
  const base = join(root, config.indexDir);
  if (!existsSync(base)) return null;
  for (const name of INDEX_FILES) {
    const candidate = join(base, name);
    if (existsSync(candidate)) return candidate;
  }
  const entries = readdirSync(base).filter(f => !f.startsWith('.'));
  if (entries.length > 0) return join(base, entries[0]);
  return null;
}

export function checkIndexStatus(projectRoot: string, config?: Partial<MindKeeperConfig>): IndexState {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const root = projectRoot || findProjectRoot(process.cwd());
  if (!root) return { exists: false, expired: false, path: null, ageMs: null };

  const indexPath = probeIndexPath(root, cfg);
  if (!indexPath) return { exists: false, expired: true, path: null, ageMs: null };

  try {
    const stat = statSync(indexPath);
    const ageMs = Date.now() - stat.mtimeMs;
    return {
      exists: true,
      expired: ageMs > cfg.maxAgeMs,
      path: indexPath,
      ageMs,
    };
  } catch {
    return { exists: false, expired: true, path: indexPath, ageMs: null };
  }
}

export async function triggerFgIndex(projectRoot: string, config?: Partial<MindKeeperConfig>): Promise<boolean> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.enabled || !cfg.triggerOnEntry) return false;

  const status = checkIndexStatus(projectRoot, cfg);
  if (status.exists && !status.expired) return false;

  try {
    const { execSync } = await import('child_process');
    const root = projectRoot || findProjectRoot(process.cwd());
    if (!root) return false;

    const fgIndexCmd = 'npx fg-index';
    execSync(fgIndexCmd, {
      cwd: root,
      stdio: cfg.silent ? 'pipe' : 'inherit',
      timeout: 60_000,
    });
    return true;
  } catch {
    if (!cfg.silent) {
      console.warn('[mindkeeper] fg-index failed or not installed. Skipping auto-index.');
    }
    return false;
  }
}

export function createConfig(overrides?: Partial<MindKeeperConfig>): MindKeeperConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

export { findProjectRoot, DEFAULT_CONFIG };
