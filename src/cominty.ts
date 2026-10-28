import { Cominty } from "@cominty-ai/sdk";

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
