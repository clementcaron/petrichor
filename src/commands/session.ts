import { SessionGuideResponse, SessionRecordResponse } from "../contracts";
import { PetrichorError, toCliError } from "../lib/errors";
import { writeJson } from "../lib/output";
import { getSessionStorePath } from "../lib/project";
import { getSessionGuide, recordSessionEvent } from "../lib/session";

export async function runSessionRecordCommand(sessionId: string): Promise<number> {
  const baseResponse: SessionRecordResponse = { status: "error", sessionId, eventId: 0 };

  try {
    const input = await readSessionEvent();
    const eventId = recordSessionEvent(getSessionStorePath(process.cwd()), sessionId, input);
    writeJson({ status: "ok", sessionId, eventId } satisfies SessionRecordResponse);
    return 0;
  } catch (error) {
    writeJson({ ...baseResponse, error: toCliError(error, "session_record_failed") });
    return 1;
  }
}

export function runSessionGuideCommand(sessionId: string): number {
  const emptyGuide: SessionGuideResponse["guide"] = {
    latestIntent: null,
    decisions: [],
    pendingTasks: [],
    completedTasks: [],
    changedFiles: [],
    openProblems: [],
    resolvedProblems: [],
  };

  try {
    writeJson(getSessionGuide(getSessionStorePath(process.cwd()), sessionId));
    return 0;
  } catch (error) {
    writeJson({
      status: "error",
      sessionId,
      guide: emptyGuide,
      error: toCliError(error, "session_guide_failed"),
    } satisfies SessionGuideResponse);
    return 1;
  }
}

async function readSessionEvent(): Promise<unknown> {
  process.stdin.setEncoding("utf8");
  let source = "";
  for await (const chunk of process.stdin) {
    source += chunk;
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new PetrichorError("invalid_session_event", "Session Event input must be valid JSON.");
  }
}
