import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  CallRelationship,
  CapsuleCallSummary,
  CapsuleImportSummary,
  CapsuleNeighbor,
  CapsuleResponse,
  ImportRelationship,
  IndexedSymbol,
} from "../contracts";
import {
  lookupCallRelationshipsByCalleePath,
  lookupCallRelationshipsByCallerPath,
  lookupImportRelationshipsBySourcePath,
  lookupImportRelationshipsByTargetPath,
  lookupSymbolsByPath,
} from "./database";

interface CapsuleRawEvidence {
  symbols: IndexedSymbol[];
  outgoingImports: ImportRelationship[];
  incomingImports: ImportRelationship[];
  outgoingCalls: CallRelationship[];
  incomingCalls: CallRelationship[];
}

interface NeighborAccumulator {
  path: string;
  imports: CapsuleImportSummary[];
  importedBy: CapsuleImportSummary[];
  callsTo: CapsuleCallSummary[];
  calledBy: CapsuleCallSummary[];
  importIndexes: {
    imports: Map<string, CapsuleImportSummary>;
    importedBy: Map<string, CapsuleImportSummary>;
  };
  callIndexes: {
    callsTo: Map<string, CapsuleCallSummary>;
    calledBy: Map<string, CapsuleCallSummary>;
  };
}

function loadCapsuleEvidence(indexPath: string, repositoryPath: string): CapsuleRawEvidence {
  return {
    symbols: lookupSymbolsByPath(indexPath, repositoryPath),
    outgoingImports: lookupImportRelationshipsBySourcePath(indexPath, repositoryPath),
    incomingImports: lookupImportRelationshipsByTargetPath(indexPath, repositoryPath),
    outgoingCalls: lookupCallRelationshipsByCallerPath(indexPath, repositoryPath),
    incomingCalls: lookupCallRelationshipsByCalleePath(indexPath, repositoryPath),
  };
}

export async function queryCapsule(
  indexPath: string,
  repositoryRoot: string,
  repositoryPath: string,
): Promise<CapsuleResponse> {
  const evidence = loadCapsuleEvidence(indexPath, repositoryPath);
  const source = await readFile(path.join(repositoryRoot, repositoryPath), "utf8");
  const neighbors = assembleNeighbors(
    repositoryPath,
    evidence.outgoingImports,
    evidence.incomingImports,
    evidence.outgoingCalls,
    evidence.incomingCalls,
  );

  return {
    path: repositoryPath,
    status: "ok",
    pivot: { source },
    symbolCount: evidence.symbols.length,
    symbols: evidence.symbols,
    neighborCount: neighbors.length,
    neighbors,
  };
}

function assembleNeighbors(
  repositoryPath: string,
  outgoingImports: ImportRelationship[],
  incomingImports: ImportRelationship[],
  outgoingCalls: CallRelationship[],
  incomingCalls: CallRelationship[],
): CapsuleNeighbor[] {
  const neighbors = new Map<string, NeighborAccumulator>();

  for (const relationship of outgoingImports) {
    addImportSummary(neighbors, relationship.targetPath, "imports", relationship);
  }

  for (const relationship of incomingImports) {
    addImportSummary(neighbors, relationship.sourcePath, "importedBy", relationship);
  }

  for (const relationship of outgoingCalls) {
    if (relationship.callee.path === repositoryPath) {
      continue;
    }
    addCallSummary(neighbors, relationship.callee.path, "callsTo", relationship);
  }

  for (const relationship of incomingCalls) {
    if (relationship.caller.path === repositoryPath) {
      continue;
    }
    addCallSummary(neighbors, relationship.caller.path, "calledBy", relationship);
  }

  return Array.from(neighbors.values())
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((neighbor) => ({
      path: neighbor.path,
      imports: sortImportSummaries(neighbor.imports),
      importedBy: sortImportSummaries(neighbor.importedBy),
      callsTo: sortCallSummaries(neighbor.callsTo),
      calledBy: sortCallSummaries(neighbor.calledBy),
    }));
}

