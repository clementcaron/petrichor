import ts from "typescript";

import { CapsuleFiltering, RedactionCategory } from "../contracts";

export const MAX_CAPSULE_TEXT_BYTES = 8 * 1024;

interface RedactionRange {
  start: number;
  end: number;
  category: RedactionCategory;
}

export interface FilteredCapsuleText {
  text: string;
  filtering: CapsuleFiltering;
}

const SENSITIVE_NAMES = new Set([
  "password", "passwd", "secret", "token", "apikey", "accesstoken", "refreshtoken",
  "clientsecret", "privatekey",
]);

const FORMAT_PATTERNS: Array<{ pattern: RegExp; category: RedactionCategory }> = [
  { pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g, category: "private_key" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, category: "credential" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, category: "credential" },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g, category: "credential" },
  { pattern: /\bnpm_[A-Za-z0-9]{36,}\b/g, category: "credential" },
  { pattern: /\bxox[a-z]-[A-Za-z0-9-]{20,}\b/g, category: "credential" },
  { pattern: /(?<=\b(?:Bearer|Basic)\s)[A-Za-z0-9+/_=-]{20,}/gi, category: "credential" },
  { pattern: /(?<=\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]{4,}(?=@)/gi, category: "credential" },
];

export function filterCapsuleText(source: string, repositoryPath: string): FilteredCapsuleText {
  const originalByteCount = Buffer.byteLength(source);
  const ranges = collectRedactionRanges(source, repositoryPath);
  const redacted = applyRedactions(source, ranges);
  const truncated = truncateUtf8(redacted);
  const categories = [...new Set(ranges.map((range) => range.category))].sort();

  return {
    text: truncated.text,
    filtering: {
      redactionCount: ranges.length,
      redactionCategories: categories,
      truncated: truncated.omittedByteCount > 0,
      originalByteCount,
      outputByteCount: Buffer.byteLength(truncated.text),
      omittedByteCount: truncated.omittedByteCount,
    },
  };
}

function collectRedactionRanges(source: string, repositoryPath: string): RedactionRange[] {
  const ranges: RedactionRange[] = [];
  for (const { pattern, category } of FORMAT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      ranges.push({ start: match.index, end: match.index + match[0].length, category });
    }
  }

  const scriptKind = repositoryPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(repositoryPath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const visit = (node: ts.Node): void => {
    const candidate = structuralCandidate(node);
    if (candidate && isSensitiveName(candidate.name) && isStaticString(candidate.value)) {
      ranges.push(literalContentRange(candidate.value, sourceFile));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return ranges
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((range, index, sorted) => !sorted.slice(0, index).some((prior) => range.start < prior.end));
}

function structuralCandidate(node: ts.Node): { name: ts.Node; value: ts.Expression } | null {
  if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isParameter(node)) && node.initializer) {
    return { name: node.name, value: node.initializer };
  }
  if (ts.isPropertyAssignment(node)) return { name: node.name, value: node.initializer };
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return { name: node.left, value: node.right };
  }
  if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
    return { name: node.name, value: node.initializer };
  }
  return null;
}

function isSensitiveName(node: ts.Node): boolean {
  let name: string | undefined;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) name = node.text;
  else if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) name = node.text;
  else if (ts.isPropertyAccessExpression(node)) name = node.name.text;
  else if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) name = node.argumentExpression.text;
  else if (ts.isJsxNamespacedName(node)) name = node.name.text;
  if (!name) return false;
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[_-]+/).filter(Boolean);
  return words.some((_, index) => SENSITIVE_NAMES.has(words.slice(index).join("")));
}

function isStaticString(node: ts.Expression): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function literalContentRange(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral, sourceFile: ts.SourceFile): RedactionRange {
  return { start: node.getStart(sourceFile) + 1, end: node.end - 1, category: "credential" };
}

function applyRedactions(source: string, ranges: RedactionRange[]): string {
  let output = "";
  let position = 0;
  for (const range of ranges) {
    output += source.slice(position, range.start);
    output += range.category === "private_key" ? "[REDACTED:private-key]" : "[REDACTED:credential]";
    position = range.end;
  }
  return output + source.slice(position);
}

function truncateUtf8(text: string): { text: string; omittedByteCount: number } {
  const input = Buffer.from(text);
  if (input.length <= MAX_CAPSULE_TEXT_BYTES) return { text, omittedByteCount: 0 };

  let omittedByteCount = input.length - MAX_CAPSULE_TEXT_BYTES;
  let marker = markerFor(omittedByteCount);
  for (;;) {
    const retainedBudget = MAX_CAPSULE_TEXT_BYTES - Buffer.byteLength(marker);
    const headBudget = Math.ceil(retainedBudget / 2);
    const tailBudget = Math.floor(retainedBudget / 2);
    let head = validUtf8Prefix(input, headBudget);
    let tail = validUtf8Suffix(input, tailBudget);
    const unused = retainedBudget - head.length - tail.length;
    if (unused > 0) {
      const expandedHead = validUtf8Prefix(input, headBudget + unused);
      if (expandedHead.length + tail.length <= retainedBudget) head = expandedHead;
    }
    const nextOmitted = input.length - head.length - tail.length;
    const nextMarker = markerFor(nextOmitted);
    if (nextMarker === marker) {
      return { text: head.toString("utf8") + marker + tail.toString("utf8"), omittedByteCount: nextOmitted };
    }
    omittedByteCount = nextOmitted;
    marker = nextMarker;
  }
}

function markerFor(omittedByteCount: number): string {
  return `\n/* [PETRICHOR:TRUNCATED bytes=${omittedByteCount}] */\n`;
}

function validUtf8Prefix(input: Buffer, budget: number): Buffer {
  let end = Math.min(budget, input.length);
  while (end > 0 && (input[end] & 0xc0) === 0x80) end -= 1;
  return input.subarray(0, end);
}

function validUtf8Suffix(input: Buffer, budget: number): Buffer {
  let start = Math.max(0, input.length - budget);
  while (start < input.length && (input[start] & 0xc0) === 0x80) start += 1;
  return input.subarray(start);
}
