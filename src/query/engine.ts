import { execSync } from "child_process";
import Database from "better-sqlite3";
import { join } from "path";
import { existsSync } from "fs";

export interface QueryResult {
  file: string;
  line: number;
  column: number;
  text: string;
  kind: "definition" | "reference" | "call";
}

export interface QueryOptions {
  cwd?: string;
  dbPath?: string;
}

function findDbPath(cwd: string): string | null {
  const name = cwd.split("/").pop() || "project";
  const candidates = [
    join(cwd, `${name}.fg-index.db`),
    join(cwd, ".ai", "mindkeeper", "index.db"),
    join(cwd, "index.db"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function rgAvailable(): boolean {
  try {
    execSync("rg --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findDefinition(symbol: string, options: QueryOptions = {}): QueryResult[] {
  const cwd = options.cwd || process.cwd();
  const dbPath = options.dbPath || findDbPath(cwd);

  if (dbPath) {
    try {
      const db = new Database(dbPath);
      const stmt = db.prepare(
        `SELECT s.name, s.definition, s.kind
         FROM symbols s
         WHERE s.name LIKE ? AND s.definition IS NOT NULL`
      );
      const rows = stmt.all(`%${symbol}%`) as Array<{ name: string; definition: string; kind: string }>;
      db.close();

      const results: QueryResult[] = [];
      for (const r of rows) {
        const parts = r.definition?.split(":");
        if (!parts || parts.length < 2) continue;
        results.push({
          file: parts[0],
          line: parseInt(parts[1], 10) || 0,
          column: 0,
          text: `${r.kind}: ${r.name}`,
          kind: "definition",
        });
      }
      return results;
    } catch {
      // Fall through to grep
    }
  }

  // Fallback: grep-based search
  const pattern = `\\b${escapeRegex(symbol)}\\b`;
  const cmd = rgAvailable()
    ? `rg -n --type ts "^(export\\s+)?(async\\s+)?(function|const|let|class|interface)\\s+${escapeRegex(symbol)}"`
    : `grep -rn "^(export\\s\+\)\?\(async\\s\+\)\?\(function\\|const\\|let\\|class\\|interface\)\\s\+${escapeRegex(symbol)}" --include="*.ts"`;

  try {
    const output = execSync(cmd, { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    return parseGrepOutput(output).map((r) => ({ ...r, kind: "definition" as const }));
  } catch {
    return [];
  }
}

export function findReferences(symbol: string, options: QueryOptions = {}): QueryResult[] {
  const cwd = options.cwd || process.cwd();
  const pattern = `\\b${escapeRegex(symbol)}\\b`;

  const cmd = rgAvailable()
    ? `rg -n --type ts ${JSON.stringify(pattern)}`
    : `grep -rn ${JSON.stringify(pattern)} --include="*.ts"`;

  try {
    const output = execSync(cmd, { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    return parseGrepOutput(output).map((r) => ({ ...r, kind: "reference" as const }));
  } catch {
    return [];
  }
}

export function findCallers(symbol: string, options: QueryOptions = {}): QueryResult[] {
  const cwd = options.cwd || process.cwd();
  const pattern = `${escapeRegex(symbol)}\\s*\\(`;

  const cmd = rgAvailable()
    ? `rg -n --type ts ${JSON.stringify(pattern)}`
    : `grep -rn ${JSON.stringify(pattern)} --include="*.ts"`;

  try {
    const output = execSync(cmd, { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    return parseGrepOutput(output).map((r) => ({ ...r, kind: "call" as const }));
  } catch {
    return [];
  }
}

function parseGrepOutput(output: string): Array<{ file: string; line: number; column: number; text: string }> {
  if (!output.trim()) return [];
  const results: Array<{ file: string; line: number; column: number; text: string }> = [];
  for (const line of output.trim().split("\n")) {
    const match = line.match(/^([^:]+):(\d+):(.*)$/);
    if (!match) continue;
    results.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: 0,
      text: match[3].trim(),
    });
  }
  return results;
}
