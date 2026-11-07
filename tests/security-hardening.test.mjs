import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { setTimeout as pause } from 'node:timers/promises';
import { createServer } from 'node:net';

import { allowedHostsFor, isForwardedRequest } from '../dist/api/ui/host-policy.js';
import { InvestigationBusyError, InvestigationLock } from '../dist/api/ui/investigation-lock.js';
import { OUTBOUND_LOG_TIMEOUT_MS, OUTBOUND_TIMEOUT_MS, requestTimeoutSignal } from '../dist/lib/outbound-timeout.js';
import { GitHubRestSnapshotClientV2 } from '../dist/adapters/github/rest-client.js';
import { GitHubRestExecutionTransportV2 } from '../dist/adapters/github/execution-transport.js';
import { CodeFixGitHubApi } from '../dist/api/ui/github-code-fix.js';
import { GitHubIssuesExplorer } from '../dist/api/ui/github-issues.js';
import { GitHubAppUserAuth } from '../dist/api/ui/github-app-auth.js';

test('Host policy: only loopback names, the GitHub App callback host and explicitly listed hosts are answered', () => {
  const hosts = allowedHostsFor(3000, 'https://contextguard.example.com/api/ui/github/callback', 'Tunnel.Example.com:8443, ');
  for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'contextguard.example.com', 'tunnel.example.com:8443']) {
    assert.ok(hosts.has(host), `${host} should be answered`);
  }
  for (const host of ['evil.test:3000', 'localhost:3001', '192.168.1.20:3000', 'localhost.evil.test:3000', '']) {
    assert.equal(hosts.has(host), false, `${host} should be refused`);
  }
  assert.throws(() => allowedHostsFor(3000, undefined, 'bad host!'), /invalid host/);
});

test('A request that passed a proxy or tunnel is recognised, even when it arrives from loopback', () => {
  assert.equal(isForwardedRequest({ host: 'localhost:3000' }), false);
  assert.equal(isForwardedRequest({ host: 'localhost:3000', 'x-forwarded-for': '203.0.113.7' }), true);
  assert.equal(isForwardedRequest({ 'cf-connecting-ip': '203.0.113.7' }), true);
});

test('An outbound request gets a bounded timeout, reported as a timeout abort rather than a hang', async () => {
  assert.ok(OUTBOUND_TIMEOUT_MS > 0);
  assert.ok(OUTBOUND_LOG_TIMEOUT_MS >= OUTBOUND_TIMEOUT_MS);
  const signal = requestTimeoutSignal(20);
  assert.ok(signal instanceof AbortSignal);
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  } finally {
    clearInterval(keepAlive);
  }
  assert.equal(signal.reason.name, 'TimeoutError');
  assert.throws(() => requestTimeoutSignal(0), /positive integer/);
});

test('Every GitHub and OAuth call site passes a timeout signal to fetch', async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url: String(url), signal: init.signal });
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const apiBaseUrl = 'https://api.github.com';
  await new GitHubRestSnapshotClientV2({ token: 'tok', apiBaseUrl, fetchImpl }).getRepository('owner/repo').catch(() => {});
  await new GitHubRestExecutionTransportV2({ token: 'tok', apiBaseUrl, fetchImpl }).getIssueState('owner/repo', 1).catch(() => {});
  await new GitHubRestExecutionTransportV2({ token: 'tok', apiBaseUrl, fetchImpl }).createIssue('owner/repo', { title: 'T', body: 'B' }).catch(() => {});
  const auth = { requireRepository: async () => ({ full_name: 'owner/repo' }), tokenFor: () => 'tok' };
  await new GitHubIssuesExplorer(auth, fetchImpl).list({}, 'owner/repo', 'open').catch(() => {});
  const oauth = new GitHubAppUserAuth(
    { clientId: 'Iv1.test', clientSecret: 'test-only', callbackUrl: 'http://localhost:3000/api/ui/github/callback' },
    {},
    { fetchImpl }
  );
  await oauth.api('tok', '/user').catch(() => {});
  await new CodeFixGitHubApi({ token: 'tok', apiBaseUrl, fetchImpl }).api('owner/repo', '/git/commits/abc').catch(() => {});
  assert.ok(seen.length >= 6, `expected at least six outbound calls, saw ${seen.length}`);
  for (const call of seen) {
    assert.ok(call.signal instanceof AbortSignal, `no timeout signal on ${call.url}`);
  }
});

