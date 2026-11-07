import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GitHubAppAuthError, GitHubAppUserAuth, parseGitHubAppConfig
} from '../dist/api/ui/github-app-auth.js';
import { ContextGuardUiSessionManagerV2 } from '../dist/api/ui/session.js';
import { ContextGuardUiAccessGateV2 } from '../dist/api/ui/access.js';
import { GitHubAppUserWorkflow } from '../dist/api/ui/github-app-workflow.js';

const CONFIG = { clientId: 'Iv1.demo', clientSecret: 'test-only-secret', callbackUrl: 'http://localhost:3004/api/ui/github/callback' };
const sent = [];
let now = 1_000_000;
function sessions() {
  return new ContextGuardUiSessionManagerV2({ localSessionEnabled: false, principalId: 'local-user', now: () => new Date(now) });
}
function api(url, options) {
  sent.push({ url, options });
  const pathname = new URL(url).pathname;
  if (url.includes('login/oauth/access_token')) {
    return Response.json({ access_token: options.body.includes('code=alice') ? 'alice-token' : 'bob-token', token_type: 'bearer', expires_in: 3600 });
  }
  const alice = options.headers.authorization === 'Bearer alice-token';
  if (pathname === '/user') return Response.json({ id: alice ? 1 : 2, login: alice ? 'alice' : 'bob' });
  if (pathname === '/user/installations') return Response.json({ installations: [ { id: alice ? 100 : 200, permissions: { issues: 'write' } } ] });
  if (pathname.match(/^\/user\/installations\/\d+\/repositories$/)) {
    const id = Number(pathname.split('/')[3]);
    return Response.json({ repositories: [ { full_name: id === 100 ? 'alice/app' : 'bob/backend', private: true, default_branch: 'main' } ] });
  }
  throw new Error('Unexpected endpoint: ' + url);
}
function create() {
  sent.length = 0; now = 1_000_000;
  const manager = sessions();
  const auth = new GitHubAppUserAuth(CONFIG, manager, { now: () => now, fetchImpl: api });
  return { auth, manager };
}
function callback(auth, code = 'alice') {
  const start = auth.begin();
  const url = new URL(start.location);
  return { start, url, code, cookie: start.cookie.split(';')[0] };
}
function completion(auth, c) { return auth.complete(c.code, c.url.searchParams.get('state'), c.cookie); }

