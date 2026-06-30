import assert from "node:assert/strict";
import test from "node:test";

import { filterCapsuleText, MAX_CAPSULE_TEXT_BYTES } from "../src/lib/capsule-filter";

test("filterCapsuleText returns mandatory no-op metadata", () => {
  const source = "export const greeting = 'hello';\n";
  assert.deepEqual(filterCapsuleText(source, "src/example.ts"), {
    text: source,
    filtering: {
      redactionCount: 0,
      redactionCategories: [],
      truncated: false,
      originalByteCount: Buffer.byteLength(source),
      outputByteCount: Buffer.byteLength(source),
      omittedByteCount: 0,
    },
  });
});

test("filterCapsuleText redacts supported structural contexts but leaves broad names and comments alone", () => {
  const source = [
    'const db_password = "one";',
    'const options = { clientSecret: `two` };',
    'class Config { private readonly serviceApiKey = "six"; }',
    'service.access_token = "three";',
    'function connect(refreshToken = "four") {}',
    'const view = <Widget api-key="five" />;',
    'const key = "ordinary";',
    '// password: visible prose',
  ].join("\n");
  const result = filterCapsuleText(source, "src/example.tsx");

  assert.equal(result.filtering.redactionCount, 6);
  assert.deepEqual(result.filtering.redactionCategories, ["credential"]);
  assert.equal(result.text.match(/\[REDACTED:credential\]/g)?.length, 6);
  for (const secret of ["one", "two", "three", "four", "five", "six"]) assert.ok(!result.text.includes(secret));
  assert.ok(result.text.includes('const key = "ordinary"'));
  assert.ok(result.text.includes("// password: visible prose"));
});

test("filterCapsuleText enforces provider minimum lengths", () => {
  const source = "ghp_short npm_short sk-short xoxb-short";
  const result = filterCapsuleText(source, "src/example.ts");
  assert.equal(result.text, source);
  assert.equal(result.filtering.redactionCount, 0);
});

test("filterCapsuleText redacts high-confidence formats and private keys anywhere", () => {
  const source = [
    "ghp_" + "abcdefghijklmnopqrstuvwxyz1234567890AB",
    "sk-" + "abcdefghijklmnopqrstuvwxyz1234567890",
    "npm_" + "abcdefghijklmnopqrstuvwxyz1234567890AB",
    "xoxb-" + "1234567890-abcdefghijklmnop",
    "Authorization: Bearer abcdefghijklmnopqrstuvwx",
    "https://user:password@example.com/path",
    "-----BEGIN PRIVATE KEY-----\nvery-sensitive-material\n-----END PRIVATE KEY-----",
  ].join("\n");
  const result = filterCapsuleText(source, "src/example.ts");

  assert.equal(result.filtering.redactionCount, 7);
  assert.deepEqual(result.filtering.redactionCategories, ["credential", "private_key"]);
  assert.ok(!result.text.includes("very-sensitive-material"));
  assert.ok(result.text.includes("[REDACTED:private-key]"));
});

test("filterCapsuleText enforces exact UTF-8 limit with head, tail, and exact omission metadata", () => {
  const source = `HEAD-${"é".repeat(5000)}-TAIL`;
  const result = filterCapsuleText(source, "src/example.ts");

  assert.equal(Buffer.byteLength(result.text), MAX_CAPSULE_TEXT_BYTES);
  assert.equal(result.filtering.outputByteCount, MAX_CAPSULE_TEXT_BYTES);
  assert.equal(result.filtering.omittedByteCount, Buffer.byteLength(source) - MAX_CAPSULE_TEXT_BYTES + Buffer.byteLength(result.text.match(/\n\/\* \[PETRICHOR:TRUNCATED bytes=\d+\] \*\/\n/)![0]));
  assert.ok(result.text.startsWith("HEAD-"));
  assert.ok(result.text.endsWith("-TAIL"));
  assert.ok(result.text.includes(`[PETRICHOR:TRUNCATED bytes=${result.filtering.omittedByteCount}]`));
  assert.equal(result.text.includes("�"), false);
});

test("filterCapsuleText redacts before truncating", () => {
  const secret = "ghp_" + "abcdefghijklmnopqrstuvwxyz1234567890AB";
  const source = `${secret}\n${"x".repeat(9000)}\n${secret}`;
  const result = filterCapsuleText(source, "src/example.ts");
  assert.equal(result.filtering.redactionCount, 2);
  assert.ok(!result.text.includes(secret));
  assert.equal(result.filtering.truncated, true);
});
