export type SymbolKind = "class" | "enum" | "function" | "interface" | "type" | "variable";
export type ImportRelationshipSyntax = "import" | "re_export";

export type SkipReason = "parse_error" | "read_error";

export type IndexStatus = "ok" | "partial" | "error";

export type LookupStatus = "ok" | "no_matches" | "error";
export type SearchStatus = "ok" | "no_matches" | "error";
export type ImportRelationshipsStatus = "ok" | "error";
export type CallRelationshipsStatus = "ok" | "no_matches" | "error";
export type CapsuleStatus = "ok" | "error";
export type HooksInstallStatus = "ok" | "error";
export type SessionRecordStatus = "ok" | "error";
export type SessionGuideStatus = "ok" | "no_matches" | "error";

export type HookType = "runtime" | "instruction";
export type HookPlatform = "claude" | "opencode" | "copilot" | "codex";
export type HooksInstallAction = "written" | "would_write";
export type HooksUninstallAction = "removed" | "would_remove" | "not_installed";

export interface CliError {
  code: string;
  message: string;
}

export interface IndexedSymbol {
  name: string;
  kind: SymbolKind;
  path: string;
  line: number;
  column: number;
  exported: boolean;
}

export type IndexedFunction = IndexedSymbol & { kind: "function" };

export interface ImportRelationship {
  sourcePath: string;
  targetPath: string;
  line: number;
  column: number;
  syntax: ImportRelationshipSyntax;
  typeOnly: boolean;
  sideEffect: boolean;
}

export interface CallSite {
  line: number;
  column: number;
}

export interface CallRelationship {
  caller: IndexedFunction;
  callee: IndexedFunction;
  callSite: CallSite;
}

export interface SkippedFile {
  path: string;
  reason: SkipReason;
}

export interface IndexResponse {
  status: IndexStatus;
  indexPath: string;
  fileCount: number;
  symbolCount: number;
  changedFileCount: number;
  skippedFileCount: number;
  skippedFiles: SkippedFile[];
  error?: CliError;
}

export interface LookupResponse {
  query: string;
  status: LookupStatus;
  matchCount: number;
  matches: IndexedSymbol[];
  error?: CliError;
}

export type SearchEvidenceField = "symbol_name" | "repository_path" | "source_text";
export type SearchEvidenceMatch = "exact" | "prefix" | "token";

export interface SearchEvidence {
  field: SearchEvidenceField;
  match: SearchEvidenceMatch;
}

export interface SymbolSearchResult {
  type: "symbol";
  symbol: IndexedSymbol;
  evidence: SearchEvidence[];
}

export interface PathSearchResult {
  type: "path";
  path: string;
  evidence: SearchEvidence[];
}

export type SearchResult = SymbolSearchResult | PathSearchResult;

export interface SearchResponse {
  query: string;
  status: SearchStatus;
  resultCount: number;
  results: SearchResult[];
  error?: CliError;
}

export interface ImportRelationshipsResponse {
  path: string;
  status: ImportRelationshipsStatus;
  relationshipCount: number;
  relationships: ImportRelationship[];
  error?: CliError;
}

export interface CallRelationshipsResponse {
  query: string;
  status: CallRelationshipsStatus;
  subjectCount: number;
  subjects: IndexedFunction[];
  relationshipCount: number;
  relationships: CallRelationship[];
  error?: CliError;
}

export interface CapsulePivot {
  source: string;
}

export interface CapsuleImportSummary {
  syntax: ImportRelationshipSyntax;
  typeOnly: boolean;
  sideEffect: boolean;
  count: number;
}

export interface CapsuleCallSummary {
  caller: IndexedFunction;
  callee: IndexedFunction;
  count: number;
}

export interface CapsuleNeighbor {
  path: string;
  skeleton: string;
  imports: CapsuleImportSummary[];
  importedBy: CapsuleImportSummary[];
  callsTo: CapsuleCallSummary[];
  calledBy: CapsuleCallSummary[];
}

export interface CapsuleResponse {
  path: string;
  status: CapsuleStatus;
  pivot: CapsulePivot;
  symbolCount: number;
  symbols: IndexedSymbol[];
  neighborCount: number;
  neighbors: CapsuleNeighbor[];
  error?: CliError;
}

export interface HooksPlatformResult {
  platform: HookPlatform;
  hookType: HookType;
  configPath: string;
  hookScript: string | null;
  action: HooksInstallAction;
}

export interface HooksUninstallPlatformResult {
  platform: HookPlatform;
  hookType: HookType;
  configPath: string;
  hookScript: string | null;
  action: HooksUninstallAction;
}

export interface HooksSkippedPlatform {
  platform: HookPlatform;
  reason: "not_detected";
}

export interface HooksInstallResponse {
  status: HooksInstallStatus;
  platforms: HooksPlatformResult[];
  skipped: HooksSkippedPlatform[];
  error?: CliError;
}

export interface HooksUninstallResponse {
  status: HooksInstallStatus;
  platforms: HooksUninstallPlatformResult[];
  skipped: HooksSkippedPlatform[];
  error?: CliError;
}

export interface SessionGuideItem {
  key: string;
  summary: string;
}

export interface SessionGuideFile {
  path: string;
  summary: string;
}

export interface SessionGuide {
  latestIntent: string | null;
  decisions: SessionGuideItem[];
  pendingTasks: SessionGuideItem[];
  completedTasks: SessionGuideItem[];
  changedFiles: SessionGuideFile[];
  openProblems: SessionGuideItem[];
  resolvedProblems: SessionGuideItem[];
}

export interface SessionRecordResponse {
  status: SessionRecordStatus;
  sessionId: string;
  eventId: number;
  error?: CliError;
}

export interface SessionGuideResponse {
  status: SessionGuideStatus;
  sessionId: string;
  guide: SessionGuide;
  error?: CliError;
}
