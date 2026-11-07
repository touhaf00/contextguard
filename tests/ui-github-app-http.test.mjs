import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { createServer } from 'node:net';

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

test('GitHub App: HTTP login uses GitHub OAuth only and cannot inherit legacy personal-token writes', { timeout: 12000 }, async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CONTEXTGUARD_GITHUB_APP_CLIENT_ID: 'Iv1.test',
      CONTEXTGUARD_GITHUB_APP_CLIENT_SECRET: 'test-only-secret',
      CONTEXTGUARD_GITHUB_APP_CALLBACK_URL: `http://localhost:${port}/api/ui/github/callback`,
      CONTEXTGUARD_UI_LOCAL_SESSION_ENABLED: 'false',
      CONTEXTGUARD_UI_REAL_EXECUTION_ENABLED: 'true',
      GITHUB_EXECUTION_TOKEN: '',
      GITHUB_EXECUTION_ALLOWED_REPOSITORIES: 'myuser/*'
    },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  async function get(path, options = {}) {
    return fetch(`${base}${path}`, { redirect: 'manual', ...options });
  }
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      if (child.exitCode !== null) break;
      try { const r = await get('/api/ui/auth/mode'); if (r.status === 200) { ready = true; break; } } catch {}
      await pause(100);
    }
    assert.ok(ready, 'server should boot with no personal write token');
    const mode = await (await get('/api/ui/auth/mode')).json();
    assert.equal(mode.github_app_enabled, true);
    const connect = await get('/api/ui/github/connect');
    assert.equal(connect.status, 302);
    assert.equal(new URL(connect.headers.get('location')).hostname, 'github.com');
    assert.match(connect.headers.get('set-cookie'), /HttpOnly/);
    assert.equal((await get('/api/ui/session')).status, 401);
    assert.equal((await get('/api/ui/github/repositories')).status, 401);
    const login = await get('/api/ui/session/login', {
      method: 'POST', headers: { origin: `http://localhost:${port}`, 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'legacy-admin-key' })
    });
    assert.equal(login.status, 403);
    const malicious = await get('/api/ui/start', {
      method: 'POST', headers: { origin: 'https://attacker.test', 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(malicious.status, 403);
  } finally {
    child.kill('SIGTERM');
  }
});
