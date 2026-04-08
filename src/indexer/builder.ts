import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import Database from "better-sqlite3";
import { initSchema } from "../db/schema.js";
import {
  ProjectType,
  collectSourceFiles,
  defaultFileFilter,
  detectProjectType,
  ensureMapLayout,
  toProjectRelative,
  type FileFilter,
  type ProjectManifest,
} from "../project.js";

const execFileAsync = promisify(execFile);

interface DefinitionRecord {
  symbol: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  text: string;
  language: string;
}

export interface IndexResult {
  success: boolean;
  projectType?: ProjectType;
  projectPath?: string;
  scipPath?: string;
  dbPath?: string;
  definitionCount?: number;
  sourceFileCount?: number;
  files?: Array<{ path: string; mtimeMs: number; size: number }>;
  error?: string;
}

interface DefinitionPattern {
  kind: string;
  regex: RegExp;
}

const TYPESCRIPT_PATTERNS: DefinitionPattern[] = [
  { kind: "function", regex: /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/ },
  { kind: "function", regex: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/ },
  { kind: "class", regex: /^\s*export\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "class", regex: /^\s*class\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "interface", regex: /^\s*export\s+interface\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "interface", regex: /^\s*interface\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "method", regex: /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/ },
  { kind: "method", regex: /^\s*static\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/ },
  { kind: "type", regex: /^\s*export\s+type\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: "type", regex: /^\s*type\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: "enum", regex: /^\s*export\s+enum\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "enum", regex: /^\s*enum\s+([A-Za-z_$][\w$]*)\b/ },
  { kind: "const", regex: /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: "const", regex: /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/ },
];

const GO_PATTERNS: DefinitionPattern[] = [
  { kind: "function", regex: /^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/ },
  { kind: "type", regex: /^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\b/ },
  { kind: "var", regex: /^\s*var\s+([A-Za-z_][A-Za-z0-9_]*)\b/ },
  { kind: "const", regex: /^\s*const\s+([A-Za-z_][A-Za-z0-9_]*)\b/ },
];

function indexerCommand(projectType: ProjectType, scipPath: string): { cmd: string; args: string[] } {
  if (projectType === "typescript") {
    return { cmd: "scip-typescript", args: ["index", "--output", scipPath] };
  }
  return { cmd: "scip-go", args: ["index", "--output", scipPath] };
}

interface FileMeta {
  path: string;
  mtimeMs: number;
  size: number;
}

function extractDefinitions(
  projectPath: string,
  projectType: ProjectType,
  filter: FileFilter = defaultFileFilter,
): { definitions: DefinitionRecord[]; files: FileMeta[] } {
  const files = collectSourceFiles(projectPath, projectType, filter);
  const patterns = projectType === "typescript" ? TYPESCRIPT_PATTERNS : GO_PATTERNS;
  const language = projectType === "typescript" ? "typescript" : "go";
  const definitions: DefinitionRecord[] = [];
  const fileMetas: FileMeta[] = [];

  for (const filePath of files) {
    const relativePath = toProjectRelative(projectPath, filePath);
    const content = readFileSync(filePath, "utf-8");
    const stat = statSync(filePath);
    fileMetas.push({
      path: relativePath,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
    const lines = content.split(/\r?\n/);

    lines.forEach((lineText, index) => {
      for (const pattern of patterns) {
        const match = pattern.regex.exec(lineText);
        if (!match) {
          continue;
        }
        const symbol = match[1];
        const column = Math.max(lineText.indexOf(symbol), 0) + 1;
        definitions.push({
          symbol,
          kind: pattern.kind,
          filePath: relativePath,
          line: index + 1,
          column,
          text: lineText.trim(),
          language,
        });
        break;
      }
    });
  }

  return { definitions, files: fileMetas };
}

function writeSQLite(dbPath: string, definitions: DefinitionRecord[], projectPath: string, projectType: ProjectType, scipPath: string): void {
  if (existsSync(dbPath)) {
    rmSync(dbPath, { force: true });
  }

  const db = new Database(dbPath);
  try {
    initSchema(db);

    const insertMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
    const insertDefinition = db.prepare(
      `INSERT INTO definitions (symbol, kind, file_path, line, column, text, language)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      insertMeta.run("project_path", projectPath);
      insertMeta.run("project_type", projectType);
      insertMeta.run("scip_path", scipPath);
      insertMeta.run("indexed_at", new Date().toISOString());

      for (const definition of definitions) {
        insertDefinition.run(
          definition.symbol,
          definition.kind,
          definition.filePath,
          definition.line,
          definition.column,
          definition.text,
          definition.language
        );
      }
    });

    tx();
  } finally {
    db.close();
  }
}

export async function buildIndex(projectPath: string, projectType?: ProjectType): Promise<IndexResult> {
  const detectedType = projectType ?? detectProjectType(projectPath);
  if (!detectedType) {
    return { success: false, error: `unsupported project type: ${projectPath}` };
  }

  const layout = ensureMapLayout(projectPath);
  const spec = indexerCommand(detectedType, layout.scipPath);

  try {
    await execFileAsync(spec.cmd, spec.args, { cwd: projectPath, timeout: 300_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `indexer failed: ${msg}` };
  }

  if (!existsSync(layout.scipPath)) {
    return { success: false, error: `indexer produced no output at ${layout.scipPath}` };
  }

  const { definitions, files } = extractDefinitions(projectPath, detectedType);
  writeSQLite(layout.dbPath, definitions, projectPath, detectedType, layout.scipPath);

  const manifest: ProjectManifest = {
    projectPath,
    projectType: detectedType,
    indexedAt: new Date().toISOString(),
    scipPath: layout.scipPath,
    dbPath: layout.dbPath,
    definitionCount: definitions.length,
    sourceFileCount: files.length,
    files,
  };
  writeFileSync(layout.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  return {
    success: true,
    projectType: detectedType,
    projectPath,
    scipPath: layout.scipPath,
    dbPath: layout.dbPath,
    definitionCount: definitions.length,
    sourceFileCount: files.length,
    files,
  };
}
