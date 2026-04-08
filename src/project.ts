import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";

export type ProjectType = "typescript" | "go";

export interface FileContext {
  path: string;
  ext: string;
  projectType: ProjectType;
  mtimeMs?: number;
  size?: number;
}

export type FileFilter = (ctx: FileContext) => boolean;

function isInDir(filePath: string, dirName: string): boolean {
  // Check if filePath contains /{dirName}/ or ends with /{dirName}
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes(`/${dirName}/`) || normalized.endsWith(`/${dirName}`);
}

export const defaultFileFilter: FileFilter = (ctx) => {
  const p = ctx.path.replace(/\\/g, '/');

  // Directory-based filtering (path segment boundary)
  if (isInDir(p, 'node_modules')) return false;
  if (isInDir(p, 'dist')) return false;
  if (isInDir(p, 'build')) return false;
  if (isInDir(p, '.git')) return false;
  if (isInDir(p, '.ai')) return false;  // .ai/map is handled here
  if (isInDir(p, 'coverage')) return false;
  if (isInDir(p, 'vendor')) return false;

  // File extension/pattern based filtering
  if (p.endsWith('.d.ts')) return false;
  if (p.endsWith('.map')) return false;
  if (p.endsWith('.min.js')) return false;

  return true;
};

export interface MapLayout {
  dir: string;
  scipPath: string;
  dbPath: string;
  manifestPath: string;
}

export interface ProjectManifest {
  projectPath: string;
  projectType: ProjectType;
  indexedAt: string;
  scipPath: string;
  dbPath: string;
  definitionCount: number;
  sourceFileCount: number;
  files?: Array<{ path: string; mtimeMs: number; size: number }>;
}

const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".ai",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  "vendor",
  "tmp",
  "temp",
]);

const TYPE_SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);
const GO_EXTENSIONS = new Set([".go"]);

export function detectProjectType(projectPath: string): ProjectType | null {
  if (existsSync(join(projectPath, "tsconfig.json")) || existsSync(join(projectPath, "package.json"))) {
    return "typescript";
  }
  if (existsSync(join(projectPath, "go.mod"))) {
    return "go";
  }
  return null;
}

export function findProjectRoot(startPath: string = process.cwd()): string | null {
  let current = resolve(startPath);

  while (true) {
    if (detectProjectType(current)) {
      return current;
    }

    if (existsSync(join(current, ".git"))) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function resolveMapLayout(projectPath: string): MapLayout {
  const dir = join(projectPath, ".ai", "map");
  return {
    dir,
    scipPath: join(dir, "index.scip"),
    dbPath: join(dir, "map.db"),
    manifestPath: join(dir, "manifest.json"),
  };
}

export function ensureMapLayout(projectPath: string): MapLayout {
  const layout = resolveMapLayout(projectPath);
  mkdirSync(layout.dir, { recursive: true });
  return layout;
}

function fileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  return lastDot === -1 ? "" : filePath.slice(lastDot);
}

function shouldIncludeFile(projectType: ProjectType, filePath: string, filter: FileFilter = defaultFileFilter): boolean {
  const ext = fileExtension(filePath).toLowerCase();
  const isSourceFile = projectType === "typescript"
    ? TYPE_SCRIPT_EXTENSIONS.has(ext)
    : GO_EXTENSIONS.has(ext);
  if (!isSourceFile) return false;

  const ctx: FileContext = { path: filePath, ext, projectType };
  return filter(ctx);
}

export function collectSourceFiles(
  projectPath: string,
  projectType: ProjectType,
  filter: FileFilter = defaultFileFilter,
): string[] {
  const files: string[] = [];
  const stack = [projectPath];

  while (stack.length > 0) {
    const currentDir = stack.pop() as string;
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") {
        if (entry.isDirectory() && entry.name !== ".ai") {
          continue;
        }
      }

      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          stack.push(absolutePath);
        }
        continue;
      }

      if (entry.isFile() && shouldIncludeFile(projectType, absolutePath, filter)) {
        files.push(absolutePath);
      }
    }
  }

  files.sort();
  return files;
}

export function toProjectRelative(projectPath: string, filePath: string): string {
  const rel = relative(projectPath, filePath);
  return rel === "" ? "." : rel;
}

export function readManifest(projectPath: string): ProjectManifest | null {
  const { manifestPath } = resolveMapLayout(projectPath);
  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8")) as ProjectManifest;
  } catch {
    return null;
  }
}

export function indexAgeMs(projectPath: string): number | null {
  const manifest = readManifest(projectPath);
  if (!manifest) {
    return null;
  }

  try {
    return Date.now() - statSync(manifest.dbPath).mtimeMs;
  } catch {
    return null;
  }
}
