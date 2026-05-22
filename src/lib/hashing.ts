import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function computeContentHash(absolutePath: string): Promise<string> {
  const contents = await readFile(absolutePath);
  return createHash("sha256").update(contents).digest("hex");
}
