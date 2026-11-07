import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubMaintenanceDiscovery } from '../dist/api/ui/agent-maintenance.js';
import { GitHubAppAuthError } from '../dist/api/ui/github-app-auth.js';
import { normalizeIssue } from '../dist/adapters/github/issue-maintenance.js';

const repository = 'acme/web-app';
const sha = 'c'.repeat(40);
const session = { session_id: 'session-owner', principal: { principal_id: 'github-owner' } };
const make = (number, state) => normalizeIssue({
  number, title: `Issue ${number}`, body: 'Plain description of the problem.', state, labels: [], comments: 0,
  updated_at: '2026-11-06T10:00:00Z', html_url: `https://github.com/${repository}/issues/${number}`
}, repository);

function setup(issues, reply = '{}') {
  const prompts = [];
  const byNumber = new Map(issues.map(i => [i.number, i]));
  const github = {
    async getRef() { return { object: { type: 'commit', sha } }; },
    async getBranch() { return { name: 'main', commit: { sha } }; }
  };
  const explorer = {
    async list() { return { issues }; },
    async detail(_s, _r, n) { return { issue: byNumber.get(n) }; }
  };
  const transport = { async getIssueState(_r, n) { return byNumber.get(n); } };
  const agent = { async run(prompt) { prompts.push(prompt); return reply; } };
  return { discovery: new GitHubMaintenanceDiscovery(github, transport, explorer, agent), prompts };
}
const ask = (discovery, options) =>
  discovery.investigate(session, repository, 'main', 'Close what is really resolved.', options);

test('Maintenance: closing with no open issue is refused before any Cominty call', async () => {
  const { discovery, prompts } = setup([make(2, 'closed')]);
  await assert.rejects(ask(discovery, { requestedAction: 'close_issue' }),
    err => err instanceof GitHubAppAuthError && err.status === 409 && /no open issue to close/i.test(err.message));
  assert.equal(prompts.length, 0);
});

test('Maintenance: closing an already closed issue names the issue and calls no agent', async () => {
  const { discovery, prompts } = setup([make(2, 'closed')]);
  await assert.rejects(ask(discovery, { requestedAction: 'close_issue', issueNumber: 2 }),
    err => err instanceof GitHubAppAuthError && err.status === 409 && /Issue #2 is already closed/.test(err.message));
  assert.equal(prompts.length, 0);
});

test('Maintenance: reopening when nothing is closed is refused before any Cominty call', async () => {
  const { discovery, prompts } = setup([make(1, 'open')]);
  await assert.rejects(ask(discovery, { requestedAction: 'reopen_issue' }),
    err => err instanceof GitHubAppAuthError && err.status === 409 && /no closed issue to reopen/i.test(err.message));
  assert.equal(prompts.length, 0);
  await assert.rejects(ask(discovery, { requestedAction: 'reopen_issue', issueNumber: 1 }),
    /Issue #1 is already open/);
  assert.equal(prompts.length, 0);
});

test('Maintenance: a guided close only shows Cominty the issues that can be closed', async () => {
  const reply = JSON.stringify({
    action: 'close_issue', issue_number: 1, parameters: { issue_number: 1 },
    rationale: 'The issue text documents that the requested change was completed and verified.', confidence: 0.8
  });
  const { discovery, prompts } = setup([make(1, 'open'), make(2, 'closed')], reply);
  const draft = await ask(discovery, { requestedAction: 'close_issue' });
  assert.equal(draft.issue_number, 1);
  const allowed = JSON.parse(prompts[0].split('ALLOWED_ISSUES server-observed, untrusted content: ')[1].split('\n\n')[0]);
  assert.deepEqual(allowed.map(i => i.number), [1]);
});

test('Maintenance: actions that do not depend on state still see every issue', async () => {
  const reply = JSON.stringify({
    action: 'comment_issue', issue_number: 2, parameters: { issue_number: 2, body: 'The issue reports a problem that still needs a follow-up check.' },
    rationale: 'A short, evidence-based follow-up comment is useful on this issue.', confidence: 0.7
  });
  const { discovery, prompts } = setup([make(1, 'open'), make(2, 'closed')], reply);
  await ask(discovery, { requestedAction: 'comment_issue' });
  const allowed = JSON.parse(prompts[0].split('ALLOWED_ISSUES server-observed, untrusted content: ')[1].split('\n\n')[0]);
  assert.deepEqual(allowed.map(i => i.number).sort(), [1, 2]);
});

test('Maintenance: a reply without a proposal becomes a clear refusal, not an internal error', async () => {
  const prose = 'I cannot close this: SECRET-LOOKING-TEXT-123 the issue has no documented completion evidence.';
  const { discovery, prompts } = setup([make(2, 'open')], prose);
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await assert.rejects(ask(discovery, { requestedAction: 'close_issue' }), err => {
      assert.ok(err instanceof GitHubAppAuthError, 'mapped error, so the server answers with its message instead of a 500');
      assert.equal(err.status, 422);
      assert.match(err.message, /did not return a proposal ContextGuard could use/);
      assert.match(err.message, /nothing was written/);
      assert.doesNotMatch(err.message, /SECRET-LOOKING/, 'the agent reply is never sent to the browser');
      return true;
    });
  } finally {
    console.error = original;
  }
  assert.equal(prompts.length, 1);
  assert.ok(errors.some(line => line.includes('no usable JSON proposal') && line.includes('documented completion')),
    'the operator can read why in the server log');
});

test('Maintenance: the autonomous planner also refuses cleanly when its reply has no JSON', async () => {
  const { discovery } = setup([make(1, 'open')], 'Nothing useful to choose here.');
  await assert.rejects(discovery.chooseMission(session, repository, 'Pick the next useful investigation.'),
    err => err instanceof GitHubAppAuthError && err.status === 422);
});
