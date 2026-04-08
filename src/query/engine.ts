import { readFileSync } from "fs";
import { join, resolve } from "path";
import Database from "better-sqlite3";
import {
  ProjectType,
  collectSourceFiles,
  defaultFileFilter,
  detectProjectType,
  findProjectRoot,
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

function loadDefinitions(projectPath: string, symbol: string, limit: number): QueryResult[] {
  const { dbPath } = resolveMapLayout(projectPath);
  const db = new Database(dbPath, { readonly: true });
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
      .all(symbol, `${symbol}%`, symbol, limit) as Array<{
        symbol: string;
        kind: string;
        file_path: string;
        line: number;
        column: number;
        text: string;
      }>;

    return rows.map((row) => ({
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

function scanFiles(
  projectPath: string,
  projectType: ProjectType,
  matcher: (line: string) => boolean,
  kind: QueryResult["kind"],
  options: QueryOptions,
  symbol: string,
  filter: FileFilter = defaultFileFilter,
): QueryResult[] {
  const files = collectSourceFiles(projectPath, projectType, filter);
  const results: QueryResult[] = [];
  const defs = definitionRegexes(projectType, symbol);
  const limit = maxResults(options);

  for (const filePath of files) {
    if (results.length >= limit) {
      break;
    }

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      if (results.length >= limit) {
        break;
      }

      const line = lines[index];
      if (!matcher(line)) {
        continue;
      }

      if (kind !== "definition" && defs.some((regex) => regex.test(line))) {
        continue;
      }

      const column = Math.max(line.search(/\S|$/), 0) + 1;
      results.push({
        file: toProjectRelative(projectPath, filePath),
        line: index + 1,
        column,
        text: line.trim(),
        kind,
      });
    }
  }

  return results;
}

export function findDefinition(symbol: string, options: QueryOptions = {}): QueryResult[] {
  const projectPath = resolveProjectPath(options);
  const limit = maxResults(options);
  return loadDefinitions(projectPath, symbol, limit);
}

export function findReferences(symbol: string, options: QueryOptions = {}): QueryResult[] {
  const projectPath = resolveProjectPath(options);
  const projectType = detectTypeOrThrow(projectPath);
  const regex = new RegExp(`\\b${escapeRegex(symbol)}\\b`);
  return scanFiles(projectPath, projectType, (line) => regex.test(line), "reference", options, symbol);
}

export function findCallers(symbol: string, options: QueryOptions = {}): QueryResult[] {
  const projectPath = resolveProjectPath(options);
  const projectType = detectTypeOrThrow(projectPath);
  const regex = new RegExp(`(?:\\b|\\.|->|::)${escapeRegex(symbol)}\\s*\\(`);
  return scanFiles(projectPath, projectType, (line) => regex.test(line), "call", options, symbol);
}

export function formatResult(result: QueryResult): string {
  const kindTag = result.kind === "definition" ? "[DEF]" : result.kind === "call" ? "[CALL]" : "[REF]";
  return `${kindTag} ${result.file}:${result.line}:${result.column}  ${result.text}`;
}

export function mapPaths(projectPath: string): { scipPath: string; dbPath: string } {
  const layout = resolveMapLayout(projectPath);
  return { scipPath: join(layout.dir, "index.scip"), dbPath: join(layout.dir, "map.db") };
}