function addImportSummary(
  neighbors: Map<string, NeighborAccumulator>,
  neighborPath: string,
  direction: "imports" | "importedBy",
  relationship: ImportRelationship,
): void {
  const neighbor = getOrCreateNeighbor(neighbors, neighborPath);
  const key = `${relationship.syntax}|${relationship.typeOnly ? 1 : 0}|${relationship.sideEffect ? 1 : 0}`;
  const existingSummary = neighbor.importIndexes[direction].get(key);

  if (existingSummary) {
    existingSummary.count += 1;
    return;
  }

  const summary: CapsuleImportSummary = {
    syntax: relationship.syntax,
    typeOnly: relationship.typeOnly,
    sideEffect: relationship.sideEffect,
    count: 1,
  };

  neighbor.importIndexes[direction].set(key, summary);
  neighbor[direction].push(summary);
}

function addCallSummary(
  neighbors: Map<string, NeighborAccumulator>,
  neighborPath: string,
  direction: "callsTo" | "calledBy",
  relationship: CallRelationship,
): void {
  const neighbor = getOrCreateNeighbor(neighbors, neighborPath);
  const key = [
    relationship.caller.path,
    relationship.caller.line,
    relationship.caller.column,
    relationship.callee.path,
    relationship.callee.line,
    relationship.callee.column,
  ].join("|");
  const existingSummary = neighbor.callIndexes[direction].get(key);

  if (existingSummary) {
    existingSummary.count += 1;
    return;
  }

  const summary: CapsuleCallSummary = {
    caller: relationship.caller,
    callee: relationship.callee,
    count: 1,
  };

  neighbor.callIndexes[direction].set(key, summary);
  neighbor[direction].push(summary);
}

function getOrCreateNeighbor(
  neighbors: Map<string, NeighborAccumulator>,
  neighborPath: string,
): NeighborAccumulator {
  const existing = neighbors.get(neighborPath);
  if (existing) {
    return existing;
  }

  const neighbor: NeighborAccumulator = {
    path: neighborPath,
    imports: [],
    importedBy: [],
    callsTo: [],
    calledBy: [],
    importIndexes: {
      imports: new Map<string, CapsuleImportSummary>(),
      importedBy: new Map<string, CapsuleImportSummary>(),
    },
    callIndexes: {
      callsTo: new Map<string, CapsuleCallSummary>(),
      calledBy: new Map<string, CapsuleCallSummary>(),
    },
  };
  neighbors.set(neighborPath, neighbor);
  return neighbor;
}

function sortImportSummaries(summaries: CapsuleImportSummary[]): CapsuleImportSummary[] {
  return [...summaries].sort((left, right) => {
    if (left.syntax !== right.syntax) {
      return left.syntax.localeCompare(right.syntax);
    }
    if (left.typeOnly !== right.typeOnly) {
      return Number(left.typeOnly) - Number(right.typeOnly);
    }
    if (left.sideEffect !== right.sideEffect) {
      return Number(left.sideEffect) - Number(right.sideEffect);
    }
    return left.count - right.count;
  });
}

function sortCallSummaries(summaries: CapsuleCallSummary[]): CapsuleCallSummary[] {
  return [...summaries].sort((left, right) => {
    const callerComparison = compareIndexedFunctions(left.caller, right.caller);
    if (callerComparison !== 0) {
      return callerComparison;
    }
    const calleeComparison = compareIndexedFunctions(left.callee, right.callee);
    if (calleeComparison !== 0) {
      return calleeComparison;
    }
    return left.count - right.count;
  });
}

function compareIndexedFunctions(
  left: CapsuleCallSummary["caller"],
  right: CapsuleCallSummary["caller"],
): number {
  if (left.path !== right.path) {
    return left.path.localeCompare(right.path);
  }
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  if (left.column !== right.column) {
    return left.column - right.column;
  }
  if (left.name !== right.name) {
    return left.name.localeCompare(right.name);
  }
  return Number(left.exported) - Number(right.exported);
}
