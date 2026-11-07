import { APIError, Cominty, InvalidParams } from "@cominty-ai/sdk";

import {
  getComintyConfig
} from "./config.js";

let client: Cominty | undefined;

export function getComintyRuntime() {
  const config = getComintyConfig();

  if (!client) {
    client = new Cominty();
  }

  return {
    client,
    workerAgentId: config.workerAgentId,
    guardAgentId: config.guardAgentId
  };
}

export const MEMORYLESS_THREAD = { memory: { activation: "never" } } as const;

let memoryOverrideRefused = false;

export async function startAgentThread(
  cominty: Pick<Cominty, "chat">,
  params: { agentId: string; message: string }
): ReturnType<Cominty["chat"]["start"]> {
  if (memoryOverrideRefused) return cominty.chat.start(params);
  try {
    return await cominty.chat.start({ ...params, threadCapabilities: MEMORYLESS_THREAD });
  } catch (error) {
    const refused = error instanceof InvalidParams || (error instanceof APIError && error.status === 422);
    if (!refused) throw error;
    const run = await cominty.chat.start(params);
    memoryOverrideRefused = true;
    console.warn("[cominty] The Cominty API refused the per-thread memory override; agents now run with their own memory settings.");
    return run;
  }
}
