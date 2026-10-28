import {
  existsSync,
  readFileSync
} from "node:fs";

const LOCAL_ENV_FILE = ".env.local";

let localEnvLoaded = false;

function loadLocalEnv(): void {
  if (localEnvLoaded) {
    return;
  }

  localEnvLoaded = true;

  if (!existsSync(LOCAL_ENV_FILE)) {
    return;
  }

  const content = readFileSync(
    LOCAL_ENV_FILE,
    "utf8"
  );

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key =
      trimmed.slice(0, separator).trim();

    const value =
      trimmed.slice(separator + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name: string): string {
  loadLocalEnv();

  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required.`
    );
  }

  return value;
}

export interface ComintyConfig {
  apiKey: string;
  userId: string;
  workerAgentId: string;
  guardAgentId: string;
}

export function getComintyConfig(): ComintyConfig {
  return {
    apiKey:
      requiredEnv("COMINTY_API_KEY"),

    userId:
      requiredEnv("COMINTY_USER_ID"),

    workerAgentId:
      requiredEnv("COMINTY_WORKER_AGENT_ID"),

    guardAgentId:
      requiredEnv("COMINTY_GUARD_AGENT_ID")
  };
}
