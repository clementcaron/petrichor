import { SearchEvidence, SearchEvidenceField, SearchResult } from "../contracts";
import { fetchSearchCandidates, SearchCandidate, tokenizeSearchTerms } from "./database";

const DEFAULT_SEARCH_LIMIT = 10;

interface RankedSearchResult {
  relevance: number;
  result: SearchResult;
  score: number;
  sortColumn: number;
  sortLine: number;
  sortPath: string;
}

export function runSearchQuery(indexPath: string, query: string, limit = DEFAULT_SEARCH_LIMIT): SearchResult[] {
  const queryTokens = tokenizeSearchTerms(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const matchExpression = buildMatchExpression(queryTokens);
  const candidateLimit = Math.max(limit * 5, 50);
  const candidates = fetchSearchCandidates(indexPath, matchExpression, candidateLimit);

  return candidates
    .map((candidate) => rankCandidate(candidate, queryTokens))
    .filter((candidate): candidate is RankedSearchResult => candidate !== undefined)
    .sort(compareRankedResults)
    .slice(0, limit)
    .map((candidate) => candidate.result);
}

function buildMatchExpression(queryTokens: string[]): string {
  return queryTokens.map((token) => `${token}*`).join(" AND ");
}

function rankCandidate(candidate: SearchCandidate, queryTokens: string[]): RankedSearchResult | undefined {
  const evidence = collectEvidence(candidate, queryTokens);
  if (evidence.length === 0) {
    return undefined;
  }

  const primaryScore = Math.max(...evidence.map((e) => evidenceWeight(e)));
  const score = primaryScore + (candidate.resultType === "symbol" ? 50 : 0);

  return {
    relevance: candidate.relevance,
    result:
      candidate.resultType === "symbol"
        ? {
            type: "symbol",
            symbol: {
              name: candidate.symbolName ?? "",
              kind: candidate.symbolKind ?? "function",
              path: candidate.path,
              line: candidate.line ?? 0,
              column: candidate.column ?? 0,
              exported: Boolean(candidate.exported),
            },
            evidence,
          }
        : {
            type: "path",
            path: candidate.path,
            evidence,
          },
    score,
    sortPath: candidate.path,
    sortLine: candidate.line ?? 0,
    sortColumn: candidate.column ?? 0,
  };
}

function compareRankedResults(left: RankedSearchResult, right: RankedSearchResult): number {
  return (
    right.score - left.score ||
    left.relevance - right.relevance ||
    left.sortPath.localeCompare(right.sortPath) ||
    left.sortLine - right.sortLine ||
    left.sortColumn - right.sortColumn
  );
}

function collectEvidence(candidate: SearchCandidate, queryTokens: string[]): SearchEvidence[] {
  const structuralEvidence = new Map<string, SearchEvidence>();
  const normalizedQuery = normalizeValue(queryTokens.join(""));

  if (candidate.resultType === "symbol" && candidate.symbolName) {
    const e = classifyFieldMatch([candidate.symbolName], queryTokens, normalizedQuery, "symbol_name");
    if (e) {
      structuralEvidence.set(`${e.field}:${e.match}`, e);
    }
  }

  const pathEvidence = classifyFieldMatch([candidate.path], queryTokens, normalizedQuery, "repository_path");
  if (pathEvidence) {
    structuralEvidence.set(`${pathEvidence.field}:${pathEvidence.match}`, pathEvidence);
  }

  if (candidate.resultType === "path") {
    const symbolNames = candidate.symbolNames
      ? candidate.symbolNames.split("\n").filter((value) => value.length > 0)
      : [];
    const e = classifyFieldMatch(symbolNames, queryTokens, normalizedQuery, "symbol_name");
    if (e) {
      structuralEvidence.set(`${e.field}:${e.match}`, e);
    }
  }

  if (structuralEvidence.size > 0) {
    return Array.from(structuralEvidence.values()).sort(compareEvidence);
  }

  if (matchesTokens(candidate.contentText, queryTokens)) {
    return [{ field: "source_text", match: "token" }];
  }

  return [];
}

function classifyFieldMatch(
  candidateValues: readonly string[],
  queryTokens: string[],
  normalizedQuery: string,
  field: Exclude<SearchEvidenceField, "source_text">,
): SearchEvidence | undefined {
  for (const value of candidateValues) {
    const normalized = normalizeValue(value);
    if (normalized.length > 0 && normalized === normalizedQuery) {
      return { field, match: "exact" };
    }
  }

  for (const value of candidateValues) {
    const normalized = normalizeValue(value);
    if (normalizedQuery.length > 0 && normalized.startsWith(normalizedQuery)) {
      return { field, match: "prefix" };
    }
  }

  for (const value of candidateValues) {
    if (matchesTokens(value, queryTokens)) {
      return { field, match: "token" };
    }
  }

  return undefined;
}

function matchesTokens(candidateValue: string, queryTokens: string[]): boolean {
  const candidateTokens = tokenizeSearchTerms(candidateValue);
  return queryTokens.every((queryToken) => candidateTokens.some((candidateToken) => candidateToken.startsWith(queryToken)));
}

function compareEvidence(left: SearchEvidence, right: SearchEvidence): number {
  return evidenceWeight(right) - evidenceWeight(left) || left.field.localeCompare(right.field);
}

function evidenceWeight(evidence: SearchEvidence): number {
  if (evidence.field === "symbol_name" && evidence.match === "exact") return 600;
  if (evidence.field === "symbol_name" && evidence.match === "prefix") return 500;
  if (evidence.field === "symbol_name" && evidence.match === "token") return 400;
  if (evidence.field === "repository_path" && evidence.match === "exact") return 350;
  if (evidence.field === "repository_path" && evidence.match === "prefix") return 300;
  if (evidence.field === "repository_path" && evidence.match === "token") return 250;
  return 100;
}

function normalizeValue(value: string): string {
  return tokenizeSearchTerms(value).join("");
}
