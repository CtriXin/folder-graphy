import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

export interface GitDiffOptions {
  cwd?: string;
  fromRef?: string;
  toRef?: string;
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string;
}

export interface DiffResult {
  files: FileChange[];
  fromRef: string;
  toRef: string;
}

function isGitRepo(cwd: string): boolean {
  const gitDir = resolve(cwd, ".git");
  if (existsSync(gitDir)) return true;

  try {
    execFileSync("git", ["rev-parse", "--git-dir"], { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function sanitizeRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error("Git ref cannot be empty");
  }
  if (trimmed.startsWith("-")) {
    throw new Error(`Unsafe git ref: ${ref}`);
  }
  return trimmed;
}

function getLastIndexedRef(cwd: string): string | null {
  try {
    const result = execFileSync("git", ["rev-parse", "--verify", "refs/notes/folder-graphy-index"], {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function getHeadRef(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();
  } catch {
    throw new Error("Failed to get HEAD ref");
  }
}

function parseDiffNameStatus(output: string): FileChange[] {
  const files: FileChange[] = [];
  const lines = output.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;

    const status = parts[0][0];
    const path = parts[parts.length - 1];

    switch (status) {
      case "A":
        files.push({ path, status: "added" });
        break;
      case "M":
        files.push({ path, status: "modified" });
        break;
      case "D":
        files.push({ path, status: "deleted" });
        break;
      case "R":
        files.push({
          path,
          status: "renamed",
          oldPath: parts[1],
        });
        break;
    }
  }

  return files;
}

export function getChangedFiles(options: GitDiffOptions = {}): DiffResult {
  const cwd = options.cwd || process.cwd();

  if (!isGitRepo(cwd)) {
    throw new Error(`Not a git repository: ${cwd}`);
  }

  const fromRef = sanitizeRef(options.fromRef || getLastIndexedRef(cwd) || "HEAD~1");
  const toRef = sanitizeRef(options.toRef || getHeadRef(cwd));

  try {
    const output = execFileSync("git", ["diff", "--name-status", `${fromRef}..${toRef}`], {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    });

    return {
      files: parseDiffNameStatus(output),
      fromRef,
      toRef,
    };
  } catch (error) {
    throw new Error(`Failed to get git diff: ${error}`);
  }
}

export function getUntrackedFiles(cwd: string = process.cwd()): string[] {
  if (!isGitRepo(cwd)) {
    return [];
  }

  try {
    const output = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    });

    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function saveIndexRef(ref: string, cwd: string = process.cwd()): void {
  if (!isGitRepo(cwd)) {
    throw new Error(`Not a git repository: ${cwd}`);
  }

  const safeRef = sanitizeRef(ref);
  try {
    execFileSync("git", ["notes", "--ref", "folder-graphy-index", "add", "-f", "-m", safeRef, "HEAD"], {
      cwd,
      stdio: "pipe",
    });
  } catch (error) {
    throw new Error(`Failed to save index ref: ${error}`);
  }
}
