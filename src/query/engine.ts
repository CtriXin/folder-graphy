import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import Database from "better-sqlite3";
import { getChangedFiles, getUntrackedFiles } from "../git/diff.js";
import {
  ProjectType,
  collectSourceFiles,
  defaultFileFilter,
  detectProjectType,
  findProjectRoot,
  getPriorityRoots,
  getWorkspaceRoots,
  normalizeProjectRelativePath,
  resolveMapLayout,
  toProjectRelative,
  type FileFilter,
} from "../project.js";

export interface QueryResult {
  file: string;
  line: number;
  column: number;
  text: string;
  kind: "definition" | "reference" | "call";
}

export interface QueryOptions {
  cwd?: string;
  projectPath?: string;
  limit?: number;
  scope?: string[];
  changed?: boolean;
  fromRef?: string;
  toRef?: string;
}

interface RankedResult extends QueryResult {
  importedSymbol: boolean;
}

interface QueryContext {
  projectPath: string;
  projectType: ProjectType;
  cwdRelative: string;
  scopes: string[];
  changed: boolean;
  changedFiles: Set<string>;
  changedDirs: Set<string>;
  changedUnits: Set<string>;
  workspaceRoots: string[];
  priorityRoots: string[];
  cwdWorkspace: string | null;
  importCache: Map<string, boolean>;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveProjectPath(options: QueryOptions = {}): string {
  const start = options.projectPath ?? options.cwd ?? process.cwd();
  return findProjectRoot(start) ?? resolve(start);
}

function detectTypeOrThrow(projectPath: string): ProjectType {
  const projectType = detectProjectType(projectPath);
  if (!projectType) {
    throw new Error(`Unable to detect project type for ${projectPath}`);
  }
  return projectType;
}

function maxResults(options: QueryOptions): number {
  return options.limit ?? 50;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

function fileDirectory(file: string): string {
  const normalized = normalizeRelativePath(file);
  const dir = dirname(normalized);
  return dir === "." ? "." : normalizeRelativePath(dir);
}

function commonPrefixDepth(left: string, right: string): number {
  const a = normalizeRelativePath(left).split("/").filter(Boolean);
  const b = normalizeRelativePath(right).split("/").filter(Boolean);
  let depth = 0;
  while (depth < a.length && depth < b.length && a[depth] === b[depth]) {
    depth++;
  }
  return depth;
}

function workspaceUnit(file: string, workspaceRoots: string[]): string | null {
  const parts = normalizeRelativePath(file).split("/").filter(Boolean);
  if (parts.length >= 2 && workspaceRoots.includes(parts[0])) {
    return `${parts[0]}/${parts[1]}`;
  }
  return null;
}

function priorityRootPenalty(file: string, priorityRoots: string[]): number {
  const parts = normalizeRelativePath(file).split("/").filter(Boolean);
  if (parts.length === 0) {
    return priorityRoots.length + 1;
  }
  const index = priorityRoots.indexOf(parts[0]);
  return index === -1 ? priorityRoots.length + 1 : index;
}

function normalizeScopes(projectPath: string, cwd: string, workspaceRoots: string[], scopes?: string[]): string[] {
  if (!scopes || scopes.length === 0) {
    return [];
  }

  return scopes
    .map((scope) => {
      if (scope.startsWith("/")) {
        return normalizeProjectRelativePath(projectPath, scope);
      }

      const normalized = normalizeRelativePath(scope);
      const firstSegment = normalized.split("/")[0];
      const projectCandidate = resolve(projectPath, scope);
      const cwdCandidate = resolve(cwd, scope);
      const useProjectRoot =
        workspaceRoots.includes(firstSegment) ||
        (existsSync(projectCandidate) && !existsSync(cwdCandidate));

      return normalizeProjectRelativePath(projectPath, useProjectRoot ? projectCandidate : cwdCandidate);
    })
    .filter((scope, index, list) => scope === "." || list.indexOf(scope) === index);
}

function matchesScope(file: string, scopes: string[]): boolean {
  if (scopes.length === 0) {
    return true;
  }

  return scopes.some((scope) => scope === "." || file === scope || file.startsWith(`${scope}/`));
}

function loadChangedContext(projectPath: string, options: QueryOptions, workspaceRoots: string[]): {
  changedFiles: Set<string>;
  changedDirs: Set<string>;
  changedUnits: Set<string>;
} {
  if (!options.changed) {
    return { changedFiles: new Set(), changedDirs: new Set(), changedUnits: new Set() };
  }

  const changedFiles = new Set<string>();
  try {
    const diff = getChangedFiles({ cwd: projectPath, fromRef: options.fromRef, toRef: options.toRef });
    for (const file of diff.files) {
      if (file.status === "deleted") {
        continue;
      }
      changedFiles.add(normalizeRelativePath(file.path));
      if (file.oldPath) {
        changedFiles.add(normalizeRelativePath(file.oldPath));
      }
    }
    for (const file of getUntrackedFiles(projectPath)) {
      changedFiles.add(normalizeRelativePath(file));
    }
  } catch {
    return { changedFiles: new Set(), changedDirs: new Set(), changedUnits: new Set() };
  }

  const changedDirs = new Set<string>();
  const changedUnits = new Set<string>();
  for (const file of changedFiles) {
    changedDirs.add(fileDirectory(file));
    const unit = workspaceUnit(file, workspaceRoots);
    if (unit) {
      changedUnits.add(unit);
    }
  }

  return { changedFiles, changedDirs, changedUnits };
}

function createQueryContext(projectPath: string, projectType: ProjectType, options: QueryOptions): QueryContext {
  const cwd = resolve(options.cwd ?? projectPath);
  const cwdRelative = normalizeProjectRelativePath(projectPath, cwd);
  const workspaceRoots = getWorkspaceRoots(projectPath);
  const priorityRoots = getPriorityRoots(projectPath);
  const scopes = normalizeScopes(projectPath, cwd, workspaceRoots, options.scope);
  const changedContext = loadChangedContext(projectPath, options, workspaceRoots);

  return {
    projectPath,
    projectType,
    cwdRelative,
    scopes,
    changed: Boolean(options.changed),
    changedFiles: changedContext.changedFiles,
    changedDirs: changedContext.changedDirs,
    changedUnits: changedContext.changedUnits,
    workspaceRoots,
    priorityRoots,
    cwdWorkspace: workspaceUnit(cwdRelative, workspaceRoots),
    importCache: new Map(),
  };
}

function workspacePenalty(file: string, context: QueryContext): number {
  const fileUnit = workspaceUnit(file, context.workspaceRoots);
  if (!context.cwdWorkspace) {
    return fileUnit ? 1 : 0;
  }
  if (fileUnit === context.cwdWorkspace) {
    return 0;
  }
  if (fileUnit && fileUnit.split("/")[0] === context.cwdWorkspace.split("/")[0]) {
    return 1;
  }
  if (fileUnit && fileUnit.startsWith("packages/")) {
    return 2;
  }
  return 3;
}

function cwdDistancePenalty(file: string, context: QueryContext): number {
  const cwdDir = fileDirectory(context.cwdRelative);
  if (cwdDir === ".") {
    return 0;
  }
  const fileDir = fileDirectory(file);
  if (fileDir === cwdDir) {
    return 0;
  }
  return Math.max(0, 6 - commonPrefixDepth(fileDir, cwdDir));
}

function changedPenalty(file: string, context: QueryContext): number {
  if (!context.changed || context.changedFiles.size === 0) {
    return 3;
  }
  if (context.changedFiles.has(file)) {
    return 0;
  }

  const dir = fileDirectory(file);
  if (context.changedDirs.has(dir)) {
    return 1;
  }

  const unit = workspaceUnit(file, context.workspaceRoots);
  if (unit && context.changedUnits.has(unit)) {
    return 2;
  }

  return 3;
}

function importsSymbol(file: string, symbol: string, context: QueryContext): boolean {
  if (context.projectType !== "typescript") {
    return false;
  }

  const cacheKey = `${file}:${symbol}`;
  const cached = context.importCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const absolutePath = resolve(context.projectPath, file);
  if (!existsSync(absolutePath)) {
    context.importCache.set(cacheKey, false);
    return false;
  }

  const content = readFileSync(absolutePath, "utf-8");
  const escaped = escapeRegex(symbol);
  const importPatterns = [
    new RegExp(`import\\s+type\\s+\{[^}]*\\b${escaped}\\b[^}]*\}\\s+from`),
    new RegExp(`import\\s+\{[^}]*\\b${escaped}\\b[^}]*\}\\s+from`),
    new RegExp(`import\\s+${escaped}\\s+from`),
    new RegExp(`import\\s+\\*\\s+as\\s+${escaped}\\s+from`),
    new RegExp(`const\\s+\{[^}]*\\b${escaped}\\b[^}]*\}\\s*=\\s*require\\(`),
  ];
  const matched = importPatterns.some((pattern) => pattern.test(content));
  context.importCache.set(cacheKey, matched);
  return matched;
}

function comparePath(first: string, second: string): number {
  return first.localeCompare(second);
}

function compareScannedResults(a: RankedResult, b: RankedResult, symbol: string, context: QueryContext): number {
  const aImportPenalty = a.importedSymbol ? 0 : 1;
  const bImportPenalty = b.importedSymbol ? 0 : 1;
  if (aImportPenalty !== bImportPenalty) {
    return aImportPenalty - bImportPenalty;
  }

  const aChangedPenalty = changedPenalty(a.file, context);
  const bChangedPenalty = changedPenalty(b.file, context);
  if (aChangedPenalty !== bChangedPenalty) {
    return aChangedPenalty - bChangedPenalty;
  }

  const aWorkspacePenalty = workspacePenalty(a.file, context);
  const bWorkspacePenalty = workspacePenalty(b.file, context);
  if (aWorkspacePenalty !== bWorkspacePenalty) {
    return aWorkspacePenalty - bWorkspacePenalty;
  }

  const aPriorityPenalty = priorityRootPenalty(a.file, context.priorityRoots);
  const bPriorityPenalty = priorityRootPenalty(b.file, context.priorityRoots);
  if (aPriorityPenalty !== bPriorityPenalty) {
    return aPriorityPenalty - bPriorityPenalty;
  }

  const aSymbolPenalty = a.text.includes(symbol) ? 0 : 1;
  const bSymbolPenalty = b.text.includes(symbol) ? 0 : 1;
  if (aSymbolPenalty !== bSymbolPenalty) {
    return aSymbolPenalty - bSymbolPenalty;
  }

  const aDirPenalty = cwdDistancePenalty(a.file, context);
  const bDirPenalty = cwdDistancePenalty(b.file, context);
  if (aDirPenalty !== bDirPenalty) {
    return aDirPenalty - bDirPenalty;
  }

  const lengthDelta = a.file.length - b.file.length;
  if (lengthDelta !== 0) {
    return lengthDelta;
  }

  const fileDelta = comparePath(a.file, b.file);
  if (fileDelta !== 0) {
    return fileDelta;
  }

  if (a.line !== b.line) {
    return a.line - b.line;
  }

  return a.column - b.column;
}

function compareDefinitionRows(
  a: { symbol: string; file_path: string; line: number; column: number },
  b: { symbol: string; file_path: string; line: number; column: number },
  symbol: string,
  context: QueryContext,
): number {
  const aExact = a.symbol.toLowerCase() === symbol.toLowerCase() ? 0 : 1;
  const bExact = b.symbol.toLowerCase() === symbol.toLowerCase() ? 0 : 1;
  if (aExact !== bExact) {
    return aExact - bExact;
  }

  const aChangedPenalty = changedPenalty(a.file_path, context);
  const bChangedPenalty = changedPenalty(b.file_path, context);
  if (aChangedPenalty !== bChangedPenalty) {
    return aChangedPenalty - bChangedPenalty;
  }

  const aWorkspacePenalty = workspacePenalty(a.file_path, context);
  const bWorkspacePenalty = workspacePenalty(b.file_path, context);
  if (aWorkspacePenalty !== bWorkspacePenalty) {
    return aWorkspacePenalty - bWorkspacePenalty;
  }

  const aPriorityPenalty = priorityRootPenalty(a.file_path, context.priorityRoots);
  const bPriorityPenalty = priorityRootPenalty(b.file_path, context.priorityRoots);
  if (aPriorityPenalty !== bPriorityPenalty) {
    return aPriorityPenalty - bPriorityPenalty;
  }

  const aDirPenalty = cwdDistancePenalty(a.file_path, context);
  const bDirPenalty = cwdDistancePenalty(b.file_path, context);
  if (aDirPenalty !== bDirPenalty) {
    return aDirPenalty - bDirPenalty;
  }

  const lengthDelta = a.file_path.length - b.file_path.length;
  if (lengthDelta !== 0) {
    return lengthDelta;
  }

  const fileDelta = comparePath(a.file_path, b.file_path);
  if (fileDelta !== 0) {
    return fileDelta;
  }

  if (a.line !== b.line) {
    return a.line - b.line;
  }

  return a.column - b.column;
}

function loadDefinitions(projectPath: string, symbol: string, limit: number, context: QueryContext): QueryResult[] {
  const { dbPath } = resolveMapLayout(projectPath);
  const db = new Database(dbPath, { readonly: true });
  const candidateLimit = Math.max(limit * 8, 100);
  try {
    const rows = db
      .prepare(
        `SELECT symbol, kind, file_path, line, column, text
         FROM definitions
         WHERE symbol = ? COLLATE NOCASE
            OR symbol LIKE ? COLLATE NOCASE
         ORDER BY CASE WHEN lower(symbol) = lower(?) THEN 0 ELSE 1 END, symbol, file_path, line
         LIMIT ?`
      )
      .all(symbol, `${symbol}%`, symbol, candidateLimit) as Array<{
        symbol: string;
        kind: string;
        file_path: string;
        line: number;
        column: number;
        text: string;
      }>;

    return rows
      .filter((row) => matchesScope(row.file_path, context.scopes))
      .sort((a, b) => compareDefinitionRows(a, b, symbol, context))
      .slice(0, limit)
      .map((row) => ({
        file: row.file_path,
        line: row.line,
        column: row.column,
        text: row.text,
        kind: "definition",
      }));
  } finally {
    db.close();
  }
}

function definitionRegexes(projectType: ProjectType, symbol: string): RegExp[] {
  const escaped = escapeRegex(symbol);
  if (projectType === "typescript") {
    return [
      new RegExp(`^\\s*export\\s+(?:default\\s+)?(?:async\\s+)?function\\s+${escaped}\\s*\\(`),
      new RegExp(`^\\s*(?:async\\s+)?function\\s+${escaped}\\s*\\(`),
      new RegExp(`^\\s*export\\s+(?:default\\s+)?class\\s+${escaped}\\b`),
      new RegExp(`^\\s*class\\s+${escaped}\\b`),
      new RegExp(`^\\s*export\\s+interface\\s+${escaped}\\b`),
      new RegExp(`^\\s*interface\\s+${escaped}\\b`),
      new RegExp(`^\\s*(?:public|private|protected)\\s+(?:static\\s+)?(?:async\\s+)?${escaped}\\s*\\(`),
      new RegExp(`^\\s*static\\s+(?:async\\s+)?${escaped}\\s*\\(`),
      new RegExp(`^\\s*export\\s+type\\s+${escaped}\\s*=`),
      new RegExp(`^\\s*type\\s+${escaped}\\s*=`),
      new RegExp(`^\\s*export\\s+enum\\s+${escaped}\\b`),
      new RegExp(`^\\s*enum\\s+${escaped}\\b`),
      new RegExp(`^\\s*export\\s+(?:const|let|var)\\s+${escaped}\\s*=`),
      new RegExp(`^\\s*(?:const|let|var)\\s+${escaped}\\s*=`),
    ];
  }

  return [
    new RegExp(`^\\s*func\\s+(?:\\([^)]+\\)\\s*)?${escaped}\\s*\\(`),
    new RegExp(`^\\s*type\\s+${escaped}\\b`),
    new RegExp(`^\\s*var\\s+${escaped}\\b`),
    new RegExp(`^\\s*const\\s+${escaped}\\b`),
  ];
}

function candidateFilesForScan(files: string[], context: QueryContext): string[] {
  const scopedFiles = files.filter((filePath) => matchesScope(filePath, context.scopes));
  if (!context.changed || context.changedFiles.size === 0) {
    return scopedFiles;
  }

  const neighborhood = scopedFiles.filter((filePath) => changedPenalty(filePath, context) <= 2);
  return neighborhood.length > 0 ? neighborhood : scopedFiles;
}

function scanFiles(
  projectPath: string,
  projectType: ProjectType,
  matcher: (line: string) => boolean,
  kind: QueryResult["kind"],
  options: QueryOptions,
  symbol: string,
  context: QueryContext,
  filter: FileFilter = defaultFileFilter,
): QueryResult[] {
  const files = collectSourceFiles(projectPath, projectType, filter).map((filePath) => toProjectRelative(projectPath, filePath));
  const candidateFiles = candidateFilesForScan(files, context);
  const results: RankedResult[] = [];
  const defs = definitionRegexes(projectType, symbol);
  const limit = maxResults(options);

  for (const file of candidateFiles) {
    const absolutePath = resolve(projectPath, file);
    const content = readFileSync(absolutePath, "utf-8");
    const lines = content.split(/\r?\n/);
    const importedSymbol = importsSymbol(file, symbol, context);

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!matcher(line)) {
        continue;
      }

      if (kind !== "definition" && defs.some((regex) => regex.test(line))) {
        continue;
      }

      const column = Math.max(line.search(/\S|$/), 0) + 1;
      results.push({
        file,
        line: index + 1,
        column,
        text: line.trim(),
        kind,
        importedSymbol,
      });
    }
  }

