import {
  parseAgentJsonWithBoundedRetryV2,
  type AgentInvalidResponseInfo
} from "../../lib/agent-response.js";

export type AgentJsonStage = "WORKER" | "GUARD";

export const AGENT_FORMAT_REPAIR_NOTE =
  "\n\nFORMAT NOTE (same request, nothing else changes):\n" +
  "A previous reply to this exact request did not contain a JSON object that ContextGuard could read.\n" +
  "Reply to the same request with exactly one JSON object that follows the OUTPUT CONTRACT above, and nothing else.\n" +
  "This note concerns formatting only. It does not say which decision or verdict is correct.";

const PREVIEW_CHARS = 300;

export function previewAgentReply(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, "[redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, "[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_CHARS);
}

export async function readAgentJsonWithOneFormatRepair<T>(options: {
  stage: AgentJsonStage;
  prompt: string;
  start: (message: string) => Promise<string>;
  warn?: (message: string, details: Record<string, unknown>) => void;
}): Promise<T> {
  const warn = options.warn ?? ((message: string, details: Record<string, unknown>) => console.warn(message, details));
  const first = await options.start(options.prompt);
  return parseAgentJsonWithBoundedRetryV2<T>(
    first,
    () => options.start(options.prompt + AGENT_FORMAT_REPAIR_NOTE),
    options.stage,
    (info: AgentInvalidResponseInfo, raw: string) => {
      warn(`[ui-v2][agent-output] ${info.stage} reply ${info.attempt === 1 ? "has no usable JSON; one format repair follows" : "still has no usable JSON; failing closed"}`, {
        stage: info.stage,
        attempt: info.attempt,
        reason: info.reason,
        chars: typeof raw === "string" ? raw.length : 0,
        preview: previewAgentReply(raw)
      });
    }
  );
}
