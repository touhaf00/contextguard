import { parseGitHubAppConfig, type GitHubAppConfig } from "./api/ui/github-app-auth.js";

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

export interface LiveAccessConfig {
  accessToken: string;
  allowedRepositories: string[];
  maxRequests: number;
  windowMs: number;
}

function positiveIntegerEnv(
  name: string,
  fallback: number
): number {
  loadLocalEnv();

  const raw =
    process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${name} must be a positive integer.`
    );
  }

  return value;
}

export function getLiveAccessConfig():
  LiveAccessConfig {
  loadLocalEnv();

  const allowedRepositories =
    (
      process.env
        .LIVE_ALLOWED_REPOSITORIES ??
      ""
    )
      .split(",")
      .map(
        (repository) =>
          repository.trim()
      )
      .filter(Boolean);

  return {
    accessToken:
      process.env
        .LIVE_ACCESS_TOKEN
        ?.trim() ?? "",

    allowedRepositories,

    maxRequests:
      positiveIntegerEnv(
        "LIVE_MAX_REQUESTS",
        3
      ),

    windowMs:
      positiveIntegerEnv(
        "LIVE_WINDOW_MS",
        600_000
      )
  };
}

export interface GenericApprovalAccessConfig {
  accessToken:
    string;

  principalId:
    string;

  displayName?:
    string;
}

export function getGenericApprovalAccessConfig():
  GenericApprovalAccessConfig {
  loadLocalEnv();

  const displayName =
    process.env
      .GENERIC_APPROVER_DISPLAY_NAME
      ?.trim();

  return {
    accessToken:
      process.env
        .GENERIC_APPROVAL_ACCESS_TOKEN
        ?.trim() ?? "",

    principalId:
      process.env
        .GENERIC_APPROVER_ID
        ?.trim() ?? "",

    ...(displayName
      ? {
          displayName
        }
      : {})
  };
}

export interface GenericRuntimeAccessConfig {
  accessToken:
    string;
}

export function getGenericRuntimeAccessConfig():
  GenericRuntimeAccessConfig {
  loadLocalEnv();

  return {
    accessToken:
      process.env
        .GENERIC_RUNTIME_ACCESS_TOKEN
        ?.trim() ?? ""
  };
}

export interface GitHubSnapshotConfig {
  token?:
    string;

  apiBaseUrl:
    string;
}

export function getGitHubSnapshotConfig():
  GitHubSnapshotConfig {
  loadLocalEnv();

  const token =
    process.env
      .GITHUB_TOKEN
      ?.trim();

  return {
    ...(token
      ? {
          token
        }
      : {}),

    apiBaseUrl:
      process.env
        .GITHUB_API_BASE_URL
        ?.trim() ||
      "https://api.github.com"
  };
}

export interface GenericExecutorAccessConfig {
  accessToken:
    string;
}

export function getGenericExecutorAccessConfig():
  GenericExecutorAccessConfig {
  loadLocalEnv();

  return {
    accessToken:
      process.env
        .GENERIC_EXECUTOR_ACCESS_TOKEN
        ?.trim() ?? ""
  };
}

export interface GitHubExecutionConfig {
  token?:
    string;

  allowedRepositories:
    string[];

  apiBaseUrl:
    string;
}

export function getGitHubExecutionConfig():
  GitHubExecutionConfig {
  loadLocalEnv();

  const token =
    process.env
      .GITHUB_EXECUTION_TOKEN
      ?.trim();

  const allowedRepositories =
    (
      process.env
        .GITHUB_EXECUTION_ALLOWED_REPOSITORIES ??
      ""
    )
      .split(",")
      .map(
        repository =>
          repository.trim()
      )
      .filter(Boolean);

  if (
    (
      token &&
      allowedRepositories.length ===
        0
    ) ||
    (
      !token &&
      allowedRepositories.length >
        0
    )
  ) {
    throw new Error(
      "GitHub execution requires both GITHUB_EXECUTION_TOKEN and GITHUB_EXECUTION_ALLOWED_REPOSITORIES."
    );
  }

  return {
    ...(token
      ? {
          token
        }
      : {}),

    allowedRepositories,

    apiBaseUrl:
      process.env
        .GITHUB_EXECUTION_API_BASE_URL
        ?.trim() ||
      "https://api.github.com"
  };
}

export interface ContextGuardUiAccessConfig {
  accessToken:
    string;

  principalId:
    string;

  displayName?:
    string;
}

export function getContextGuardUiAccessConfig():
  ContextGuardUiAccessConfig {
  loadLocalEnv();

  const displayName =
    process.env
      .CONTEXTGUARD_UI_DISPLAY_NAME
      ?.trim();

  return {
    accessToken:
      process.env
        .CONTEXTGUARD_UI_ACCESS_TOKEN
        ?.trim() ?? "",

    principalId:
      process.env
        .CONTEXTGUARD_UI_PRINCIPAL_ID
        ?.trim() ?? "",

    ...(displayName
      ? {
          displayName
        }
      : {})
  };
}

export interface ContextGuardUiLocalSessionConfig {
  localSessionEnabled:
    boolean;

  principalId:
    string;

  displayName?:
    string;
}

export function getContextGuardUiLocalSessionConfig():
  ContextGuardUiLocalSessionConfig {
  loadLocalEnv();

  const enabled =
    (
      process.env
        .CONTEXTGUARD_UI_LOCAL_SESSION_ENABLED ??
      "true"
    )
      .trim()
      .toLowerCase();

  const displayName =
    process.env
      .CONTEXTGUARD_UI_LOCAL_DISPLAY_NAME
      ?.trim();

  return {
    localSessionEnabled:
      enabled === "true" ||
      enabled === "1" ||
      enabled === "yes",

    principalId:
      process.env
        .CONTEXTGUARD_UI_LOCAL_PRINCIPAL_ID
        ?.trim() ||
      "local-user",

    ...(displayName
      ? {
          displayName
        }
      : {
          displayName:
            "Local ContextGuard User"
        })
  };
}

export interface ContextGuardUiExecutionConfig {
  enabled:
    boolean;
}

export function getContextGuardUiExecutionConfig():
  ContextGuardUiExecutionConfig {
  loadLocalEnv();

  return {
    enabled:
      (
        process.env
          .CONTEXTGUARD_UI_REAL_EXECUTION_ENABLED ??
        ""
      )
        .trim()
        .toLowerCase() ===
      "true"
  };
}

export interface AgentDraftStoreConfig {
  ttlMinutes: number;
  filePath: string | undefined;
}

const AGENT_DRAFT_DEFAULT_TTL_MINUTES = 60;
const AGENT_DRAFT_MIN_TTL_MINUTES = 5;
const AGENT_DRAFT_MAX_TTL_MINUTES = 240;
const AGENT_DRAFT_DEFAULT_FILE =
  ".contextguard-data/agent-drafts.json";

export function parseAgentDraftStoreConfig(
  env: Record<string, string | undefined>
): AgentDraftStoreConfig {
  const rawTtl =
    (env.CONTEXTGUARD_AGENT_DRAFT_TTL_MINUTES ?? "").trim();
  const parsedTtl = /^\d{1,4}$/.test(rawTtl)
    ? Number(rawTtl)
    : AGENT_DRAFT_DEFAULT_TTL_MINUTES;
  const ttlMinutes = Math.min(
    AGENT_DRAFT_MAX_TTL_MINUTES,
    Math.max(AGENT_DRAFT_MIN_TTL_MINUTES, parsedTtl)
  );

  const rawFile =
    (env.CONTEXTGUARD_AGENT_DRAFT_FILE ?? "").trim();
  const filePath =
    rawFile.toLowerCase() === "memory"
      ? undefined
      : rawFile || AGENT_DRAFT_DEFAULT_FILE;

  return { ttlMinutes, filePath };
}

export function getAgentDraftStoreConfig(): AgentDraftStoreConfig {
  loadLocalEnv();
  return parseAgentDraftStoreConfig(process.env);
}

export function getGitHubAppConfig(): GitHubAppConfig | null {
  loadLocalEnv();
  return parseGitHubAppConfig(process.env);
}

export interface ContextGuardUiListenConfig {
  port: number;
  host: string;
  extraAllowedHosts: string | undefined;
}

export function getContextGuardUiListenConfig(): ContextGuardUiListenConfig {
  loadLocalEnv();
  const rawPort = (process.env.PORT ?? "").trim();
  const port = rawPort === "" ? 3000 : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const host = (process.env.CONTEXTGUARD_UI_HOST ?? "").trim() || "127.0.0.1";
  return {
    port,
    host,
    extraAllowedHosts: process.env.CONTEXTGUARD_ALLOWED_HOSTS
  };
}
