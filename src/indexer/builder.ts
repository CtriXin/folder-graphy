import { existsSync, readFileSync } from "fs";
import { join, basename } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

export type ProjectType = "typescript" | "go";

export interface IndexResult {
  success: boolean;
  dbPath?: string;
  documentCount?: number;
  symbolCount?: number;
  error?: string;
}

export function detectProjectType(projectPath: string): ProjectType | null {
  if (existsSync(join(projectPath, "tsconfig.json"))) {
    return "typescript";
  }
  if (existsSync(join(projectPath, "go.mod"))) {
    return "go";
  }
  return null;
}

function indexerCommand(
  projectType: ProjectType
): { cmd: string; args: string[] } | null {
  switch (projectType) {
    case "typescript":
      return { cmd: "scip-typescript", args: ["index", "--output", "index.json"] };
    case "go":
      return { cmd: "scip-go", args: ["index", "--output", "index.json"] };
    default:
      return null;
  }
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      path  TEXT    NOT NULL,
      hash  TEXT
    );
    CREATE TABLE IF NOT EXISTS symbols (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      kind          TEXT    NOT NULL,
      definition    TEXT,
      document_id   INTEGER REFERENCES documents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
    CREATE INDEX IF NOT EXISTS idx_symbols_document ON symbols(document_id);
  `);
}

interface ScipSymbol {
  name: string;
  kind: string;
  definition?: string;
  documentPath?: string;
}

function parseScipOutput(scipPath: string): ScipSymbol[] {
  if (!existsSync(scipPath)) return [];

  const raw = readFileSync(scipPath, "utf-8");
  try {
    const doc = JSON.parse(raw);
    return extractSymbols(doc);
  } catch {
    console.error("Warning: could not parse SCIP output");
    return [];
  }
}

function extractSymbols(doc: Record<string, unknown>): ScipSymbol[] {
  const symbols: ScipSymbol[] = [];
  const externalSymbols: Record<string, unknown> =
    (doc.external_symbols as Record<string, unknown>) ?? {};
  const internalSymbols: Record<string, unknown> =
    (doc.internal_symbols as Record<string, unknown>) ?? {};
  const documents: Record<string, unknown> =
    (doc.documents as Record<string, unknown>) ?? {};

  const allSymbols = { ...externalSymbols, ...internalSymbols };
  const pathByDocId: Record<string, string> = {};

  for (const [docId, docData] of Object.entries(documents)) {
    const relativePath = (docData as Record<string, unknown>).relative_path as
      | string
      | undefined;
    if (relativePath) pathByDocId[docId] = relativePath;
  }

  for (const [symbolKey, symData] of Object.entries(allSymbols)) {
    const sym = symData as Record<string, unknown>;
    const relationships = sym.relationships as Record<string, unknown> | undefined;
    const defRef = relationships?.definition_reference as
      | Record<string, unknown>
      | undefined;
    const docRef = defRef?.document as string | undefined;

    symbols.push({
      name: symbolKey,
      kind: (sym.kind as string) ?? "unknown",
      definition: defRef
        ? `${pathByDocId[docRef ?? ""] ?? docRef}:${defRef.start_line ?? 0}`
        : undefined,
      documentPath: docRef ? pathByDocId[docRef] : undefined,
    });
  }

  return symbols;
}

export async function buildIndex(
  projectPath: string,
  projectType: ProjectType
): Promise<IndexResult> {
  const spec = indexerCommand(projectType);
  if (!spec) {
    return { success: false, error: `unsupported project type: ${projectType}` };
  }

  try {
    await execFileAsync(spec.cmd, spec.args, { cwd: projectPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `indexer failed: ${msg}` };
  }

  const scipPath = join(projectPath, "index.json");
  if (!existsSync(scipPath)) {
    return {
      success: false,
      error: `indexer produced no output at ${scipPath}`,
    };
  }

  const symbols = parseScipOutput(scipPath);
  const dbPath = join(projectPath, `${basename(projectPath)}.fg-index.db`);

  const db = new Database(dbPath);
  try {
    createSchema(db);

    const insertDoc = db.prepare(
      "INSERT INTO documents (path) VALUES (?) ON CONFLICT DO NOTHING"
    );
    const getDocId = db.prepare(
      "SELECT id FROM documents WHERE path = ?"
    );
    const insertSym = db.prepare(
      "INSERT INTO symbols (name, kind, definition, document_id) VALUES (?, ?, ?, ?)"
    );

    const tx = db.transaction(() => {
      const docPaths = new Set<string>();
      let symCount = 0;

      for (const sym of symbols) {
        if (sym.documentPath) docPaths.add(sym.documentPath);
      }

      for (const p of docPaths) {
        insertDoc.run(p);
      }

      for (const sym of symbols) {
        const docId = sym.documentPath
          ? (getDocId.get(sym.documentPath) as { id: number } | undefined)
              ?.id ?? null
          : null;
        insertSym.run(sym.name, sym.kind, sym.definition ?? null, docId);
        symCount++;
      }

      return { documentCount: docPaths.size, symbolCount: symCount };
    });

    const counts = tx();
    db.close();

    return {
      success: true,
      dbPath,
      documentCount: counts.documentCount,
      symbolCount: counts.symbolCount,
    };
  } catch (err) {
    db.close();
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `sqlite write failed: ${msg}` };
  }
}
