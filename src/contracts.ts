export type SymbolKind = "class" | "enum" | "function" | "interface" | "type" | "variable";

export type SkipReason = "parse_error" | "read_error";

export type IndexStatus = "ok" | "partial" | "error";

export type LookupStatus = "ok" | "no_matches" | "error";

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

export interface SkippedFile {
  path: string;
  reason: SkipReason;
}

export interface IndexResponse {
  status: IndexStatus;
  indexPath: string;
  fileCount: number;
  symbolCount: number;
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
