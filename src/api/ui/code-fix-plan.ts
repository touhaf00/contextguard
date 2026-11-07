import { createHash } from 'node:crypto';

export type CodeFixAgentEdit = { path: string; old_text: string; new_text: string };
export type CodeFixAgentProposal = { title: string; description: string; edits: CodeFixAgentEdit[] };
export type CodeFixFileObservation = {
  path: string;
  content: string;
  git_blob_sha: string;
  mode: '100644';
};
export type CodeFixTrustedContext = {
  repository: string;
  issue_number: number;
  issue_fingerprint: string;
  base_branch: string;
  base_commit_sha: string;
  files: CodeFixFileObservation[];
  allowed_paths: string[];
};
export type CodeFixSealedFileChange = {
  path: string;
  base_blob_sha: string;
  before_sha256: string;
  after_sha256: string;
  before_content: string;
  after_content: string;
  diff: string;
};
export type CodeFixSealedProposal = {
  version: '1';
  repository: string;
  issue_number: number;
  issue_fingerprint: string;
  base_branch: string;
  base_commit_sha: string;
  head_branch: string;
  title: string;
  description: string;
  files: CodeFixSealedFileChange[];
  plan_digest: string;
  status: 'PREVIEW_ONLY_NO_GITHUB_WRITE';
};
export type CodeFixFreshObservation = {
  repository: string;
  issue_fingerprint: string;
  base_branch: string;
  base_commit_sha: string;
  files: Array<{path:string; git_blob_sha:string; content:string; mode:string}>;
};

function bad(message: string): never { throw new Error(`CODE_FIX_DENIED: ${message}`); }
const hex40 = /^[0-9a-f]{40}$/i;
const hex64 = /^[0-9a-f]{64}$/i;
const repoName = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const branchName = /^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9_.\/-]{1,120}$/;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_DIFF_BYTES = 24 * 1024;
const MAX_NEW_TEXT_BYTES = 12 * 1024;

