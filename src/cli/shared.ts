import { resolve } from "path";
import { buildIndex } from "../indexer/builder.js";
import type { QueryOptions } from "../query/engine.js";
import { findProjectRoot, getMapStatus } from "../project.js";

export interface QueryCliOptions {
  cwd?: string;
  json: boolean;
  scope?: string[];
  changed?: boolean;
  fromRef?: string;
  toRef?: string;
}

export function parseQueryCliOptions(args: string[], startIndex = 1): QueryCliOptions {
  let cwd: string | undefined;
  let json = false;
  const scope: string[] = [];
  let changed = false;
  let fromRef: string | undefined;
  let toRef: string | undefined;

  for (let i = startIndex; i < args.length; i++) {
    if (args[i] === "--cwd" && args[i + 1]) {
      cwd = resolve(args[i + 1]);
      i++;
    } else if (args[i] === "--json") {
      json = true;
    } else if (args[i] === "--scope" && args[i + 1]) {
      scope.push(args[i + 1]);
      i++;
    } else if (args[i] === "--changed") {
      changed = true;
    } else if (args[i] === "--from" && args[i + 1]) {
      fromRef = args[i + 1];
      i++;
    } else if (args[i] === "--to" && args[i + 1]) {
      toRef = args[i + 1];
      i++;
    }
  }

  return {
    cwd,
    json,
    scope: scope.length > 0 ? scope : undefined,
    changed,
    fromRef,
    toRef,
  };
}

export function toQueryOptions(options: QueryCliOptions, projectPath: string): QueryOptions {
  return {
    cwd: options.cwd ?? projectPath,
    projectPath,
    scope: options.scope,
    changed: options.changed,
    fromRef: options.fromRef,
    toRef: options.toRef,
  };
}

export function resolveQueryProject(cwd?: string): string {
  const start = cwd ? resolve(cwd) : process.cwd();
  return findProjectRoot(start) ?? start;
}

export async function ensureMapIndex(projectPath: string): Promise<void> {
  const status = getMapStatus(projectPath);
  if (status.indexed && !status.stale) {
    return;
  }

  const result = await buildIndex(projectPath);
  if (!result.success) {
    throw new Error(result.error ?? `Failed to build map index for ${projectPath}`);
  }
}
