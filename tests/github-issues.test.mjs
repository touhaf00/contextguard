import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GitHubIssuesExplorer } from '../dist/api/ui/github-issues.js';

const makeIssue = (number = 1, extra = {}) => ({
  number,
  title: 'Investigate failing Docker Hub login',
  state: 'open',
  html_url: `https://github.com/touhaf00/contextguard-demo/issues/${number}`,
  updated_at: '2026-11-05T16:18:42Z',
  created_at: '2026-11-05T16:18:42Z',
  comments: 0,
  labels: [{name:'ci'}],
  body: 'Real CI evidence',
  ...extra
});
const session = {session_id: 'user-a', principal:{principal_id:'user-a'}};
function setup({repos = ['touhaf00/contextguard-demo'], payload = [makeIssue()], status = 200} = {}) {
  const urls = [];
  const requests = [];
  let tokenCalls = 0;
  const auth = {
    async requireRepository(s, repo) {
      assert.equal(s, session);
      if (!repos.includes(repo)) { const e = new Error('Not authorized'); e.status = 403; throw e; }
      return { full_name: repo };
    },
    tokenFor(s) { assert.equal(s, session); tokenCalls++; return 'test-only-oauth-token'; }
  };
  const fetchImpl = async (url, opts) => {
    urls.push(url); requests.push(opts);
    return {ok: status === 200, status, async json(){ return payload; }};
  };
  return { explorer: new GitHubIssuesExplorer(auth, fetchImpl), urls, requests, getTokenCalls:()=>tokenCalls };
}

test('Issues explorer: lists authorized issues with only GET, no Cominty and no writes', async () => {
  const { explorer, urls, requests } = setup();
  const result = await explorer.list(session, 'touhaf00/contextguard-demo', 'open');
  assert.equal(result.read_only, true);
  assert.equal(result.issues[0].title, 'Investigate failing Docker Hub login');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'GET');
  assert.match(urls[0], /\/issues\?state=open&per_page=30/);
  assert.equal(requests[0].headers.authorization, 'Bearer test-only-oauth-token');
  assert.ok(!JSON.stringify(result).includes('oauth-token'));
});

test('Issues explorer: refuses another user’s uninstalled repository before reaching network or token', async () => {
  const { explorer, urls, getTokenCalls } = setup();
  await assert.rejects(explorer.list(session, 'someone/private'), /Not authorized/);
  assert.equal(urls.length, 0);
  assert.equal(getTokenCalls(), 0);
});

test('Issues explorer: rejects invalid repository and issue number before reaching network', async () => {
  const { explorer, urls } = setup();
  await assert.rejects(explorer.list(session, 'touhaf00/*'), /Invalid owner\/repository/);
  await assert.rejects(explorer.detail(session, 'touhaf00/contextguard-demo', 0), /Invalid issue number/);
  await assert.rejects(explorer.detail(session, 'touhaf00/contextguard-demo', 1.1), /Invalid issue number/);
  await assert.rejects(explorer.list(session, 'touhaf00/contextguard-demo', 'deleted'), /Invalid issue state/);
  assert.equal(urls.length, 0);
});

test('Issues explorer: excludes PRs from issue listing', async () => {
  const { explorer } = setup({payload:[makeIssue(), makeIssue(2, {
    html_url:'https://github.com/touhaf00/contextguard-demo/pull/2', pull_request: {url:'x'}
  })]});
  const result = await explorer.list(session, 'touhaf00/contextguard-demo');
  assert.equal(result.issues.length, 1);
});

test('Issues explorer: fetches one issue with GET and rejects PR details', async () => {
  const valid = setup({payload:makeIssue(1)});
  const detail = await valid.explorer.detail(session, 'touhaf00/contextguard-demo', 1);
  assert.equal(detail.issue.number, 1);
  assert.equal(valid.requests[0].method, 'GET');
  const pr = setup({payload:makeIssue(1, {pull_request: {url:'x'}})});
  await assert.rejects(pr.explorer.detail(session,'touhaf00/contextguard-demo',1), /pull request is not an issue/);
});

test('Issues explorer: fails closed on malformed provider responses', async () => {
  const wrong = setup({payload:[{number:1, title:'Bad', state:'open', html_url:'https://evil.test/one'}]});
  await assert.rejects(wrong.explorer.list(session,'touhaf00/contextguard-demo'), /invalid issue record/);
  const failed = setup({status:404});
  await assert.rejects(failed.explorer.list(session,'touhaf00/contextguard-demo'), /HTTP 404/);
});

test('Maintenance: UI connects issue management to original protected workflow; no direct issue mutation route', async () => {
  const html = await readFile('public/index.html', 'utf8');
  const js = await readFile('public/app.js', 'utf8');
  const server = await readFile('src/server.ts', 'utf8');
  assert.match(html, /COMINTY GITHUB ASSISTANT/);
  assert.match(html, /Verify &amp; authorize/);
  assert.match(js, /maintenanceRunProtectedAction/);
  assert.match(js, /await startWorkflow\(\)/);
  assert.match(js, /"\/api\/ui\/execute"/);
  assert.match(server, /\/api\/ui\/github\/maintenance\/investigate/);
  assert.doesNotMatch(server, /\/api\/ui\/github\/issues.*POST/);
});