test('GitHub App: disabled when no GitHub App env is provided', () => assert.equal(parseGitHubAppConfig({}), null));
test('GitHub App: rejects partial OAuth configuration', () => {
  assert.throws(() => parseGitHubAppConfig({ CONTEXTGUARD_GITHUB_APP_CLIENT_ID: 'abc' }));
});
test('GitHub App: only accepts an exact secure or localhost callback', () => {
  for (const callbackUrl of ['http://evil.test/api/ui/github/callback', 'https://example.com/oauth', 'https://example.com/api/ui/github/callback?x=1']) {
    assert.throws(() => parseGitHubAppConfig({
      CONTEXTGUARD_GITHUB_APP_CLIENT_ID: 'abc',
      CONTEXTGUARD_GITHUB_APP_CLIENT_SECRET: 'secret',
      CONTEXTGUARD_GITHUB_APP_CALLBACK_URL: callbackUrl
    }));
  }
});
test('GitHub App: starts OAuth with random state, correct callback and PKCE S256', () => {
  const { auth } = create();
  const a = callback(auth), b = callback(auth);
  assert.notEqual(a.url.searchParams.get('state'), b.url.searchParams.get('state'));
  assert.equal(a.url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(a.url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.url.searchParams.get('redirect_uri'), CONFIG.callbackUrl);
  assert.match(a.start.cookie, /HttpOnly; SameSite=Lax/);
  assert.ok(!a.start.location.includes('test-only-secret'));
});
test('GitHub App: refuses mismatched callback state before any token request', async () => {
  const { auth } = create();
  const c = callback(auth);
  await assert.rejects(auth.complete(c.code, c.url.searchParams.get('state'), 'cg_github_oauth_state=wrong'), e => e instanceof GitHubAppAuthError && e.status === 401);
  assert.equal(sent.length, 0);
});
test('GitHub App: exchanges state exactly once and never exposes the token in the session', async () => {
  const { auth } = create(); const c = callback(auth);
  const session = await completion(auth, c);
  assert.equal(session.principal.principal_id, 'github:1');
  assert.equal(session.principal.authentication_method, 'github_app_oauth');
  assert.ok(!JSON.stringify(session).includes('alice-token'));
  assert.equal(auth.tokenFor(session), 'alice-token');
  assert.ok(sent[0].options.body.includes('code_verifier='));
  await assert.rejects(completion(auth, c), e => e.status === 401);
  assert.equal(sent.filter(x => x.url.includes('access_token')).length, 1);
});
test('GitHub App: per-user GitHub tokens and allowed repositories never cross', async () => {
  const { auth } = create();
  const alice = await completion(auth, callback(auth, 'alice'));
  const bob = await completion(auth, callback(auth, 'bob'));
  const a = await auth.repositories(alice);
  const b = await auth.repositories(bob);
  assert.equal(a[0].full_name, 'alice/app');
  assert.equal(b[0].full_name, 'bob/backend');
  assert.ok(sent.some(r => r.options?.headers?.authorization === 'Bearer alice-token'));
  assert.ok(sent.some(r => r.options?.headers?.authorization === 'Bearer bob-token'));
  await assert.rejects(auth.requireRepository(alice, 'bob/backend'), e => e.status === 403);
  await assert.rejects(auth.requireRepository(bob, 'alice/app'), e => e.status === 403);
});
test('GitHub App: rejects a disconnected user and an expired OAuth token', async () => {
  const { auth } = create();
  const session = await completion(auth, callback(auth));
  now += 3_700_000;
  assert.throws(() => auth.tokenFor(session), e => e.status === 401);
  const second = await completion(auth, callback(auth));
  auth.disconnect(second.session_id);
  assert.throws(() => auth.tokenFor(second), e => e.status === 401);
});
test('GitHub App: never gives the legacy local UI session GitHub write rights', async () => {
  const { auth, manager } = create();
  const legacy = manager.createAuthenticatedSession({ principal_type: 'HUMAN', principal_id: 'operator', authentication_method: 'bearer_token' });
  await assert.rejects(auth.requireRepository(legacy, 'alice/app'), e => e.status === 401);
});
test('GitHub App: refuses an unowned authorization session without Cominty calls', async () => {
  const { auth, manager } = create();
  const alice = await completion(auth, callback(auth));
  const gate = new ContextGuardUiAccessGateV2({ accessToken: '', principalId: '' }, manager);
  const workflow = new GitHubAppUserWorkflow(auth, gate, true);
  await assert.rejects(workflow.approve(alice, { session_id: 'other-users-session' }), e => e.status === 404);
  await assert.rejects(workflow.execute(alice, { receipt_id: 'other-users-receipt', receipt_digest: 'a'.repeat(64), confirmation: 'EXECUTE' }), e => e.status === 404);
  await assert.rejects(workflow.investigate(alice, { repository: 'bob/backend', branch: 'main', objective: 'Investigate the CI/CD and propose an improvement.' }), e => e.status === 403);
});
test('GitHub App: disallows execution while kill switch is off', async () => {
  const { auth, manager } = create();
  const alice = await completion(auth, callback(auth));
  const gate = new ContextGuardUiAccessGateV2({ accessToken: '', principalId: '' }, manager);
  const workflow = new GitHubAppUserWorkflow(auth, gate, false);
  await assert.rejects(workflow.execute(alice, { receipt_id: 'r', receipt_digest: 'abc', confirmation: 'EXECUTE' }), e => e.status === 403);
});

test('GitHub App: Cominty shared budget limits repeated costly submissions before any agent calls', async () => {
  const { GitHubAppComintyBudget } = await import('../dist/api/ui/github-app-budget.js');
  let current = 100_000;
  const budget = new GitHubAppComintyBudget(5, 6, () => current);
  budget.reserve('github:1', 1);
  budget.reserve('github:1', 3);
  assert.throws(() => budget.reserve('github:1', 3), e => e.status === 429);
  budget.reserve('github:2', 2);
  assert.throws(() => budget.reserve('github:3', 1), e => e.status === 429);
  current += 86_400_100;
  budget.reserve('github:1', 3);
});
