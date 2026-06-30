import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { SessionGuide, SessionGuideResponse } from "../contracts";
import { PetrichorError } from "./errors";

type TaskStatus = "pending" | "completed";
type ProblemStatus = "open" | "resolved";

export type SessionEvent =
  | { type: "intent"; summary: string }
  | { type: "decision"; key: string; summary: string }
  | { type: "task"; key: string; summary: string; status: TaskStatus }
  | { type: "file_change"; path: string; summary: string }
  | { type: "problem"; key: string; summary: string; status: ProblemStatus };

interface SessionEventRow {
  id: number;
  event_type: SessionEvent["type"];
  event_key: string | null;
  repository_path: string | null;
  summary: string;
  event_status: string | null;
}

const EMPTY_GUIDE: SessionGuide = {
  latestIntent: null,
  decisions: [],
  pendingTasks: [],
  completedTasks: [],
  changedFiles: [],
  openProblems: [],
  resolvedProblems: [],
};

export function recordSessionEvent(storePath: string, sessionId: string, input: unknown): number {
  validateSessionId(sessionId);
  const event = parseSessionEvent(input);
  const database = openSessionStore(storePath);

  try {
    const result = database.prepare(`
      INSERT INTO session_events (
        session_id, event_type, event_key, repository_path, summary, event_status
      ) VALUES (
        @sessionId, @type, @key, @repositoryPath, @summary, @status
      )
    `).run({
      sessionId,
      type: event.type,
      key: "key" in event ? event.key : null,
      repositoryPath: "path" in event ? event.path : null,
      summary: event.summary,
      status: "status" in event ? event.status : null,
    });

    return Number(result.lastInsertRowid);
  } finally {
    database.close();
  }
}

export function getSessionGuide(storePath: string, sessionId: string): SessionGuideResponse {
  validateSessionId(sessionId);
  const database = openSessionStore(storePath);

  try {
    const rows = database.prepare(`
      SELECT id, event_type, event_key, repository_path, summary, event_status
      FROM session_events
      WHERE session_id = ?
      ORDER BY id DESC
    `).all(sessionId) as SessionEventRow[];

    if (rows.length === 0) {
      return { sessionId, status: "no_matches", guide: { ...EMPTY_GUIDE } };
    }

    return { sessionId, status: "ok", guide: foldSessionGuide(rows) };
  } finally {
    database.close();
  }
}

function openSessionStore(storePath: string): Database.Database {
  mkdirSync(path.dirname(storePath), { recursive: true });
  const database = new Database(storePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('intent', 'decision', 'task', 'file_change', 'problem')),
      event_key TEXT,
      repository_path TEXT,
      summary TEXT NOT NULL,
      event_status TEXT
    );

    CREATE INDEX IF NOT EXISTS session_events_session_idx
      ON session_events (session_id, id DESC);
  `);
  return database;
}

function foldSessionGuide(rows: SessionEventRow[]): SessionGuide {
  const guide: SessionGuide = {
    latestIntent: null,
    decisions: [],
    pendingTasks: [],
    completedTasks: [],
    changedFiles: [],
    openProblems: [],
    resolvedProblems: [],
  };
  const seenDecisions = new Set<string>();
  const seenTasks = new Set<string>();
  const seenFiles = new Set<string>();
  const seenProblems = new Set<string>();

  for (const row of rows) {
    if (row.event_type === "intent" && guide.latestIntent === null) {
      guide.latestIntent = row.summary;
    } else if (row.event_type === "decision" && row.event_key && !seenDecisions.has(row.event_key)) {
      seenDecisions.add(row.event_key);
      guide.decisions.push({ key: row.event_key, summary: row.summary });
    } else if (row.event_type === "task" && row.event_key && !seenTasks.has(row.event_key)) {
      seenTasks.add(row.event_key);
      const target = row.event_status === "completed" ? guide.completedTasks : guide.pendingTasks;
      target.push({ key: row.event_key, summary: row.summary });
    } else if (row.event_type === "file_change" && row.repository_path && !seenFiles.has(row.repository_path)) {
      seenFiles.add(row.repository_path);
      guide.changedFiles.push({ path: row.repository_path, summary: row.summary });
    } else if (row.event_type === "problem" && row.event_key && !seenProblems.has(row.event_key)) {
      seenProblems.add(row.event_key);
      const target = row.event_status === "resolved" ? guide.resolvedProblems : guide.openProblems;
      target.push({ key: row.event_key, summary: row.summary });
    }
  }

  return guide;
}

function validateSessionId(sessionId: string): void {
  if (sessionId.trim().length === 0) {
    throw new PetrichorError("invalid_session_id", "Session ID must not be empty.");
  }
}

function parseSessionEvent(input: unknown): SessionEvent {
  if (!isRecord(input) || typeof input.type !== "string") {
    throw invalidEvent("Session Event must be a JSON object with a supported `type`.");
  }

  const summary = requiredString(input.summary, "summary");
  if (input.type === "intent") return { type: "intent", summary };
  if (input.type === "decision") {
    return { type: "decision", key: requiredString(input.key, "key"), summary };
  }
  if (input.type === "task") {
    if (input.status !== "pending" && input.status !== "completed") {
      throw invalidEvent("Task status must be `pending` or `completed`.");
    }
    return { type: "task", key: requiredString(input.key, "key"), summary, status: input.status };
  }
  if (input.type === "file_change") {
    return { type: "file_change", path: requiredRepositoryPath(input.path), summary };
  }
  if (input.type === "problem") {
    if (input.status !== "open" && input.status !== "resolved") {
      throw invalidEvent("Problem status must be `open` or `resolved`.");
    }
    return { type: "problem", key: requiredString(input.key, "key"), summary, status: input.status };
  }

  throw invalidEvent(`Unsupported Session Event type: ${input.type}.`);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidEvent(`Session Event \`${field}\` must be a non-empty string.`);
  }
  return value;
}

function requiredRepositoryPath(value: unknown): string {
  const repositoryPath = requiredString(value, "path");
  if (
    path.posix.isAbsolute(repositoryPath)
    || repositoryPath.includes("\\")
    || path.posix.normalize(repositoryPath) !== repositoryPath
    || repositoryPath === "."
    || repositoryPath.startsWith("../")
  ) {
    throw invalidEvent("Session Event `path` must be a normalized Repository Path.");
  }
  return repositoryPath;
}

function invalidEvent(message: string): PetrichorError {
  return new PetrichorError("invalid_session_event", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