export function sha256Hex(value:string):string {
  return createHash('sha256').update(value,'utf8').digest('hex');
}
function utf8Bytes(value:string):number { return Buffer.byteLength(value,'utf8'); }
function assertString(value:unknown, name:string, min:number, max:number):asserts value is string {
  if (typeof value !== 'string' || value.trim().length < min || utf8Bytes(value) > max || value.includes('\u0000')) {
    bad(`invalid ${name}`);
  }
}
function assertPath(path:unknown): asserts path is string {
  if (typeof path !== 'string' || path.length > 160 || path.includes('\\') || path.includes('\u0000') ||
      path.startsWith('/') || path.startsWith('.') || path.includes('//') ||
      path.split('/').some(s => s === '.' || s === '..' || s.length === 0) ||
      /(?:^|\/)(?:\.git|node_modules|dist|build|vendor|coverage|secrets?)(?:\/|$)/i.test(path) ||
      /(?:^|\/)\.env(?:\.|$)/i.test(path) ||
      /\.(?:pem|key|p12|pfx|crt|cer|lock|svg|png|jpg|jpeg|gif|zip|pdf)$/i.test(path) ||
      !/\.(?:ts|tsx|js|mjs|cjs|py|go|java|md|json|yml|yaml|sh|html|css)$/i.test(path)) {
    bad('unsafe or unsupported file path');
  }
  if (path.startsWith('.github/') || path.includes('/.github/')) bad('GitHub workflow/config changes need elevated review');
}
function normalize(value:unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string,unknown> = {};
    for(const k of Object.keys(obj).sort()) sorted[k] = normalize(obj[k]);
    return sorted;
  }
  return value;
}
function canonical(value:unknown): string { return JSON.stringify(normalize(value)); }
type CodeFixLine = { text: string; newline: boolean };
function contentLines(content: string): CodeFixLine[] {
  if (content === '') return [];
  const parts = content.split('\n');
  const result: CodeFixLine[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i === parts.length - 1 && parts[i] === '' && content.endsWith('\n')) continue;
    result.push({text: parts[i], newline: i < parts.length - 1});
  }
  return result;
}
function sameLine(a:CodeFixLine,b:CodeFixLine):boolean { return a.text===b.text && a.newline===b.newline; }
function diffForOneReplacement(path:string,before:string,after:string):string {
  const a=contentLines(before), b=contentLines(after);
  let prefix=0;
  while(prefix<Math.min(a.length,b.length) && sameLine(a[prefix],b[prefix]))prefix++;
  let suffix=0;
  while(suffix<Math.min(a.length-prefix,b.length-prefix) &&
        sameLine(a[a.length-1-suffix],b[b.length-1-suffix]))suffix++;
  const lead=Math.min(3,prefix),trail=Math.min(3,suffix);
  const oldLines=a.slice(prefix,a.length-suffix),newLines=b.slice(prefix,b.length-suffix);
  const oldCount=lead+oldLines.length+trail,newCount=lead+newLines.length+trail;
  const oldStart=prefix-lead+(oldCount===0?0:1);
  const newStart=prefix-lead+(newCount===0?0:1);
  const lines:string[]=[];
  function pushLine(marker:' '|'-'|'+',line:CodeFixLine):void {
    lines.push(marker+line.text);
    if(!line.newline)lines.push('\\ No newline at end of file');
  }
  for(const line of a.slice(prefix-lead,prefix))pushLine(' ',line);
  for(const line of oldLines)pushLine('-',line);
  for(const line of newLines)pushLine('+',line);
  for(const line of a.slice(a.length-suffix,a.length-suffix+trail))pushLine(' ',line);
  return `--- a/${path}\n+++ b/${path}\n@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n` + lines.join('\n')+'\n';
}
function hashablePlan(p:Omit<CodeFixSealedProposal,'plan_digest'|'head_branch'|'status'>):unknown {
  return { ...p, files:p.files.map(f=>({path:f.path,base_blob_sha:f.base_blob_sha,before_sha256:f.before_sha256,
    after_sha256:f.after_sha256,before_content:f.before_content,after_content:f.after_content,diff:f.diff})) };
}
export function createCodeFixPreview(context:CodeFixTrustedContext, proposal:CodeFixAgentProposal):CodeFixSealedProposal {
  if(!repoName.test(context.repository))bad('invalid server repository');
  if(!Number.isSafeInteger(context.issue_number) || context.issue_number < 1)bad('invalid server issue number');
  if(!hex64.test(context.issue_fingerprint))bad('missing server issue fingerprint');
  if(!hex40.test(context.base_commit_sha))bad('missing immutable base commit SHA');
  if(!branchName.test(context.base_branch) || context.base_branch.endsWith('.lock'))bad('unsafe base branch');
  assertString(proposal.title,'PR title',10,150);
  assertString(proposal.description,'PR description',20,4000);
  if(!Array.isArray(proposal.edits) || proposal.edits.length<1 || proposal.edits.length>3)bad('1–3 edited files required');
  const allowed = new Set(context.allowed_paths);
  const observed = new Map(context.files.map(f=>[f.path,f]));
  const touched = new Set<string>();
  const changes:CodeFixSealedFileChange[]=[];
  for(const edit of proposal.edits){
    assertPath(edit.path);
    if(!allowed.has(edit.path))bad('path is not allowed by server policy');
    if(touched.has(edit.path))bad('duplicate edited path');
    touched.add(edit.path);
    const observedFile=observed.get(edit.path);
    if(!observedFile || observedFile.mode!=='100644' || !hex40.test(observedFile.git_blob_sha))bad('missing verified regular Git blob');
    assertString(observedFile.content,'verified source content',1,MAX_FILE_BYTES);
    assertString(edit.old_text,'exact text to replace',8,MAX_NEW_TEXT_BYTES);
    if(typeof edit.new_text!=='string' || utf8Bytes(edit.new_text)>MAX_NEW_TEXT_BYTES || edit.new_text.includes('\u0000'))bad('invalid replacement text');
    const first=observedFile.content.indexOf(edit.old_text);
    if(first<0 || observedFile.content.indexOf(edit.old_text,first+1)>=0)bad('old_text not uniquely present in verified source');
    const after=observedFile.content.slice(0,first)+edit.new_text+observedFile.content.slice(first+edit.old_text.length);
    if(after===observedFile.content || utf8Bytes(after)>MAX_FILE_BYTES)bad('empty or oversized file modification');
    const diff=diffForOneReplacement(edit.path,observedFile.content,after);
    if(utf8Bytes(diff)>MAX_DIFF_BYTES)bad('diff too large for review');
    changes.push({path:edit.path,base_blob_sha:observedFile.git_blob_sha.toLowerCase(),
      before_sha256:sha256Hex(observedFile.content),after_sha256:sha256Hex(after),
      before_content:observedFile.content,after_content:after,diff});
  }
  changes.sort((a,b)=>a.path.localeCompare(b.path));
  const unsigned:Omit<CodeFixSealedProposal,'plan_digest'|'head_branch'|'status'>={version:'1', repository:context.repository,
    issue_number:context.issue_number,issue_fingerprint:context.issue_fingerprint.toLowerCase(),
    base_branch:context.base_branch,base_commit_sha:context.base_commit_sha.toLowerCase(),
    title:proposal.title.trim(),description:proposal.description.trim(),files:changes};
  const digest=sha256Hex(canonical(hashablePlan(unsigned)));
  const head=`contextguard/issue-${context.issue_number}-${digest.slice(0,12)}`;
  return {...unsigned,head_branch:head,plan_digest:digest,status:'PREVIEW_ONLY_NO_GITHUB_WRITE'};
}
export function assertCodeFixPlanIntegrity(plan:CodeFixSealedProposal):void {
  if(plan.status!=='PREVIEW_ONLY_NO_GITHUB_WRITE' || plan.version!=='1' || !hex64.test(plan.plan_digest))bad('invalid plan wrapper');
  for(const f of plan.files){
    assertPath(f.path);
    if(sha256Hex(f.before_content)!==f.before_sha256 || sha256Hex(f.after_content)!==f.after_sha256 ||
        diffForOneReplacement(f.path,f.before_content,f.after_content)!==f.diff)bad('plan file content or preview mutated');
  }
  const unsigned:Omit<CodeFixSealedProposal,'plan_digest'|'head_branch'|'status'>={version:plan.version,repository:plan.repository,issue_number:plan.issue_number,
    issue_fingerprint:plan.issue_fingerprint,base_branch:plan.base_branch,base_commit_sha:plan.base_commit_sha,
    title:plan.title,description:plan.description,files:plan.files};
  const digest=sha256Hex(canonical(hashablePlan(unsigned)));
  if(digest!==plan.plan_digest || plan.head_branch!==`contextguard/issue-${plan.issue_number}-${digest.slice(0,12)}`)bad('plan digest or branch drift');
}
export function assertCodeFixFreshPreflight(plan:CodeFixSealedProposal,current:CodeFixFreshObservation):void {
  assertCodeFixPlanIntegrity(plan);
  if(current.repository.toLowerCase()!==plan.repository.toLowerCase() || current.issue_fingerprint.toLowerCase()!==plan.issue_fingerprint ||
    current.base_branch!==plan.base_branch || current.base_commit_sha.toLowerCase()!==plan.base_commit_sha)bad('target, issue or base commit drift');
  const observed=new Map(current.files.map(f=>[f.path,f]));
  for(const f of plan.files){
    const fresh=observed.get(f.path);
    if(!fresh || fresh.mode!=='100644' || fresh.git_blob_sha.toLowerCase()!==f.base_blob_sha ||
      sha256Hex(fresh.content)!==f.before_sha256)bad('source file changed since approval');
  }
}
export function publicCodeFixPreview(plan:CodeFixSealedProposal):Record<string,unknown> {
  assertCodeFixPlanIntegrity(plan);
  return {version:plan.version,repository:plan.repository,issue_number:plan.issue_number,
    base_branch:plan.base_branch,base_commit_sha:plan.base_commit_sha,head_branch:plan.head_branch,
    title:plan.title,description:plan.description,plan_digest:plan.plan_digest,
    files:plan.files.map(f=>({path:f.path,before_sha256:f.before_sha256,after_sha256:f.after_sha256,diff:f.diff})),
    status:plan.status,external_action_executed:false};
}