  return results
    .sort((a, b) => compareScannedResults(a, b, symbol, context))
    .slice(0, limit)
    .map(({ importedSymbol: _importedSymbol, ...result }) => result);
}

export function findDefinition(symbol: string, options: QueryOptions = {}): QueryResult[] {
  const projectPath = resolveProjectPath(options);
  const projectType = detectTypeOrThrow(projectPath);
  const context = createQueryContext(projectPath, projectType, options);
  const limit = maxResults(options);
  return loadDefinitions(projectPath, symbol, limit, context);
}

export function findReferences(symbol: string, options: QueryOptions = {}): QueryResult[] {
  const projectPath = resolveProjectPath(options);
  const projectType = detectTypeOrThrow(projectPath);
  const context = createQueryContext(projectPath, projectType, options);
  const regex = new RegExp(`\\b${escapeRegex(symbol)}\\b`);
  return scanFiles(projectPath, projectType, (line) => regex.test(line), "reference", options, symbol, context);
}

export function findCallers(symbol: string, options: QueryOptions = {}): QueryResult[] {
  const projectPath = resolveProjectPath(options);
  const projectType = detectTypeOrThrow(projectPath);
  const context = createQueryContext(projectPath, projectType, options);
  const regex = new RegExp(`(?:\\b|\\.|->|::)${escapeRegex(symbol)}\\s*\\(`);
  return scanFiles(projectPath, projectType, (line) => regex.test(line), "call", options, symbol, context);
}

export function formatResult(result: QueryResult): string {
  const kindTag = result.kind === "definition" ? "[DEF]" : result.kind === "call" ? "[CALL]" : "[REF]";
  return `${kindTag} ${result.file}:${result.line}:${result.column}  ${result.text}`;
}

export function mapPaths(projectPath: string): { scipPath: string; dbPath: string } {
  const layout = resolveMapLayout(projectPath);
  return { scipPath: join(layout.dir, "index.scip"), dbPath: join(layout.dir, "map.db") };
}
