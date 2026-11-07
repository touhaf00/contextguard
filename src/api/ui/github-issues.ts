import type { GitHubAppUserAuth } from './github-app-auth.js';
import { GitHubAppAuthError } from './github-app-auth.js';
import type { ContextGuardUiSessionV2 } from './session.js';
import { requestTimeoutSignal } from '../../lib/outbound-timeout.js';

const GITHUB_API = 'https://api.github.com';
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_BODY = 16_000;

type IssuesAuth = Pick<GitHubAppUserAuth, 'requireRepository' | 'tokenFor'>;

type GitHubIssue = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  updated_at: string;
  created_at: string;
  comments: number;
  labels: string[];
  body: string;
  is_pull_request: boolean;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GitHubAppAuthError(502, 'GitHub returned an invalid issue.');
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 256): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function issue(value: unknown): GitHubIssue {
  const item = record(value);
  if (!Number.isSafeInteger(item.number) || Number(item.number) < 1 ||
      typeof item.title !== 'string' ||
      !['open', 'closed'].includes(String(item.state)) ||
      typeof item.html_url !== 'string' ||
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(issues|pull)\/\d+$/.test(item.html_url)) {
    throw new GitHubAppAuthError(502, 'GitHub returned an invalid issue record.');
  }
  return {
    number: Number(item.number),
    title: text(item.title),
    state: item.state as 'open' | 'closed',
    html_url: item.html_url,
    updated_at: text(item.updated_at, 64),
    created_at: text(item.created_at, 64),
    comments: Number.isSafeInteger(item.comments) && Number(item.comments) >= 0 ? Number(item.comments) : 0,
    labels: Array.isArray(item.labels) ? item.labels.slice(0, 50).map(label => text(record(label).name, 100)) : [],
    body: text(item.body, MAX_BODY),
    is_pull_request: Boolean(item.pull_request)
  };
}

export class GitHubIssuesExplorer {
  constructor(
    private readonly auth: IssuesAuth,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async get(session: ContextGuardUiSessionV2, repository: string, suffix: string): Promise<unknown> {
    if (!REPO.test(repository)) throw new GitHubAppAuthError(400, 'Invalid owner/repository.');
    const allowed = await this.auth.requireRepository(session, repository);
    const token = this.auth.tokenFor(session);
    const [owner, name] = allowed.full_name.split('/');
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues${suffix}`;
    let response: Response;
    try {
      response = await this.fetchImpl(`${GITHUB_API}${path}`, {
        method: 'GET',
        signal: requestTimeoutSignal(),
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2026-03-10',
          'user-agent': 'contextguard/1.0'
        }
      });
    } catch {
      throw new GitHubAppAuthError(502, 'GitHub issue read failed.');
    }
    if (!response.ok) throw new GitHubAppAuthError(502, `GitHub issue read returned HTTP ${response.status}.`);
    try {
      return await response.json();
    } catch {
      throw new GitHubAppAuthError(502, 'GitHub returned invalid JSON.');
    }
  }

  async list(session: ContextGuardUiSessionV2, repository: string, state: string = 'open') {
    if (!['open', 'closed', 'all'].includes(state)) throw new GitHubAppAuthError(400, 'Invalid issue state.');
    const raw = await this.get(session, repository,
      `?state=${state}&per_page=30&sort=updated&direction=desc`);
    if (!Array.isArray(raw)) throw new GitHubAppAuthError(502, 'GitHub returned an invalid issue list.');
    return {
      repository,
      state,
      read_only: true as const,
      issues: raw.slice(0, 30).map(issue).filter(x => !x.is_pull_request)
    };
  }

  async detail(session: ContextGuardUiSessionV2, repository: string, number: number) {
    if (!Number.isSafeInteger(number) || number < 1) throw new GitHubAppAuthError(400, 'Invalid issue number.');
    const raw = issue(await this.get(session, repository, `/${number}`));
    if (raw.is_pull_request) throw new GitHubAppAuthError(400, 'A pull request is not an issue in this workspace.');
    return { repository, read_only: true as const, issue: raw };
  }
}
