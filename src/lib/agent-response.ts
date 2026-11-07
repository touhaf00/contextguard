import { extractJson } from "./extract-json.js";

export type AgentResponseStage = "WORKER" | "GUARD" | "DISCOVERY";

export interface AgentInvalidResponseInfo {
  stage: AgentResponseStage;
  attempt: 1 | 2;
  reason: string;
}

function isJsonFormatError(error: unknown): boolean {
  return error instanceof SyntaxError ||
    (error instanceof Error && /^(Agent response does not contain JSON\.|Agent response contains incomplete JSON\.)/.test(error.message));
}

export async function parseAgentJsonWithBoundedRetryV2<T>(
  firstResponse: string,
  retry: () => Promise<string>,
  stage: AgentResponseStage,
  onInvalid?: (info: AgentInvalidResponseInfo, rawResponse: string) => void
): Promise<T> {
  try {
    return extractJson<T>(firstResponse);
  } catch (error) {
    if (!isJsonFormatError(error)) {
      throw error;
    }
    safeNotify(onInvalid, { stage, attempt: 1, reason: error instanceof Error ? error.message : "invalid JSON" }, firstResponse);
  }

  let secondResponse = "";
  try {
    secondResponse = await retry();
    return extractJson<T>(secondResponse);
  } catch (error) {
    safeNotify(onInvalid, { stage, attempt: 2, reason: error instanceof Error ? error.message : "invalid JSON" }, secondResponse);
    throw new Error(`AGENT_${stage}_OUTPUT_INVALID: Cominty did not return complete JSON after one format repair. No GitHub write is authorized.`);
  }
}

function safeNotify(
  onInvalid: ((info: AgentInvalidResponseInfo, rawResponse: string) => void) | undefined,
  info: AgentInvalidResponseInfo,
  raw: string
): void {
  if (!onInvalid) return;
  try { onInvalid(info, raw); } catch { }
}
