import { randomUUID } from "node:crypto";

import type {
  GitHubSnapshotClientV2
} from "./snapshot-resolver.js";

import {
  OUTBOUND_LOG_TIMEOUT_MS,
  requestTimeoutSignal
} from "../../lib/outbound-timeout.js";

export type GitHubRestClientErrorCodeV2 =
  | "INVALID_CONFIG"
  | "INVALID_REPOSITORY"
  | "REQUEST_FAILED"
  | "HTTP_ERROR"
  | "INVALID_JSON";

export class GitHubRestClientErrorV2
  extends Error {
  constructor(
    public readonly code:
      GitHubRestClientErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface GitHubRestSnapshotClientOptionsV2 {
  token?:
    string;

  apiBaseUrl?:
    string;

  userAgent?:
    string;

  fetchImpl?:
    typeof fetch;
}

const REPOSITORY =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function normalizeBaseUrl(
  value:
    string | undefined
): string {
  const raw =
    value?.trim() ||
    "https://api.github.com";

  let url:
    URL;

  try {
    url =
      new URL(raw);
  } catch {
    throw new GitHubRestClientErrorV2(
      "INVALID_CONFIG",
      "GitHub API base URL is invalid."
    );
  }

  const local =
    url.hostname ===
      "localhost" ||
    url.hostname ===
      "127.0.0.1";

  if (
    url.protocol !==
      "https:" &&
    !local
  ) {
    throw new GitHubRestClientErrorV2(
      "INVALID_CONFIG",
      "GitHub API base URL must use HTTPS."
    );
  }

  url.search =
    "";

  url.hash =
    "";

  url.pathname =
    url.pathname.replace(
      /\/+$/,
      ""
    );

  return url
    .toString()
    .replace(
      /\/$/,
      ""
    );
}

function repositoryPath(
  repository:
    string
): string {
  const normalized =
    repository.trim();

  if (
    !REPOSITORY.test(
      normalized
    )
  ) {
    throw new GitHubRestClientErrorV2(
      "INVALID_REPOSITORY",
      "GitHub repository must use owner/repository format."
    );
  }

  const [
    owner,
    name
  ] =
    normalized.split(
      "/"
    );

  return (
    `${encodeURIComponent(owner)}/` +
    encodeURIComponent(name)
  );
}

const LOG_REDIRECT_HOST_SUFFIXES = [
  ".githubusercontent.com",
  ".blob.core.windows.net"
];
const LOG_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
export const GITHUB_JOB_LOG_MAX_BYTES = 4 * 1024 * 1024;

export function resolveAllowedLogRedirect(
  location: string | null,
  requestUrl: string
): string | undefined {
  if (!location) return undefined;
  let target: URL;
  try {
    target = new URL(location, requestUrl);
  } catch {
    return undefined;
  }
  const host = target.hostname.toLowerCase();
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    (target.port && target.port !== "443") ||
    !LOG_REDIRECT_HOST_SUFFIXES.some(suffix => host.endsWith(suffix))
  ) {
    return undefined;
  }
  return target.toString();
}

async function readBoundedText(
  response: Response,
  maxBytes: number
): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const full = await response.text();
    return full.length > maxBytes
      ? { text: full.slice(0, maxBytes), truncated: true }
      : { text: full, truncated: false };
  }
  const decoder = new TextDecoder("utf-8");
  let received = 0;
  let text = "";
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - received;
    if (value.byteLength > remaining) {
      text += decoder.decode(value.subarray(0, remaining), { stream: true });
      truncated = true;
      await reader.cancel();
      break;
    }
    text += decoder.decode(value, { stream: true });
    received += value.byteLength;
  }
  text += decoder.decode();
  return { text, truncated };
}

