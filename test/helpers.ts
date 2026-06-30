import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TSX_CLI_PATH = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const PETRICHOR_CLI_PATH = path.join(PROJECT_ROOT, "src", "cli.ts");

export interface CommandResult<TJson = unknown> {
  exitCode: number;
  json: TJson;
  stderr: string;
  stdout: string;
}

export async function withFixtureRepository<T>(
  fixtureName: string,
  callback: (repositoryPath: string) => Promise<T>,
): Promise<T> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "petrichor-"));
  const fixturePath = path.join(PROJECT_ROOT, "test", "fixtures", fixtureName);
  const repositoryPath = path.join(temporaryRoot, fixtureName);

  await cp(fixturePath, repositoryPath, { recursive: true });

  try {
    return await callback(repositoryPath);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function withFixtureRepositories<T>(
  fixtureName: string,
  count: number,
  callback: (repositoryPaths: string[]) => Promise<T>,
): Promise<T> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "petrichor-"));
  const fixturePath = path.join(PROJECT_ROOT, "test", "fixtures", fixtureName);
  const repositoryPaths = Array.from({ length: count }, (_, index) =>
    path.join(temporaryRoot, `${fixtureName}-${index + 1}`));

  await Promise.all(repositoryPaths.map((repositoryPath) => cp(fixturePath, repositoryPath, { recursive: true })));

  try {
    return await callback(repositoryPaths);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function runCli<TJson = unknown>(cwd: string, ...args: string[]): Promise<CommandResult<TJson>> {
  return runCliProcess<TJson>(cwd, null, args, path.join(path.dirname(cwd), ".home"));
}

export async function runCliWithHome<TJson = unknown>(
  cwd: string,
  home: string,
  ...args: string[]
): Promise<CommandResult<TJson>> {
  return runCliProcess<TJson>(cwd, null, args, home);
}

export async function runCliWithInput<TJson = unknown>(
  cwd: string,
  input: string,
  ...args: string[]
): Promise<CommandResult<TJson>> {
  return runCliProcess<TJson>(cwd, input, args, path.join(path.dirname(cwd), ".home"));
}

async function runCliProcess<TJson>(
  cwd: string,
  input: string | null,
  args: string[],
  home: string,
): Promise<CommandResult<TJson>> {
  return await new Promise<CommandResult<TJson>>((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI_PATH, PETRICHOR_CLI_PATH, ...args], {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
      },
      stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
    });

    if (input !== null) {
      child.stdin.end(input);
    }

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const trimmedStdout = stdout.trim();

      try {
        resolve({
          exitCode: code ?? 1,
          json: JSON.parse(trimmedStdout) as TJson,
          stderr,
          stdout,
        });
      } catch (error) {
        reject(
          new Error(
            `Failed to parse CLI JSON output.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\nError: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}
