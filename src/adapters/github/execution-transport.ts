import { randomUUID } from 'node:crypto';
import { type MaintenanceAction, type MaintenanceLockedInput, type MaintenanceIssueState, normalizeIssue } from './issue-maintenance.js';
import { requestTimeoutSignal } from '../../lib/outbound-timeout.js';
import type {
  GitHubCreateIssueInputV2,
  GitHubCreateIssueResultV2,
  GitHubTrustedExecutionTransportV2
} from "./trusted-executor.js";

export type GitHubExecutionTransportErrorCodeV2 =
  | "INVALID_CONFIG"
  | "INVALID_REPOSITORY"
  | "REQUEST_FAILED"
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "INVALID_RESPONSE";

export class GitHubExecutionTransportErrorV2
  extends Error {
  constructor(
    public readonly code:
      GitHubExecutionTransportErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface GitHubRestExecutionTransportOptionsV2 {
  token:
    string;

  apiBaseUrl?:
    string;

  apiVersion?:
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
      new URL(
        raw
      );
  } catch {
    throw new GitHubExecutionTransportErrorV2(
      "INVALID_CONFIG",
      "GitHub execution API base URL is invalid."
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
    throw new GitHubExecutionTransportErrorV2(
      "INVALID_CONFIG",
      "GitHub execution API base URL must use HTTPS."
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
    throw new GitHubExecutionTransportErrorV2(
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

function validateResult(
  value:
    unknown
): GitHubCreateIssueResultV2 {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    throw new GitHubExecutionTransportErrorV2(
      "INVALID_RESPONSE",
      "GitHub returned an invalid create-issue response."
    );
  }

  const object =
    value as
      Record<string, unknown>;

  if (
    !Number.isInteger(
      object.number
    ) ||
    Number(
      object.number
    ) <= 0
  ) {
    throw new GitHubExecutionTransportErrorV2(
      "INVALID_RESPONSE",
      "GitHub create-issue response has an invalid issue number."
    );
  }

  if (
    typeof object.html_url !==
      "string" ||
    !object.html_url.startsWith(
      "https://github.com/"
    )
  ) {
    throw new GitHubExecutionTransportErrorV2(
      "INVALID_RESPONSE",
      "GitHub create-issue response has an invalid issue URL."
    );
  }

  return {
    issue_number:
      Number(
        object.number
      ),

    html_url:
      object.html_url
  };
}

export class GitHubRestExecutionTransportV2
  implements GitHubTrustedExecutionTransportV2 {
  #token:
    string;

  private readonly apiBaseUrl:
    string;

  private readonly apiVersion:
    string;

  private readonly userAgent:
    string;

  private readonly fetchImpl:
    typeof fetch;

  constructor(
    options:
      GitHubRestExecutionTransportOptionsV2
  ) {
    const token =
      options?.token
        ?.trim() ??
      "";

    if (!token) {
      throw new GitHubExecutionTransportErrorV2(
        "INVALID_CONFIG",
        "GitHub execution transport requires a server-side token."
      );
    }

    this.#token =
      token;

    this.apiBaseUrl =
      normalizeBaseUrl(
        options.apiBaseUrl
      );

    this.apiVersion =
      options.apiVersion
        ?.trim() ||
      "2026-03-10";

    this.userAgent =
      options.userAgent
        ?.trim() ||
      "contextguard/1.0";

    this.fetchImpl =
      options.fetchImpl ??
      fetch;
  }

  async getIssueState(repository: string, issueNumber: number): Promise<MaintenanceIssueState> {
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new GitHubExecutionTransportErrorV2('INVALID_REPOSITORY', 'Invalid issue number.');
    const path = repositoryPath(repository);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiBaseUrl}/repos/${path}/issues/${issueNumber}?_cg_fresh=${randomUUID()}`, {
        method: 'GET', cache: 'no-store', signal: requestTimeoutSignal(), headers: {
          accept: 'application/vnd.github+json', authorization: `Bearer ${this.#token}`,
          'x-github-api-version': this.apiVersion, 'user-agent': this.userAgent,
          'cache-control': 'no-cache, no-store, max-age=0', pragma: 'no-cache'
        }
      });
    } catch { throw new GitHubExecutionTransportErrorV2('REQUEST_FAILED', 'GitHub issue state unavailable.'); }
    if (res.status !== 200) throw new GitHubExecutionTransportErrorV2('HTTP_ERROR', `GitHub issue read returned HTTP ${res.status}.`);
    let payload: unknown;
    try { payload = await res.json(); } catch { throw new GitHubExecutionTransportErrorV2('INVALID_JSON', 'Invalid GitHub issue response.'); }
    try { return normalizeIssue(payload, repository); }
    catch { throw new GitHubExecutionTransportErrorV2('INVALID_RESPONSE', 'GitHub returned a mismatched or invalid issue.'); }
  }

  async findOpenIssuesWithTitle(repository: string, title: string): Promise<number[]> {
    const path = repositoryPath(repository);
    const wanted = title.trim().toLowerCase();
    const matches: number[] = [];
    for (let page = 1; page <= 20; page++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.apiBaseUrl}/repos/${path}/issues?state=open&per_page=100&page=${page}&_cg_fresh=${randomUUID()}`, {
          method: 'GET', cache: 'no-store', signal: requestTimeoutSignal(), headers: {
            accept: 'application/vnd.github+json', authorization: `Bearer ${this.#token}`,
            'x-github-api-version': this.apiVersion, 'user-agent': this.userAgent,
            'cache-control': 'no-cache, no-store, max-age=0', pragma: 'no-cache'
          }
        });
      } catch { throw new GitHubExecutionTransportErrorV2('REQUEST_FAILED', 'GitHub open issues unavailable.'); }
      if (res.status !== 200) throw new GitHubExecutionTransportErrorV2('HTTP_ERROR', `GitHub open issues read returned HTTP ${res.status}.`);
      let items: unknown;
      try { items = await res.json(); } catch { throw new GitHubExecutionTransportErrorV2('INVALID_JSON', 'Invalid GitHub issues response.'); }
      if (!Array.isArray(items)) throw new GitHubExecutionTransportErrorV2('INVALID_RESPONSE', 'Invalid GitHub issues response.');
      for (const item of items) {
        if (!item || typeof item !== 'object') throw new GitHubExecutionTransportErrorV2('INVALID_RESPONSE', 'Invalid GitHub issue metadata.');
        const issue = item as Record<string, unknown>;
        if (issue.pull_request) continue;
        if (typeof issue.title !== 'string' || !Number.isSafeInteger(issue.number)) {
          throw new GitHubExecutionTransportErrorV2('INVALID_RESPONSE', 'Invalid GitHub issue metadata.');
        }
        if (issue.title.trim().toLowerCase() === wanted) matches.push(issue.number as number);
      }
      if (items.length < 100) return matches;
    }
    throw new GitHubExecutionTransportErrorV2('INVALID_RESPONSE', 'GitHub open issues listing is incomplete.');
  }

  async executeMaintenance(repository: string, action: MaintenanceAction, input: MaintenanceLockedInput): Promise<GitHubCreateIssueResultV2> {
    const path = repositoryPath(repository);
    const urlBase = `${this.apiBaseUrl}/repos/${path}/issues/${input.issue_number}`;
    let method: 'POST' | 'PATCH';
    let url: string;
    let data: Record<string, unknown>;
    let expectedStatus: number;
    switch (action) {
      case 'comment_issue':
        method = 'POST'; url = `${urlBase}/comments`; data = { body: input.body }; expectedStatus = 201; break;
      case 'add_labels':
        method = 'POST'; url = `${urlBase}/labels`; data = { labels: input.labels }; expectedStatus = 200; break;
      case 'edit_issue':
        method = 'PATCH'; url = urlBase; data = { title: input.title, body: input.body }; expectedStatus = 200; break;
      case 'close_issue':
        method = 'PATCH'; url = urlBase; data = { state: 'closed' }; expectedStatus = 200; break;
      case 'reopen_issue':
        method = 'PATCH'; url = urlBase; data = { state: 'open' }; expectedStatus = 200; break;
      default: throw new GitHubExecutionTransportErrorV2('INVALID_CONFIG', 'Unsupported issue operation.');
    }
    let response: Response;
    try {
      response = await this.fetchImpl(url, { method, signal: requestTimeoutSignal(), headers: {
        accept: 'application/vnd.github+json', authorization: `Bearer ${this.#token}`,
        'content-type': 'application/json', 'x-github-api-version': this.apiVersion,
        'user-agent': this.userAgent
      }, body: JSON.stringify(data) });
    } catch { throw new GitHubExecutionTransportErrorV2('REQUEST_FAILED', 'GitHub write request failed; check the issue on GitHub before retrying.'); }
    if (response.status !== expectedStatus) {
      throw new GitHubExecutionTransportErrorV2('HTTP_ERROR', `GitHub ${action} request returned HTTP ${response.status}.`);
    }
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new GitHubExecutionTransportErrorV2('INVALID_JSON', 'Write response could not be verified; inspect GitHub before retrying.'); }
    if (action === 'add_labels' && (!Array.isArray(payload) || payload.some(x => !x || typeof x.name !== 'string'))) {
      throw new GitHubExecutionTransportErrorV2('INVALID_RESPONSE', 'GitHub returned an invalid label result.');
    }
    if (action !== 'add_labels' && (typeof payload !== 'object' || !payload || Array.isArray(payload))) {
      throw new GitHubExecutionTransportErrorV2('INVALID_RESPONSE', 'GitHub returned an invalid mutation result.');
    }
    const expectedUrl = `https://github.com/${repository}/issues/${input.issue_number}`;
    if (action !== 'add_labels') {
      const record = payload as Record<string, unknown>;
      if (action === 'comment_issue') {
        if (typeof record.html_url !== 'string' || !record.html_url.startsWith(`${expectedUrl}#issuecomment-`))
          throw new GitHubExecutionTransportErrorV2('INVALID_RESPONSE', 'Comment response does not belong to the authorized issue.');
      } else if (record.html_url !== expectedUrl || record.number !== input.issue_number) {
        throw new GitHubExecutionTransportErrorV2('INVALID_RESPONSE', 'Mutation response belongs to another issue.');
      }
    }
    return { issue_number: input.issue_number, html_url: expectedUrl };
  }

  async createIssue(
    repository:
      string,

    input:
      GitHubCreateIssueInputV2
  ): Promise<
    GitHubCreateIssueResultV2
  > {
    const path =
      repositoryPath(
        repository
      );

    const body = {
      title:
        input.title,

      body:
        input.body
    };

    let response:
      Response;

    try {
      response =
        await this.fetchImpl(
          `${this.apiBaseUrl}/repos/${path}/issues`,
          {
            method:
              "POST",

            signal:
              requestTimeoutSignal(),

            headers: {
              accept:
                "application/vnd.github+json",

              authorization:
                `Bearer ${this.#token}`,

              "content-type":
                "application/json",

              "x-github-api-version":
                this.apiVersion,

              "user-agent":
                this.userAgent
            },

            body:
              JSON.stringify(
                body
              )
          }
        );
    } catch (error) {
      throw new GitHubExecutionTransportErrorV2(
        "REQUEST_FAILED",
        error instanceof Error
          ? `GitHub create-issue request failed (${error.message}); check GitHub before retrying.`
          : "GitHub create-issue request failed; check GitHub before retrying."
      );
    }

    if (
      response.status !==
        201
    ) {
      throw new GitHubExecutionTransportErrorV2(
        "HTTP_ERROR",
        `GitHub create-issue request failed with HTTP ${response.status}.`
      );
    }

    let payload:
      unknown;

    try {
      payload =
        await response.json();
    } catch {
      throw new GitHubExecutionTransportErrorV2(
        "INVALID_JSON",
        "GitHub returned invalid JSON after issue creation."
      );
    }

    return validateResult(
      payload
    );
  }
}