export class GitHubRestSnapshotClientV2
  implements GitHubSnapshotClientV2 {
  #token:
    string;

  private readonly apiBaseUrl:
    string;

  private readonly userAgent:
    string;

  private readonly fetchImpl:
    typeof fetch;

  constructor(
    options:
      GitHubRestSnapshotClientOptionsV2 = {}
  ) {
    this.#token =
      options.token
        ?.trim() ??
      "";

    this.apiBaseUrl =
      normalizeBaseUrl(
        options.apiBaseUrl
      );

    this.userAgent =
      options.userAgent
        ?.trim() ||
      "contextguard/1.0";

    this.fetchImpl =
      options.fetchImpl ??
      fetch;
  }

  private async request(
    path:
      string,
    mutable = false
  ): Promise<unknown> {
    const headers:
      Record<string, string> = {
      accept:
        "application/vnd.github+json",

      "x-github-api-version":
        "2022-11-28",

      "user-agent":
        this.userAgent,

      "cache-control":
        "no-cache, no-store, max-age=0",

      pragma:
        "no-cache"
    };

    if (
      this.#token
    ) {
      headers.authorization =
        `Bearer ${this.#token}`;
    }

    let response:
      Response;

    try {
      const url = new URL(`${this.apiBaseUrl}${path}`);
      if (mutable) {
        url.searchParams.set("_cg_fresh", randomUUID());
      }

      response =
        await this.fetchImpl(
          url.toString(),
          {
            method:
              "GET",

            cache:
              "no-store",

            signal:
              requestTimeoutSignal(),

            headers
          }
        );
    } catch (error) {
      throw new GitHubRestClientErrorV2(
        "REQUEST_FAILED",
        error instanceof Error
          ? `GitHub request failed: ${error.message}`
          : "GitHub request failed."
      );
    }

    if (
      !response.ok
    ) {
      throw new GitHubRestClientErrorV2(
        "HTTP_ERROR",
        `GitHub request failed with HTTP ${response.status}.`
      );
    }

    try {
      return await response.json();
    } catch {
      throw new GitHubRestClientErrorV2(
        "INVALID_JSON",
        "GitHub returned an invalid JSON response."
      );
    }
  }

  async getRepository(
    repository:
      string
  ): Promise<unknown> {
    return this.request(
      `/repos/${repositoryPath(repository)}`,
      true
    );
  }

  async getCommit(
    repository:
      string,

    reference:
      string
  ): Promise<unknown> {
    return this.request(
      `/repos/${repositoryPath(repository)}` +
      `/commits/${encodeURIComponent(reference)}`,
      !/^[0-9a-f]{40}$/i.test(reference)
    );
  }

  async getRef(
    repository:
      string,

    namespace:
      "heads" |
      "tags",

    reference:
      string
  ): Promise<unknown> {
    const ref =
      `${namespace}/${reference}`;

    return this.request(
      `/repos/${repositoryPath(repository)}` +
      `/git/ref/${encodeURIComponent(ref)}`,
      true
    );
  }


  async getBranch(
    repository: string,
    reference: string
  ): Promise<unknown> {
    return this.request(
      `/repos/${repositoryPath(repository)}` +
      `/branches/${encodeURIComponent(reference)}`,
      true
    );
  }


  async getIssue(repository: string, issueNumber: number): Promise<unknown> {
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
      throw new GitHubRestClientErrorV2('INVALID_REPOSITORY', 'Invalid issue number.');
    }
    return this.request(`/repos/${repositoryPath(repository)}/issues/${issueNumber}`, true);
  }

  async getOpenIssues(
    repository: string,
    page: number
  ): Promise<unknown> {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 20
    ) {
      throw new GitHubRestClientErrorV2(
        "INVALID_CONFIG",
        "Invalid issues page."
      );
    }

    return this.request(
      `/repos/${repositoryPath(repository)}` +
      `/issues?state=open&per_page=100&page=${page}`,
      true
    );
  }

  async getWorkflowRuns(repository: string, branch: string): Promise<unknown> {
    if (!branch || branch.length > 180) {
      throw new GitHubRestClientErrorV2("INVALID_CONFIG", "Invalid branch name.");
    }
    return this.request(
      `/repos/${repositoryPath(repository)}` +
      `/actions/runs?branch=${encodeURIComponent(branch)}&per_page=8`,
      true
    );
  }

  async getWorkflowRun(repository: string, runId: number): Promise<unknown> {
    if (!Number.isSafeInteger(runId) || runId < 1) {
      throw new GitHubRestClientErrorV2('INVALID_CONFIG', 'Invalid GitHub workflow run ID.');
    }
    return this.request(
      `/repos/${repositoryPath(repository)}/actions/runs/${runId}`,
      true
    );
  }

  async getWorkflowRunJobs(repository: string, runId: number): Promise<unknown> {
    if (!Number.isSafeInteger(runId) || runId < 1) {
      throw new GitHubRestClientErrorV2('INVALID_CONFIG', 'Invalid GitHub workflow run ID.');
    }
    return this.request(
      `/repos/${repositoryPath(repository)}/actions/runs/${runId}/jobs?per_page=100`,
      true
    );
  }

  async getWorkflowJobLog(
    repository: string,
    jobId: number,
    maxBytes = GITHUB_JOB_LOG_MAX_BYTES
  ): Promise<{ text: string; truncated: boolean }> {
    if (!Number.isSafeInteger(jobId) || jobId < 1) {
      throw new GitHubRestClientErrorV2("INVALID_CONFIG", "Invalid GitHub workflow job ID.");
    }
    const apiUrl = new URL(
      `${this.apiBaseUrl}/repos/${repositoryPath(repository)}/actions/jobs/${jobId}/logs`
    ).toString();
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": this.userAgent
    };
    if (this.#token) headers.authorization = `Bearer ${this.#token}`;

    let response: Response;
    try {
      response = await this.fetchImpl(apiUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "manual",
        signal: requestTimeoutSignal(OUTBOUND_LOG_TIMEOUT_MS),
        headers
      });
      if (LOG_REDIRECT_STATUSES.has(response.status)) {
        const target = resolveAllowedLogRedirect(response.headers.get("location"), apiUrl);
        if (!target) {
          throw new GitHubRestClientErrorV2("HTTP_ERROR", "GitHub log redirect refused.");
        }
        response = await this.fetchImpl(target, {
          method: "GET",
          cache: "no-store",
          redirect: "error",
          signal: requestTimeoutSignal(OUTBOUND_LOG_TIMEOUT_MS),
          headers: { accept: "text/plain", "user-agent": this.userAgent }
        });
      }
    } catch (error) {
      if (error instanceof GitHubRestClientErrorV2) throw error;
      throw new GitHubRestClientErrorV2(
        "REQUEST_FAILED",
        error instanceof Error
          ? `GitHub log request failed: ${error.message}`
          : "GitHub log request failed."
      );
    }
    if (!response.ok) {
      throw new GitHubRestClientErrorV2(
        "HTTP_ERROR",
        `GitHub log request failed with HTTP ${response.status}.`
      );
    }
    return readBoundedText(response, maxBytes);
  }

  async getFileAtCommit(
    repository: string,
    path: string,
    sha: string
  ): Promise<unknown> {
    if (!/^[a-f0-9]{40}$/i.test(sha) ||
        !/^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(path) ||
        path.includes("..")) {
      throw new GitHubRestClientErrorV2("INVALID_CONFIG", "Invalid fixed-SHA source path.");
    }
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return this.request(
      `/repos/${repositoryPath(repository)}/contents/${encoded}?ref=${sha}`
    );
  }

  async getTreeAtCommit(repository: string, sha: string): Promise<unknown> {
    if (!/^[a-f0-9]{40}$/i.test(sha)) {
      throw new GitHubRestClientErrorV2("INVALID_CONFIG", "Invalid fixed-SHA tree reference.");
    }
    const commit = await this.request(`/repos/${repositoryPath(repository)}/git/commits/${sha}`);
    const value = commit && typeof commit === "object" ? commit as { sha?: unknown; tree?: { sha?: unknown } } : null;
    const treeSha = value?.tree?.sha;
    if (!value || String(value.sha).toLowerCase() !== sha.toLowerCase() ||
        typeof treeSha !== "string" || !/^[a-f0-9]{40}$/i.test(treeSha)) {
      throw new GitHubRestClientErrorV2("INVALID_JSON", "GitHub commit has no verifiable tree.");
    }
    return this.request(`/repos/${repositoryPath(repository)}/git/trees/${treeSha}?recursive=1`);
  }

  async getGitTag(
    repository:
      string,

    tagSha:
      string
  ): Promise<unknown> {
    return this.request(
      `/repos/${repositoryPath(repository)}` +
      `/git/tags/${encodeURIComponent(tagSha)}`
    );
  }
}
