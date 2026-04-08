import { existsSync } from "fs";
import { resolve } from "path";
import { buildIndex } from "../indexer/builder.js";
import { findProjectRoot, resolveMapLayout } from "../project.js";

export interface QueryCliOptions {
  cwd?: string;
  json: boolean;
}

export function parseQueryCliOptions(args: string[], startIndex = 1): QueryCliOptions {
  let cwd: string | undefined;
  let json = false;

  for (let i = startIndex; i < args.length; i++) {
    if (args[i] === "--cwd" && args[i + 1]) {
      cwd = resolve(args[i + 1]);
      i++;
    } else if (args[i] === "--json") {
      json = true;
    }
  }

  return { cwd, json };
}

export function resolveQueryProject(cwd?: string): string {
  const start = cwd ? resolve(cwd) : process.cwd();
  return findProjectRoot(start) ?? start;
}

export async function ensureMapIndex(projectPath: string): Promise<void> {
  const { dbPath } = resolveMapLayout(projectPath);
  if (existsSync(dbPath)) {
    return;
  }

  const result = await buildIndex(projectPath);
  if (!result.success) {
    throw new Error(result.error ?? `Failed to build map index for ${projectPath}`);
  }
}
