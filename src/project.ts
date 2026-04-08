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

export interface MapConfig {
  ignore?: string[];
  workspaceRoots?: string[];
  priorityRoots?: string[];
}

function isInDir(filePath: string, dirName: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.includes(`/${dirName}/`) || normalized.endsWith(`/${dirName}`);
}

export const defaultFileFilter: FileFilter = (ctx) => {
  const p = ctx.path.replace(/\\/g, "/");

  if (isInDir(p, "node_modules")) return false;
  if (isInDir(p, "dist")) return false;
  if (isInDir(p, "build")) return false;
  if (isInDir(p, ".git")) return false;
  if (isInDir(p, ".ai")) return false;
  if (isInDir(p, "coverage")) return false;
  if (isInDir(p, "vendor")) return false;

  if (p.endsWith(".d.ts")) return false;
  if (p.endsWith(".map")) return false;
  if (p.endsWith(".min.js")) return false;

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

export interface MapStatus {
  projectPath: string;
  projectType: ProjectType | null;
  indexed: boolean;
  stale: boolean;
  reasons: string[];
  layout: MapLayout;
  manifest: ProjectManifest | null;
  sourceFileCount: number | null;
  indexedFileCount: number | null;
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
const DEFAULT_WORKSPACE_ROOTS = ["apps", "packages", "services", "libs", "internal", "cmd"];
const DEFAULT_PRIORITY_ROOTS = ["src", "app", "pages", "server", "client", "lib"];

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  const normalized = normalizePathLike(pattern);
  const escaped = escapeRegex(normalized)
    .replace(/\\\*\\\*/g, ".*")
    .replace(/\\\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function configPaths(projectPath: string): string[] {
  return [
    join(projectPath, "map.config.json"),
    join(projectPath, ".map.json"),
    join(projectPath, ".ai", "map", "config.json"),
  ];
}

export function readMapConfig(projectPath: string): MapConfig {
  for (const path of configPaths(projectPath)) {
    if (!existsSync(path)) {
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as MapConfig;
      return {
        ignore: Array.isArray(parsed.ignore) ? parsed.ignore : [],
        workspaceRoots: Array.isArray(parsed.workspaceRoots) && parsed.workspaceRoots.length > 0 ? parsed.workspaceRoots : undefined,
        priorityRoots: Array.isArray(parsed.priorityRoots) && parsed.priorityRoots.length > 0 ? parsed.priorityRoots : undefined,
      };
    } catch {
      return {};
    }
  }
  return {};
}

export function getWorkspaceRoots(projectPath: string): string[] {
  const config = readMapConfig(projectPath);
  return config.workspaceRoots ?? DEFAULT_WORKSPACE_ROOTS;
}

export function getPriorityRoots(projectPath: string): string[] {
  const config = readMapConfig(projectPath);
  return config.priorityRoots ?? DEFAULT_PRIORITY_ROOTS;
}

export function normalizeProjectRelativePath(projectPath: string, inputPath: string): string {
  const absolutePath = inputPath.startsWith("/") ? inputPath : resolve(projectPath, inputPath);
  const relativePath = relative(projectPath, absolutePath);
  return normalizePathLike(relativePath === "" ? "." : relativePath);
}

function createConfigAwareFilter(projectPath: string, projectType: ProjectType, filter: FileFilter): FileFilter {
  const config = readMapConfig(projectPath);
  const ignorePatterns = (config.ignore ?? []).map(globToRegex);

  return (ctx) => {
    if (!filter(ctx)) {
      return false;
    }
    if (ignorePatterns.length === 0) {
      return true;
    }

    const rel = normalizeProjectRelativePath(projectPath, ctx.path);
    return !ignorePatterns.some((pattern) => pattern.test(rel));
  };
}

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
  const configAwareFilter = createConfigAwareFilter(projectPath, projectType, filter);

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

      if (entry.isFile() && shouldIncludeFile(projectType, absolutePath, configAwareFilter)) {
        files.push(absolutePath);
      }
    }
  }

  files.sort();
  return files;
}

export function toProjectRelative(projectPath: string, filePath: string): string {
  const rel = relative(projectPath, filePath);
  return rel === "" ? "." : normalizePathLike(rel);
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

function snapshotSourceFiles(projectPath: string, projectType: ProjectType): Array<{ path: string; mtimeMs: number; size: number }> {
  return collectSourceFiles(projectPath, projectType).map((filePath) => {
    const stat = statSync(filePath);
    return {
      path: toProjectRelative(projectPath, filePath),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  });
}

function compareFileSnapshots(
  currentFiles: Array<{ path: string; mtimeMs: number; size: number }>,
  indexedFiles: Array<{ path: string; mtimeMs: number; size: number }> | undefined,
): string[] {
  if (!indexedFiles || indexedFiles.length === 0) {
    return ["file_snapshot_missing"];
  }

  const reasons: string[] = [];
  if (currentFiles.length !== indexedFiles.length) {
    reasons.push("source_file_count_changed");
  }

  const indexedByPath = new Map(indexedFiles.map((file) => [file.path, file]));
  for (const file of currentFiles) {
    const indexed = indexedByPath.get(file.path);
    if (!indexed) {
      reasons.push("source_files_changed");
      break;
    }
    if (indexed.mtimeMs !== file.mtimeMs || indexed.size !== file.size) {
      reasons.push("source_content_changed");
      break;
    }
  }

  if (reasons.length === 0) {
    const currentPaths = new Set(currentFiles.map((file) => file.path));
    for (const file of indexedFiles) {
      if (!currentPaths.has(file.path)) {
        reasons.push("source_files_changed");
        break;
      }
    }
  }

  return reasons;
}

export function getMapStatus(projectPath: string): MapStatus {
  const resolvedProjectPath = resolve(projectPath);
  const layout = resolveMapLayout(resolvedProjectPath);
  const manifest = readManifest(resolvedProjectPath);
  const projectType = detectProjectType(resolvedProjectPath);
  const reasons: string[] = [];
  const hasManifest = manifest !== null;
  const hasScip = existsSync(layout.scipPath);
  const hasDb = existsSync(layout.dbPath);
  let currentFiles: Array<{ path: string; mtimeMs: number; size: number }> | null = null;

  if (!projectType) {
    reasons.push("unsupported_project_type");
  }
  if (!hasManifest) {
    reasons.push("manifest_missing");
  }
  if (!hasScip) {
    reasons.push("scip_missing");
  }
  if (!hasDb) {
    reasons.push("db_missing");
  }

  if (projectType) {
    currentFiles = snapshotSourceFiles(resolvedProjectPath, projectType);
  }

  if (manifest && projectType && currentFiles) {
    if (manifest.projectType !== projectType) {
      reasons.push("project_type_changed");
    }
    if (resolve(manifest.projectPath) !== resolvedProjectPath) {
      reasons.push("project_root_changed");
    }
    reasons.push(...compareFileSnapshots(currentFiles, manifest.files));
  }

  const indexed = hasManifest && hasScip && hasDb;
  const uniqueReasons = Array.from(new Set(reasons));
  return {
    projectPath: resolvedProjectPath,
    projectType,
    indexed,
    stale: uniqueReasons.length > 0,
    reasons: uniqueReasons,
    layout,
    manifest,
    sourceFileCount: currentFiles?.length ?? null,
    indexedFileCount: manifest?.sourceFileCount ?? null,
  };
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