test('Investigations: one per session, at most two across the server, and the slot is released after a failure', async () => {
  const lock = new InvestigationLock(2);
  let release;
  const first = lock.run('session-a', () => new Promise(resolve => { release = resolve; }));
  await assert.rejects(lock.run('session-a', async () => 'again'), InvestigationBusyError);
  const second = lock.run('session-b', async () => 'b');
  await assert.rejects(lock.run('session-c', async () => 'c'), /busy with other investigations/);
  assert.equal(await second, 'b');
  release('a');
  assert.equal(await first, 'a');
  await assert.rejects(lock.run('session-a', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(lock.inFlight, 0);
  assert.equal(await lock.run('session-a', async () => 'again'), 'again');
});

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CONTEXTGUARD_UI_LOCAL_SESSION_ENABLED: 'true',
      CONTEXTGUARD_GITHUB_APP_CLIENT_ID: ' ',
      CONTEXTGUARD_GITHUB_APP_CLIENT_SECRET: ' ',
      CONTEXTGUARD_GITHUB_APP_CALLBACK_URL: ' ',
      CONTEXTGUARD_UI_HOST: '127.0.0.1',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) break;
    if (output.includes('ContextGuard UI:')) {
      await pause(100);
      return { child, output: () => output };
    }
    await pause(50);
  }
  child.kill();
  throw new Error(`server did not start: ${output}`);
}

function rawRequest(port, path, { method = 'GET', host = `127.0.0.1:${port}`, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, method, path, headers: { host, ...headers } },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8')
        }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('UI server: refuses foreign Hosts and Origins, sends hardening headers, and gives no local session behind a proxy', { timeout: 30000 }, async () => {
  const port = await freePort();
  const { child } = await startServer(port, { CONTEXTGUARD_ALLOWED_HOSTS: 'ui.example.test' });
  try {
    assert.equal((await rawRequest(port, '/api/ui/auth/mode', { host: `evil.test:${port}` })).status, 403);
    assert.equal((await rawRequest(port, '/api/ui/auth/mode', { host: 'random-tunnel.example.net' })).status, 403);
    assert.equal((await rawRequest(port, '/api/ui/auth/mode', { host: 'ui.example.test' })).status, 200);

    const page = await rawRequest(port, '/', { host: `localhost:${port}` });
    assert.equal(page.status, 200);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.equal(page.headers['x-frame-options'], 'SAMEORIGIN');
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'self'/);
    assert.equal(page.headers['referrer-policy'], 'no-referrer');

    const crossSite = await rawRequest(port, '/api/ui/session/local', {
      method: 'POST', host: `localhost:${port}`, headers: { origin: 'http://evil.test' }
    });
    assert.equal(crossSite.status, 403);
    const sameOrigin = await rawRequest(port, '/api/ui/session/local', {
      method: 'POST', host: `localhost:${port}`, headers: { origin: `http://localhost:${port}` }
    });
    assert.equal(sameOrigin.status, 200);

    const proxied = await rawRequest(port, '/api/ui/session/local', {
      method: 'POST', host: `localhost:${port}`, headers: { 'x-forwarded-for': '203.0.113.9' }
    });
    assert.equal(proxied.status, 403);

    const direct = await rawRequest(port, '/api/ui/session/local', { method: 'POST', host: `localhost:${port}` });
    assert.equal(direct.status, 200);
    assert.match(direct.headers['set-cookie'][0], /^contextguard_ui_session=/);

    assert.equal((await rawRequest(port, '/%E0%A4%A', { host: `localhost:${port}` })).status, 400);
    const badCookie = await rawRequest(port, '/api/ui/session', {
      host: `localhost:${port}`, headers: { cookie: 'contextguard_ui_session=%E0%A4%A' }
    });
    assert.equal(badCookie.status, 401);
  } finally {
    child.kill();
  }
});

test('UI server: listens on loopback, and announces any wider bind', { timeout: 30000 }, async () => {
  const loopbackPort = await freePort();
  const loopback = await startServer(loopbackPort);
  try {
    assert.match(loopback.output(), new RegExp(`ContextGuard UI: http://localhost:${loopbackPort}`));
    assert.doesNotMatch(loopback.output(), /WARNING: listening/);
  } finally {
    loopback.child.kill();
  }

  const widePort = await freePort();
  const wide = await startServer(widePort, { CONTEXTGUARD_UI_HOST: '0.0.0.0' });
  try {
    await pause(100);
    assert.match(wide.output(), /WARNING: listening on 0\.0\.0\.0/);
  } finally {
    wide.child.kill();
  }
});
