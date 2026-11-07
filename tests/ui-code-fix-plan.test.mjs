import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodeFixPreview,assertCodeFixPlanIntegrity,assertCodeFixFreshPreflight,publicCodeFixPreview,sha256Hex} from '../dist/api/ui/code-fix-plan.js';
const context=()=>({repository:'touhaf00/contextguard-demo',issue_number:1,issue_fingerprint:'a'.repeat(64),base_branch:'main',base_commit_sha:'b'.repeat(40),
 files:[{path:'app.py',content:'def add(a, b):\n    return a + b\n',git_blob_sha:'c'.repeat(40),mode:'100644'}],allowed_paths:['app.py']});
const agent=()=>({title:'Fix addition function regression',description:'Proposes an explicit change for review. No changes have been executed.',
 edits:[{path:'app.py',old_text:'    return a + b',new_text:'    return int(a) + int(b)'}]});
const preview=()=>createCodeFixPreview(context(),agent());
test('Code fix: plan is deterministic and binds exact file bytes, issue, SHA and PR branch',()=>{
 const a=preview(),b=preview();assert.deepEqual(a,b);assert.match(a.head_branch,/^contextguard\/issue-1-[0-9a-f]{12}$/);
 assert.match(a.files[0].diff,/return int\(a\)/);assert.equal(a.files[0].before_sha256,sha256Hex(context().files[0].content));
});
test('Code fix: public preview cannot disclose full source or full replacement contents',()=>{
 const p=publicCodeFixPreview(preview());assert.equal(p.external_action_executed,false);assert.equal(p.status,'PREVIEW_ONLY_NO_GITHUB_WRITE');
 assert.ok(!('after_content' in p.files[0]));assert.ok(!('before_content' in p.files[0]));
});
test('Code fix: denies file path traversal, absolute paths, env files, workflows and ignored paths',()=>{
 for(const path of ['../app.py','/tmp/app.py','.env','src/../app.py','.github/workflows/ci.yml','node_modules/x.js','src\\x.js']){
  const c=context(),a=agent();c.allowed_paths=[path];c.files=[{...c.files[0],path}];a.edits[0].path=path;assert.throws(()=>createCodeFixPreview(c,a),/CODE_FIX_DENIED/,path);
 }
});
test('Code fix: rejects unallowlisted files even when agent names them',()=>{
 const a=agent();a.edits[0].path='src/server.ts';assert.throws(()=>createCodeFixPreview(context(),a),/not allowed/);
});
test('Code fix: rejects mismatched, absent and ambiguous replacements',()=>{
 const a=agent();a.edits[0].old_text='not in source';assert.throws(()=>createCodeFixPreview(context(),a),/not uniquely/);
 const c=context();c.files[0].content='abcdefgh\nabcdefgh\n';a.edits[0].old_text='abcdefgh';assert.throws(()=>createCodeFixPreview(c,a),/not uniquely/);
});
test('Code fix: rejects symlinks, Git tree entries without verifiable blob and binary contents',()=>{
 for(const mode of ['120000','100755']){const c=context();c.files[0].mode=mode;assert.throws(()=>createCodeFixPreview(c,agent()),/regular Git blob/);}
 const c=context();c.files[0].content='abcdefgh\u0000';assert.throws(()=>createCodeFixPreview(c,agent()),/invalid verified source/);
});
test('Code fix: tampered sealed plan and changed branch are rejected',()=>{
 const p=preview();p.files[0].after_content='malicious';assert.throws(()=>assertCodeFixPlanIntegrity(p),/mutated/);
 const q=preview();q.head_branch='main';assert.throws(()=>assertCodeFixPlanIntegrity(q),/drift/);
});
test('Code fix: preflight succeeds only for exact unchanged issue, commit and Git file bytes',()=>{
 const p=preview(),c=context();const fresh={repository:c.repository,issue_fingerprint:c.issue_fingerprint,base_branch:c.base_branch,
  base_commit_sha:c.base_commit_sha,files:[{...c.files[0]}]};
 assert.doesNotThrow(()=>assertCodeFixFreshPreflight(p,fresh));
 for(const key of ['issue_fingerprint','base_commit_sha','repository']){
  const altered=structuredClone(fresh);altered[key]=(key==='repository'?'other/repo':'f'.repeat(key==='base_commit_sha'?40:64));
  assert.throws(()=>assertCodeFixFreshPreflight(p,altered),/drift/);
 }
 const altered=structuredClone(fresh);altered.files[0].content+='\n# drift';assert.throws(()=>assertCodeFixFreshPreflight(p,altered),/source file changed/);
});
test('Code fix: denies duplicate file edits, empty change, and oversized patches',()=>{
 const a=agent();a.edits.push({...a.edits[0]});assert.throws(()=>createCodeFixPreview(context(),a),/duplicate edited path/);
 const b=agent();b.edits[0].new_text=b.edits[0].old_text;assert.throws(()=>createCodeFixPreview(context(),b),/empty or oversized/);
 const c=agent();c.edits[0].new_text='z'.repeat(13000);assert.throws(()=>createCodeFixPreview(context(),c),/invalid replacement/);
});
test('Code fix: does not perform writes and never equates a preview with approval',()=>{
 const p=publicCodeFixPreview(preview()); assert.equal(p.status,'PREVIEW_ONLY_NO_GITHUB_WRITE');
 assert.ok(!('approval' in p));assert.ok(!('receipt' in p));
});
