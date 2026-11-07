import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ContextGuardUiSessionManagerV2 } from './session.js';
import type { ContextGuardUiSessionV2 } from './session.js';
import { requestTimeoutSignal } from '../../lib/outbound-timeout.js';

export class GitHubAppAuthError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface GitHubAppConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  slug?: string;
}

export function parseGitHubAppConfig(env: Record<string, string | undefined>): GitHubAppConfig | null {
  const clientId = (env.CONTEXTGUARD_GITHUB_APP_CLIENT_ID ?? '').trim();
  const clientSecret = (env.CONTEXTGUARD_GITHUB_APP_CLIENT_SECRET ?? '').trim();
  const callbackUrl = (env.CONTEXTGUARD_GITHUB_APP_CALLBACK_URL ?? '').trim();
  if (![clientId, clientSecret, callbackUrl].some(Boolean)) return null;
  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error('GitHub App sign-in requires CLIENT_ID, CLIENT_SECRET and CALLBACK_URL together.');
  }
  const url = new URL(callbackUrl);
  if (url.pathname !== '/api/ui/github/callback' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) {
    throw new Error('GitHub App callback must be HTTPS (or local loopback HTTP) at /api/ui/github/callback.');
  }
  const slug = (env.CONTEXTGUARD_GITHUB_APP_SLUG ?? '').trim();
  if (slug && !/^[a-z0-9][a-z0-9-]{1,99}$/i.test(slug)) {
    throw new Error('GitHub App slug must be a valid GitHub App slug.');
  }
  return { clientId, clientSecret, callbackUrl, ...(slug ? { slug } : {}) };
}

const STATE_COOKIE = 'cg_github_oauth_state';
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_PENDING = 100;
const STATE_TTL_MS = 10 * 60_000;

type Pending = { verifier: string; createdAt: number };
type Identity = { githubId: number; login: string; accessToken: string; expiresAt: number };
export type RepositoryChoice = { full_name: string; private: boolean; installation_id: number; default_branch: string; can_create_pr: boolean };

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function oauthStateFromCookies(header: string | undefined): string {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at >= 0 && part.slice(0, at).trim() === STATE_COOKIE) {
      return part.slice(at + 1).trim();
    }
  }
  return '';
}
function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GitHubAppAuthError(502, 'GitHub returned an invalid response.');
  }
  return value as Record<string, unknown>;
}

