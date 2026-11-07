import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CodeFixGitHubApi,CodeFixGitHubInvestigator} from '../dist/api/ui/github-code-fix.js';

const repo='touhaf00/contextguard-demo',baseSha='b'.repeat(40),treeSha='c'.repeat(40),newTree='d'.repeat(40),newCommit='e'.repeat(40);
const source='def add(a, b):\n    return a + b\n',branch='main';
const shaBlob=t=>createHash('sha1').update(`blob ${Buffer.byteLength(t,'utf8')}\0`).update(t,'utf8').digest('hex');
const sourceSha=shaBlob(source);
function fakeGh() {
  const state={source,issueBody:'Fix addition: the function should cast string inputs to int before adding.',branchSha:baseSha,
    writes:[],reads:[],prFails:false,paths:['app.py']};
  const fetchImpl=async (url,opt={})=>{
    const {pathname,searchParams}=new URL(url),method=opt.method||'GET';
    const path=decodeURIComponent(pathname),p=path.split(`/repos/${repo}`)[1];
    assert.ok(p,'unexpected API URL');
    const payload=opt.body?JSON.parse(opt.body):undefined;
    if(method!=='GET')state.writes.push({method,path:p,payload,auth:opt.headers.authorization});
    else state.reads.push(path);
    let result,status=200;
    if(method==='GET'&&p==='/git/ref/heads/main') result={ref:'refs/heads/main',object:{type:'commit',sha:state.branchSha}};
    else if(method==='GET'&&p==='/branches/main') result={name:'main',commit:{sha:state.branchSha}};
    else if(method==='GET'&&p===`/git/commits/${baseSha}`) result={sha:baseSha,tree:{sha:treeSha}};
    else if(method==='GET'&&p===`/git/trees/${treeSha}`) result={truncated:false,tree:state.paths.map(path=>({path,mode:'100644',type:'blob',sha:sourceSha,size:Buffer.byteLength(state.source)}))};
    else if(method==='GET'&&p==='/contents/app.py') {
      result={type:'file',path:'app.py',content:Buffer.from(state.source).toString('base64'),encoding:'base64',size:Buffer.byteLength(state.source),sha:shaBlob(state.source)};
    }
    else if(method==='GET'&&p==='/issues/1') result={number:1,title:'Issue for code fix',body:state.issueBody,state:'open',labels:[],comments:0,
      updated_at:'2026-11-05T12:00:00Z',html_url:`https://github.com/${repo}/issues/1`};
    else if(method==='POST'&&p==='/git/blobs') {result={sha:shaBlob(payload.content)};status=201;}
    else if(method==='POST'&&p==='/git/trees') {assert.equal(payload.base_tree,treeSha);assert.equal(payload.tree[0].path,'app.py');result={sha:newTree};status=201;}
    else if(method==='POST'&&p==='/git/commits') {assert.deepEqual(payload.parents,[baseSha]);assert.equal(payload.tree,newTree);result={sha:newCommit};status=201;}
    else if(method==='POST'&&p==='/git/refs') {assert.equal(payload.sha,newCommit);result={ref:payload.ref,object:{sha:newCommit,type:'commit'}};status=201;}
    else if(method==='POST'&&p==='/pulls') {
      assert.equal(payload.draft,true);assert.equal(payload.base,'main');
      if(state.prFails)return {status:403,ok:false,async json(){return {message:'Permission denied'};}};
      result={number:8,html_url:`https://github.com/${repo}/pull/8`,draft:true,state:'open',head:{sha:newCommit,ref:payload.head},base:{ref:'main'}};status=201;
    }
    else if(method==='GET'&&p===`/commits/${baseSha}`) result={sha:baseSha};
    else throw new Error(`Unhandled ${method} ${p}`);
    return {status,ok:status>=200&&status<300,async json(){return result;}};
  };
  return {state,fetchImpl,api:new CodeFixGitHubApi({token:'test-github-app-user-token',fetchImpl})};
}
const intent='Please examine the function and propose a minimal code change for the issue.';
const proposal={title:'Fix addition type conversion',description:'Propose converting numeric strings before addition; the patch has not been tested.',
  edits:[{path:'app.py',old_text:'    return a + b',new_text:'    return int(a) + int(b)'}]};
function agent(replies=[{paths:['app.py']},proposal]) {
  const calls=[];
  return {calls,async run(prompt){calls.push(prompt);return JSON.stringify(replies[calls.length-1]);}};
}
async function planFrom(mock) {
  const ai=agent();
  const p=await new CodeFixGitHubInvestigator(mock.api,ai).propose(repo,branch,1,intent);
  return {plan:p,ai};
}

function evidenceState(text) {
  const start = text.indexOf('{\n');
  const data = JSON.parse(text.slice(start, text.indexOf('\n}', start) + 2));
  return data.files[0].server_computed_after_state;
}

test('Code fix: the real plan produced by the real generator: Worker and Guard receive a server-computed after state that matches the sealed plan', async () => {
  const m = fakeGh(), {plan} = await planFrom(m);
  for (const role of ['WORKER', 'GUARD']) {
    const text = await m.api.verificationEvidence(plan, role);
    assert.match(text, /server_computed_after_state were produced by deterministic server code/);
    const st = evidenceState(text);
    assert.equal(st.diff_applies_exactly_to_observed_original, true,
      `the real diff was not applied: ${st.diff_failure_reason}\n--- diff ---\n${plan.files[0].diff}`);
    assert.equal(st.sealed_after_sha256, plan.files[0].after_sha256);
    assert.equal(st.diff_result_sha256_equals_sealed_after_sha256, true);
    assert.equal(st.content_to_be_committed_sha256_equals_sealed_after_sha256, true);
    assert.equal(st.content_to_be_committed_equals_diff_result, true);
    assert.ok(text.includes(`SERVER-READ FILE TEXT AT THE BASE COMMIT ${baseSha}`));
    assert.ok(text.includes(`FILE \`app.py\` [FILE TO BE CHANGED] (Git blob ${sourceSha}, COMPLETE: all 2 lines are shown):`));
    assert.ok(text.includes('1: def add(a, b):\n2:     return a + b\n```'));
  }
  assert.equal(m.state.writes.length, 0);
});

test('Code fix: a tampered plan is never silently presented as consistent', async (t) => {
  const m = fakeGh(), {plan} = await planFrom(m);
  const tampered = structuredClone(plan);
  tampered.files[0].after_content = tampered.files[0].after_content.replace('int(a)', 'int(b)');
  assert.notEqual(tampered.files[0].after_content, plan.files[0].after_content);
  let outcome;
  try {
    const st = evidenceState(await m.api.verificationEvidence(tampered, 'GUARD'));
    assert.equal(st.content_to_be_committed_equals_diff_result, false);
    assert.equal(st.content_to_be_committed_sha256_equals_sealed_after_sha256, false);
    outcome = 'REPORTED_IN_EVIDENCE';
  } catch (error) {
    if (error && error.name === 'AssertionError') throw error;
    outcome = 'REJECTED_BEFORE_EVIDENCE';
  }
  t.diagnostic(`tampered after_content outcome: ${outcome}`);
  assert.ok(['REPORTED_IN_EVIDENCE', 'REJECTED_BEFORE_EVIDENCE'].includes(outcome));
});
