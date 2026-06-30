import path from "node:path";

export const INDEX_DIRECTORY_NAME = ".petrichor";
export const INDEX_RELATIVE_PATH = `${INDEX_DIRECTORY_NAME}/index.db`;
export const SESSION_STORE_RELATIVE_PATH = `${INDEX_DIRECTORY_NAME}/session.db`;

export function getRepositoryRoot(): string {
  return process.cwd();
}

export function getIndexPath(repositoryRoot: string): string {
  return path.join(repositoryRoot, INDEX_RELATIVE_PATH);
}

export function getSessionStorePath(repositoryRoot: string): string {
  return path.join(repositoryRoot, SESSION_STORE_RELATIVE_PATH);
}

export function toRepoRelativePath(repositoryRoot: string, candidatePath: string): string {
  const relativePath = path.relative(repositoryRoot, candidatePath);
  return relativePath.split(path.sep).join("/");
}
