import { createHash } from 'node:crypto';

export const MAINTENANCE_ACTIONS = ['comment_issue', 'add_labels', 'edit_issue', 'close_issue', 'reopen_issue'] as const;
export type MaintenanceAction = typeof MAINTENANCE_ACTIONS[number];
export interface MaintenanceIssueState {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  updated_at: string;
  comments: number;
  html_url: string;
}
export interface MaintenanceActionInput {
  issue_number: number;
  body?: string;
  title?: string;
  labels?: string[];
}
export interface MaintenanceLockedInput extends MaintenanceActionInput {
  issue_fingerprint: string;
}
const MAX_BODY = 10000;
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid maintenance parameters.');
  return v as Record<string, unknown>;
}
function exactKeys(v: Record<string, unknown>, allowed: readonly string[]) {
  for (const k of Object.keys(v)) if (!allowed.includes(k)) throw new Error(`Unsupported maintenance parameter: ${k}`);
}
export function isMaintenanceAction(a: unknown): a is MaintenanceAction {
  return typeof a === 'string' && (MAINTENANCE_ACTIONS as readonly string[]).includes(a);
}
export function validateMaintenanceInput(action: MaintenanceAction, raw: unknown, locked = false): MaintenanceActionInput | MaintenanceLockedInput {
  const p = obj(raw);
  const fields: string[] = ['issue_number', ...(locked ? ['issue_fingerprint'] : [])];
  if (action === 'comment_issue') fields.push('body');
  if (action === 'add_labels') fields.push('labels');
  if (action === 'edit_issue') fields.push('title', 'body');
  exactKeys(p, fields);
  if (!Number.isSafeInteger(p.issue_number) || Number(p.issue_number) < 1) throw new Error('Valid issue_number required.');
  const out: MaintenanceActionInput = { issue_number: Number(p.issue_number) };
  if (action === 'comment_issue' || action === 'edit_issue') {
    if (typeof p.body !== 'string' || !p.body.trim() || p.body.length > MAX_BODY) throw new Error('Issue body must be 1–10000 characters.');
    out.body = p.body.trim();
  }
  if (action === 'edit_issue') {
    if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 256) throw new Error('Title must be 1–256 characters.');
    out.title = p.title.trim();
  }
  if (action === 'add_labels') {
    if (!Array.isArray(p.labels) || p.labels.length < 1 || p.labels.length > 10 ||
        p.labels.some(label => typeof label !== 'string' || !label.trim() || label.trim().length > 50 || /[\r\n]/.test(label))) {
      throw new Error('Provide 1–10 valid labels (maximum 50 characters each).');
    }
    out.labels = [...new Set((p.labels as string[]).map(s => s.trim()))];
  }
  if (locked) {
    if (typeof p.issue_fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(p.issue_fingerprint)) throw new Error('Server issue fingerprint required.');
    return { ...out, issue_fingerprint: p.issue_fingerprint };
  }
  return out;
}
export function normalizeIssue(value: unknown, repository: string): MaintenanceIssueState {
  const v = obj(value);
  if (!Number.isSafeInteger(v.number) || Number(v.number) < 1 ||
      typeof v.title !== 'string' || !['open', 'closed'].includes(String(v.state)) ||
      typeof v.body !== 'string' && v.body !== null ||
      typeof v.updated_at !== 'string' || !Number.isFinite(Date.parse(v.updated_at)) ||
      !Number.isSafeInteger(v.comments) || Number(v.comments) < 0 ||
      !Array.isArray(v.labels) || v.labels.length > 100 || v.pull_request) {
    throw new Error('GitHub returned an invalid issue state or a pull request.');
  }
  const url = `https://github.com/${repository}/issues/${v.number}`;
  if (v.html_url !== url) throw new Error('GitHub issue URL does not match the trusted repository.');
  const labels = v.labels.map(label => {
    const x = obj(label);
    if (typeof x.name !== 'string' || x.name.length > 100) throw new Error('Invalid issue label.');
    return x.name;
  });
  return { number: Number(v.number), title: v.title, body: typeof v.body === 'string' ? v.body : '',
    state: v.state as 'open' | 'closed', updated_at: v.updated_at, comments: Number(v.comments),
    labels: labels.sort(), html_url: url };
}
export function fingerprintIssue(state: MaintenanceIssueState): string {
  return createHash('sha256').update(JSON.stringify([
    state.number, state.title, state.body, state.state, state.labels.slice().sort(), state.updated_at, state.comments, state.html_url
  ])).digest('hex');
}
export function assertStateAction(action: MaintenanceAction, state: MaintenanceIssueState): void {
  if (action === 'close_issue' && state.state !== 'open') throw new Error('Issue is not open.');
  if (action === 'reopen_issue' && state.state !== 'closed') throw new Error('Issue is not closed.');
}
