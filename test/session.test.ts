import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { getSessionGuide, recordSessionEvent } from "../src/lib/session";
import { withFixtureRepository } from "./helpers";

test("Session Guide folds the latest structured state and orders it by recency", async () => {
  await withFixtureRepository("repository", async (repositoryRoot) => {
    const storePath = path.join(repositoryRoot, ".petrichor", "session.db");

    recordSessionEvent(storePath, "coding-session-1", { type: "intent", summary: "Implement memory" });
    recordSessionEvent(storePath, "coding-session-1", {
      type: "task", key: "tests", summary: "Write tests", status: "pending",
    });
    recordSessionEvent(storePath, "coding-session-1", {
      type: "decision", key: "storage", summary: "Use index.db",
    });
    recordSessionEvent(storePath, "coding-session-1", {
      type: "decision", key: "storage", summary: "Use session.db",
    });
    recordSessionEvent(storePath, "coding-session-1", {
      type: "file_change", path: "src/lib/session.ts", summary: "Added Session Store",
    });
    recordSessionEvent(storePath, "coding-session-1", {
      type: "file_change", path: "src/lib/session.ts", summary: "Finished Session Store",
    });
    recordSessionEvent(storePath, "coding-session-1", {
      type: "problem", key: "contract", summary: "Contract unclear", status: "open",
    });
    recordSessionEvent(storePath, "coding-session-1", {
      type: "problem", key: "contract", summary: "Contract resolved", status: "resolved",
    });
    recordSessionEvent(storePath, "coding-session-1", {
      type: "problem", key: "docs", summary: "Docs incomplete", status: "open",
    });
    recordSessionEvent(storePath, "coding-session-1", {
      type: "task", key: "tests", summary: "Tests pass", status: "completed",
    });

    assert.deepEqual(getSessionGuide(storePath, "coding-session-1"), {
      sessionId: "coding-session-1",
      status: "ok",
      guide: {
        latestIntent: "Implement memory",
        decisions: [{ key: "storage", summary: "Use session.db" }],
        pendingTasks: [],
        completedTasks: [{ key: "tests", summary: "Tests pass" }],
        changedFiles: [{ path: "src/lib/session.ts", summary: "Finished Session Store" }],
        openProblems: [{ key: "docs", summary: "Docs incomplete" }],
        resolvedProblems: [{ key: "contract", summary: "Contract resolved" }],
      },
    } satisfies SessionGuideResponse);
  });
});

test("Session Store keeps caller-supplied session IDs isolated", async () => {
  await withFixtureRepository("repository", async (repositoryRoot) => {
    const storePath = path.join(repositoryRoot, ".petrichor", "session.db");
    recordSessionEvent(storePath, "one", { type: "intent", summary: "First" });
    recordSessionEvent(storePath, "two", { type: "intent", summary: "Second" });

    assert.equal(getSessionGuide(storePath, "one").guide.latestIntent, "First");
    assert.equal(getSessionGuide(storePath, "two").guide.latestIntent, "Second");
  });
});

test("recordSessionEvent validates event shapes and Repository Paths", async () => {
  await withFixtureRepository("repository", async (repositoryRoot) => {
    const storePath = path.join(repositoryRoot, ".petrichor", "session.db");

    assert.throws(
      () => recordSessionEvent(storePath, "one", { type: "file_change", path: "../outside.ts", summary: "Bad" }),
      (error: Error & { code?: string }) => error.code === "invalid_session_event",
    );
    assert.throws(
      () => recordSessionEvent(storePath, "", { type: "intent", summary: "Bad" }),
      (error: Error & { code?: string }) => error.code === "invalid_session_id",
    );
  });
});