export class GitHubAppUserAuth {
  private readonly pending = new Map<string, Pending>();
  private readonly users = new Map<string, Identity>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly config: GitHubAppConfig,
    private readonly uiSessions: ContextGuardUiSessionManagerV2,
    options: { fetchImpl?: typeof fetch; now?: () => number } = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  begin(): { location: string; cookie: string } {
    const now = this.now();
    for (const [key, value] of this.pending) if (now - value.createdAt > STATE_TTL_MS) this.pending.delete(key);
    if (this.pending.size >= MAX_PENDING) throw new GitHubAppAuthError(429, 'Too many pending GitHub connections.');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    this.pending.set(state, { verifier, createdAt: now });
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.callbackUrl);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return {
      location: url.toString(),
      cookie: `${STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/api/ui/github/callback; Max-Age=600${this.secureSuffix()}`
    };
  }

  clearStateCookie(): string {
    return `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/ui/github/callback; Max-Age=0${this.secureSuffix()}`;
  }

  secureSuffix(): string { return new URL(this.config.callbackUrl).protocol === 'https:' ? '; Secure' : ''; }

  async complete(code: string, state: string, cookieHeader: string | undefined): Promise<ContextGuardUiSessionV2> {
    if (!code || code.length > 2048 || !state || !safeEqual(state, oauthStateFromCookies(cookieHeader))) {
      throw new GitHubAppAuthError(401, 'GitHub connection state is invalid.');
    }
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || this.now() - pending.createdAt > STATE_TTL_MS) {
      throw new GitHubAppAuthError(401, 'GitHub connection expired or was already used.');
    }
    let response: Response;
    try {
      response = await this.fetchImpl('https://github.com/login/oauth/access_token', {
        method: 'POST',
        signal: requestTimeoutSignal(),
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          redirect_uri: this.config.callbackUrl,
          code_verifier: pending.verifier
        }).toString()
      });
    } catch {
      throw new GitHubAppAuthError(502, 'GitHub authorization could not be completed.');
    }
    if (!response.ok) throw new GitHubAppAuthError(502, 'GitHub authorization could not be completed.');
    let tokenJson: unknown;
    try {
      tokenJson = await response.json();
    } catch {
      throw new GitHubAppAuthError(502, 'GitHub authorization could not be completed.');
    }
    const tokenData = asRecord(tokenJson);
    if (typeof tokenData.access_token !== 'string' || !tokenData.access_token || tokenData.token_type !== 'bearer') {
      throw new GitHubAppAuthError(401, 'GitHub did not grant a user access token.');
    }
    const expiresIn = typeof tokenData.expires_in === 'number' && Number.isFinite(tokenData.expires_in)
      ? Math.max(60, Math.min(28_800, tokenData.expires_in)) : 28_800;
    const accessToken = tokenData.access_token;
    const account = asRecord(await this.api(accessToken, '/user'));
    if (!Number.isSafeInteger(account.id) || Number(account.id) <= 0 ||
        typeof account.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(account.login)) {
      throw new GitHubAppAuthError(502, 'GitHub identity could not be verified.');
    }
    const session = this.uiSessions.createAuthenticatedSession({
      principal_type: 'HUMAN',
      principal_id: `github:${account.id}`,
      display_name: account.login,
      authentication_method: 'github_app_oauth'
    });
    this.users.set(session.session_id, {
      githubId: Number(account.id), login: account.login, accessToken,
      expiresAt: this.now() + (expiresIn - 30) * 1000
    });
    return session;
  }

  tokenFor(session: ContextGuardUiSessionV2): string {
    if (session.principal.authentication_method !== 'github_app_oauth') {
      throw new GitHubAppAuthError(401, 'Connect your personal GitHub account first.');
    }
    const user = this.users.get(session.session_id);
    if (!user || user.expiresAt <= this.now() || session.principal.principal_id !== `github:${user.githubId}`) {
      this.users.delete(session.session_id);
      throw new GitHubAppAuthError(401, 'GitHub authorization has expired. Sign in again.');
    }
    return user.accessToken;
  }

  identityFor(session: ContextGuardUiSessionV2): { id: number; login: string } {
    this.tokenFor(session);
    const user = this.users.get(session.session_id)!;
    return { id: user.githubId, login: user.login };
  }

  disconnect(sessionId: string): void { this.users.delete(sessionId); }

  private async api(accessToken: string, path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`https://api.github.com${path}`, {
        method: 'GET', cache: 'no-store', signal: requestTimeoutSignal(),
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${accessToken}`,
          'x-github-api-version': '2022-11-28',
          'user-agent': 'ContextGuard', 'cache-control': 'no-store'
        }
      });
    } catch {
      throw new GitHubAppAuthError(502, 'GitHub could not be reached.');
    }
    if (!response.ok) {
      throw new GitHubAppAuthError(response.status === 401 ? 401 : 502, 'GitHub permissions or connection could not be verified.');
    }
    try {
      return await response.json();
    } catch {
      throw new GitHubAppAuthError(502, 'GitHub returned an invalid response.');
    }
  }

  async repositories(session: ContextGuardUiSessionV2): Promise<RepositoryChoice[]> {
    const token = this.tokenFor(session);
    const choices: RepositoryChoice[] = [];
    const ids = new Map<number, boolean>();
    for (let page = 1; page <= 10; page++) {
      const data = asRecord(await this.api(token, `/user/installations?per_page=100&page=${page}`));
      if (!Array.isArray(data.installations)) throw new GitHubAppAuthError(502, 'Invalid GitHub installations response.');
      for (const raw of data.installations) {
        const installation = asRecord(raw);
        if (!Number.isSafeInteger(installation.id) || !installation.id) continue;
        const permissions = asRecord(installation.permissions);
        if (permissions.issues !== 'write') continue;
        ids.set(Number(installation.id), permissions.contents === "write" && permissions.pull_requests === "write");
      }
      if (data.installations.length < 100) break;
      if (page === 10) throw new GitHubAppAuthError(503, 'Too many GitHub installations to list safely.');
    }
    for (const [id, canCreatePr] of ids) {
      for (let page = 1; page <= 10; page++) {
        const data = asRecord(await this.api(token, `/user/installations/${id}/repositories?per_page=100&page=${page}`));
        if (!Array.isArray(data.repositories)) throw new GitHubAppAuthError(502, 'Invalid GitHub repository listing.');
        for (const raw of data.repositories) {
          const r = asRecord(raw);
          if (typeof r.full_name !== 'string' || !REPOSITORY.test(r.full_name)) continue;
          choices.push({ full_name: r.full_name, private: r.private === true,
            installation_id: id, default_branch: typeof r.default_branch === 'string' ? r.default_branch : 'main',
            can_create_pr: canCreatePr });
        }
        if (data.repositories.length < 100) break;
        if (page === 10) throw new GitHubAppAuthError(503, 'Too many repositories to list safely.');
      }
    }
    return [...new Map(choices.map(r => [r.full_name.toLowerCase(), r])).values()]
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  async requireRepository(session: ContextGuardUiSessionV2, repository: string): Promise<RepositoryChoice> {
    if (!REPOSITORY.test(repository) || repository.includes('..')) {
      throw new GitHubAppAuthError(400, 'Invalid GitHub repository name.');
    }
    const list = await this.repositories(session);
    const match = list.find(r => r.full_name.toLowerCase() === repository.toLowerCase());
    if (!match) throw new GitHubAppAuthError(403, 'This account has not authorized ContextGuard for this repository and issue-writing permission.');
    return match;
  }
}
