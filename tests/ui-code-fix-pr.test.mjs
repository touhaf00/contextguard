import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {CodeFixGitHubApi,CodeFixGitHubInvestigator,CodeFixPlanStore,codeFixActionFromPlan,validateCodeFixApprovalAction} from '../dist/api/ui/github-code-fix.js';
import {GitHubUiFlowV2} from '../dist/api/ui/github-flow.js';
import {GitHubTrustedExecutorV2} from '../dist/adapters/github/trusted-executor.js';
import {digestCanonicalJson,authorizationRequestDigest} from '../dist/core/authorization-integrity.js';
import {evidenceProtocolDigest} from '../dist/core/evidence.js';
import {workerAssessmentDigest} from '../dist/core/assessment.js';
import {GenericAuthorizationServiceV2} from '../dist/api/v2/service.js';
import {TrustedExecutionContextStoreV2} from '../dist/api/v2/execution-context-store.js';
import {validateTrustedExecutionAuthorizationV2} from '../dist/core/trusted-executor.js';
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
function receiptFor(plan,parameters=codeFixActionFromPlan(plan)) {
  const proposed_action={namespace:'github',action:'propose_pr_fix',parameters};
  const issued=new Date(Date.now()-4000).toISOString(),consumed=new Date(Date.now()-1500).toISOString(),expires=new Date(Date.now()+120000).toISOString();
  const r0={receipt_version:'2',receipt_id:'receipt-code-fix',session_id:'session-code-fix',request_id:'request-code-fix',lock_id:'lock-code-fix',
    lock_fingerprint:'a'.repeat(64),status:'AUTHORIZED_FOR_EXECUTOR',
    subject:{provider:'github',resource_type:'repository_ref',resource_id:repo,selector:{kind:'branch',ref:branch}},
    snapshot_id:'code-fix:snapshot',authorized_snapshot_version:baseSha,proposed_action,
    action_digest:digestCanonicalJson(proposed_action),policy_digest:'b'.repeat(64),runtime_digest:'c'.repeat(64),
    approval_requirement:'REQUIRED',approval_id:'approval-code-fix',approval_principal_id:'human-user',
    approval_record_digest:'d'.repeat(64),approval_attestation_digest:'e'.repeat(64),
    preflight_checked_at:new Date(Date.now()-5000).toISOString(),preflight_response_digest:'f'.repeat(64),
    issued_at:issued,expires_at:expires,execution_configured:false,external_action_executed:false};
  const r={...r0,receipt_digest:digestCanonicalJson(r0)};
  const c0={consumption_version:'2',consumption_id:'consumption-code-fix',receipt_id:r.receipt_id,receipt_digest:r.receipt_digest,
    lock_id:r.lock_id,lock_fingerprint:r.lock_fingerprint,action_digest:r.action_digest,authorized_snapshot_version:baseSha,
    status:'CONSUMED_FOR_EXECUTION',consumed_at:consumed,execution_configured:false,external_action_executed:false};
  const c={...c0,consumption_digest:digestCanonicalJson(c0)};
  return validateTrustedExecutionAuthorizationV2(r,c,{checkedAt:new Date().toISOString()});
}
function executorFor(mock,store,overrides={}) {
  return new GitHubTrustedExecutorV2({transport:{async createIssue(){throw Error('must not create issue');}},
    stateResolver:{resolver_version:'2',resolver_id:'code-fix.test.exec',provider:'github',supports:()=>true,async resolve(subject){return {snapshot_id:'code-fix:snapshot',subject,version:overrides.snapshotSha??baseSha,observed_at:new Date().toISOString()};}},
    allowedRepositories:overrides.allowed??[repo],
    codeFix:{loadPlan:digest=>store.get(digest),executeApprovedPlan:p=>mock.api.executeApprovedPlan(p)}});
}
function okPipeline() {
  return {runtimeIdentity:()=>({platform:'cominty',worker_agent_id:'worker',guard_agent_id:'guard',tool_scope:['github.read']}),async run(request){
    const reqDigest=authorizationRequestDigest(request),assembled_at=new Date().toISOString();
    const evidence={protocol_version:'2',request_digest:reqDigest,assembled_at,
      evidence:[{evidence_id:'E1',source_snapshot:request.snapshot,locator:`https://github.com/${repo}/tree/${baseSha}`,
        observation:'Exact GitHub base SHA and code proposal were reviewed.',level:'OUTPUT_OBSERVED'}],
      claims:[{claim_id:'C1',statement:'The exact GitHub code proposal has an observed base.',criticality:'REQUIRED',status:'SUPPORTED',evidence_refs:['E1']}]};
    const worker={protocol_version:'2',request_digest:reqDigest,evidence_digest:evidenceProtocolDigest(evidence,request),
      decision:'READY',confidence:0.9,summary:'Bounded code proposal ready for human review.',assessed_at:assembled_at};
    const guard={protocol_version:'2',request_digest:reqDigest,evidence_digest:evidenceProtocolDigest(evidence,request),
      worker_assessment_digest:workerAssessmentDigest(worker,evidence,request),verdict:'PASS',risk:'LOW',verified_claims:['C1'],
      unverified_claims:[],contradicted_claims:[],findings:[],requested_checks:[],worker_decision_supported:true,
      retry_recommended:false,summary:'Independent evidence supports this bounded code proposal.',verified_at:assembled_at};
    return {evidence,worker_assessment:worker,guard_verification:guard};
  }};
}
function flowFor(plan,api,store) {
  const snapshotResolver={provider:'github',resolver_version:'2',resolver_id:'code-fix.tests',supports:()=>true,
    async resolve(subject){return {snapshot_id:'code-fix:snapshot',subject,version:baseSha,observed_at:new Date().toISOString()};}};
  return new GitHubUiFlowV2({authorizationService:new GenericAuthorizationServiceV2(),
    executionContextStore:new TrustedExecutionContextStoreV2(),snapshotResolver,agentPipeline:okPipeline(),
    getCodeFixPlan:d=>store.get(d),verifyCodeFixPlan:async p=>{await api.fresh(p);},executionConfigured:true});
}

test('Code fix: agent investigates issue, selects allowed Git file, builds code diff — GET-only',async()=>{
  const m=fakeGh(),{plan,ai}=await planFrom(m);
  assert.equal(ai.calls.length,2);assert.equal(m.state.writes.length,0);
  assert.equal(plan.issue_number,1);assert.equal(plan.files[0].base_blob_sha,sourceSha);
  assert.match(plan.files[0].diff,/int\(a\)/);
  assert.equal(plan.base_commit_sha,baseSha);assert.match(plan.head_branch,/^contextguard\/issue-1-/);
});

test('Code fix: declines unauthorized path selected by model; no write',async()=>{
  const m=fakeGh(),bad=agent([{paths:['.github/workflows/ci.yml']}]);
  await assert.rejects(new CodeFixGitHubInvestigator(m.api,bad).propose(repo,branch,1,intent),/not select valid code paths/);
  assert.equal(m.state.writes.length,0);
});

test('Code fix: declines fake edit and wrong issue content; no write',async()=>{
  const m=fakeGh(),bad=agent([{paths:['app.py']},{...proposal,edits:[{path:'app.py',old_text:'never here',new_text:'evil'}]}]);
  await assert.rejects(new CodeFixGitHubInvestigator(m.api,bad).propose(repo,branch,1,intent),/not uniquely/);
  assert.equal(m.state.writes.length,0);
});

test('Code fix: proposal is immutable, scoped and reread for separate Worker and Guard',async()=>{
  const m=fakeGh(),{plan}=await planFrom(m),store=new CodeFixPlanStore();store.put(plan);
  const a=await m.api.verificationEvidence(plan,'WORKER'),b=await m.api.verificationEvidence(plan,'GUARD');
  assert.match(a,/SERVER-READ/);assert.match(a,/DRAFT Pull Request/);assert.match(b,/GUARD/);
  assert.equal(m.state.writes.length,0);assert.equal(store.get(plan.plan_digest).plan_digest,plan.plan_digest);
  const altered=store.get(plan.plan_digest);altered.files[0].after_content='evil';
  assert.notEqual(store.get(plan.plan_digest).files[0].after_content,'evil');
});

test('Code fix: browser must submit only its server-owned digest; rejected forged payloads never reach Worker',async()=>{
  const m=fakeGh(),{plan}=await planFrom(m),store=new CodeFixPlanStore();store.put(plan);
  const flow=flowFor(plan,m.api,store),body={repository:repo,target:{kind:'branch',ref:branch},pr_draft_id:plan.plan_digest};
  for(const bad of [
    {...body,action:'propose_pr_fix',parameters:codeFixActionFromPlan(plan)},
    {...body,issue:{title:'evil',body:'evil'}},
    {...body,pr_draft_id:'f'.repeat(64)},
    {...body,target:{kind:'branch',ref:'other'}},
    {...body,extra:'untrusted'}
  ]) await assert.rejects(flow.start(bad));
  assert.equal(m.state.writes.length,0);
  const started=await flow.start(body);
  assert.equal(started.stage,'AWAITING_HUMAN_APPROVAL');
  assert.equal(started.request.proposed_action.action,'propose_pr_fix');
  assert.equal(started.authorization.session.session_state,'AWAITING_HUMAN_APPROVAL');
  assert.equal(started.request.policy.preflight_required,true);
  assert.equal(started.authorization.lock!==undefined,true);
  assert.equal(m.state.writes.length,0);
});

test('Code fix: code PR execution creates one real commit on a new branch and a draft PR after verified receipt',async()=>{
  const m=fakeGh(),{plan}=await planFrom(m),store=new CodeFixPlanStore();store.put(plan);
  assert.equal(m.state.writes.length,0);
  const result=await executorFor(m,store).execute(receiptFor(plan));
  assert.equal(result.external_action_executed,true);
  assert.equal(result.action,'propose_pr_fix');
  assert.equal(result.pull_request.draft,true);
  assert.equal(result.pull_request.commit_sha,newCommit);
  assert.equal(result.pull_request.url,`https://github.com/${repo}/pull/8`);
  assert.deepEqual(m.state.writes.map(x=>x.path),['/git/blobs','/git/trees','/git/commits','/git/refs','/pulls']);
  assert.ok(m.state.writes.every(x=>x.auth==='Bearer test-github-app-user-token'));
  assert.equal(m.state.writes.find(x=>x.path==='/git/refs').payload.ref,`refs/heads/${plan.head_branch}`);
  assert.equal(m.state.writes.find(x=>x.path==='/pulls').payload.draft,true);
});

test('Code fix: denies forged action digest or changed approved parameters before any writes',async()=>{
  const m=fakeGh(),{plan}=await planFrom(m),store=new CodeFixPlanStore();store.put(plan);
  const altered=codeFixActionFromPlan(plan);altered.files[0].diff='danger';
  await assert.rejects(executorFor(m,store).execute(receiptFor(plan,altered)),/plan is absent|changed|no longer owned/);
  assert.equal(m.state.writes.length,0);
});

test('Code fix: denies changed issue, source or HEAD after approval before any write',async()=>{
  for(const change of [m=>{m.state.issueBody+=' changed';},m=>{m.state.source+='\n# drift';},m=>{m.state.branchSha='f'.repeat(40);}]){
    const m=fakeGh(),{plan}=await planFrom(m),store=new CodeFixPlanStore();store.put(plan);
    change(m);
    await assert.rejects(executorFor(m,store).execute(receiptFor(plan)));
    assert.equal(m.state.writes.length,0);
  }
});

test('Code fix: denies expired or missing server plan after valid receipt and cannot use an unlisted repository',async()=>{
  const m=fakeGh(),{plan}=await planFrom(m),store=new CodeFixPlanStore();
  await assert.rejects(executorFor(m,store).execute(receiptFor(plan)),/plan is absent/);
  store.put(plan);
  await assert.rejects(executorFor(m,store,{allowed:['other/repo']}).execute(receiptFor(plan)),/allowlist/);
  assert.equal(m.state.writes.length,0);
});

test('Code fix: PR permission failure leaves branch and commit flagged as partial, never asserts success',async()=>{
  const m=fakeGh(),{plan}=await planFrom(m),store=new CodeFixPlanStore();store.put(plan);m.state.prFails=true;
  await assert.rejects(executorFor(m,store).execute(receiptFor(plan)),/branch .* created.*PR creation was not confirmed/);
  assert.deepEqual(m.state.writes.map(x=>x.path),['/git/blobs','/git/trees','/git/commits','/git/refs','/pulls']);
});

test('Code fix: UI only offers draft PR, never merges and never exposes a direct write endpoint',async()=>{
  const [html,js,server]=await Promise.all(['public/index.html','public/app.js','src/server.ts'].map(x=>readFile(x,'utf8')));
  assert.match(html,/<option value="propose_pr_fix">/);
  assert.match(html,/id="codeFixReviewDiff"/);
  assert.match(js,/postUi\("\/api\/ui\/github\/pr\/investigate"/);
  assert.match(js,/pr_draft_id: draft\.plan_digest/);
  assert.match(js,/await maintenanceRunProtectedAction\(/);
  assert.match(server,/\/api\/ui\/github\/pr\/investigate/);
  assert.doesNotMatch(server,/\/api\/ui\/github\/pr\/execute/);
  assert.doesNotMatch(server,/\/api\/ui\/github\/pr\/merge/);
});

const optionalCandidates=[
  {number:1,title:'Docker Hub credentials require repair',body:'Workflow login fails. Secrets may be missing.',state:'open',html_url:`https://github.com/${repo}/issues/1`},
  {number:2,title:'Fix incorrect numerical addition',body:'The source function should normalize numeric string inputs.',state:'open',html_url:`https://github.com/${repo}/issues/2`}
];
const autoObjective='Find a reviewable issue that can be fixed with a safe source-code change.';

test('Code fix: absent issue number: Cominty chooses ONLY among authenticated open issues (no writes)',async()=>{
  const m=fakeGh();
  const ai=agent([{issue_number:2}]);
  const selected=await new CodeFixGitHubInvestigator(m.api,ai).chooseOpenIssue(repo,branch,autoObjective,optionalCandidates);
  assert.equal(selected,2);
  assert.equal(ai.calls.length,1);
  assert.match(ai.calls[0],/only select ONE issue number from the server-provided open-issue list/i);
  assert.match(ai.calls[0],/GitHub Actions workflow edits, secret changes/);
  assert.equal(m.state.writes.length,0);
});

test('Code fix: rejects a Cominty-selected issue that was never in the authorized list',async()=>{
  for(const output of [{issue_number:99},{issue_number:0},{issue_number:'2'},{issue_number:2,delete_repo:true}]) {
    const m=fakeGh();
    const ai=agent([output]);
    await assert.rejects(new CodeFixGitHubInvestigator(m.api,ai).chooseOpenIssue(repo,branch,autoObjective,optionalCandidates),
      /outside the authorized|invalid issue choice/);
    assert.equal(m.state.writes.length,0);
  }
});

test('Code fix: no suitable open issue fails closed rather than silently choosing one',async()=>{
  const m=fakeGh(),ai=agent([{issue_number:null,reason:'All open issues require changing secrets.'}]);
  const chooser=new CodeFixGitHubInvestigator(m.api,ai);
  await assert.rejects(chooser.chooseOpenIssue(repo,branch,autoObjective,optionalCandidates),/could not find a suitable/);
  await assert.rejects(chooser.chooseOpenIssue(repo,branch,autoObjective,[]),/No open GitHub issue/);
  assert.equal(ai.calls.length,1);
  assert.equal(m.state.writes.length,0);
});

test('Code fix: refuses closed, cross-repository or duplicated candidate records before Cominty',async()=>{
  for(const bad of [
    [{...optionalCandidates[0],state:'closed'}],
    [{...optionalCandidates[0],html_url:'https://github.com/foreign/repo/issues/1'}],
    [optionalCandidates[0],optionalCandidates[0]]
  ]){
    const m=fakeGh(),ai=agent([{issue_number:1}]);
    await assert.rejects(new CodeFixGitHubInvestigator(m.api,ai).chooseOpenIssue(repo,branch,autoObjective,bad),/invalid or untrusted/);
    assert.equal(ai.calls.length,0);
    assert.equal(m.state.writes.length,0);
  }
});

test('Code fix: server accepts empty issue number, selects and rereads issue before storing sealed plan',async()=>{
  const m=fakeGh(),{plan}=await planFrom(m);
  const {GitHubAppUserWorkflow}=await import('../dist/api/ui/github-app-workflow.js');
  const session={session_id:'sid',principal:{principal_id:'github-owner'}};
  const calls={budget:[],list:0,select:[],propose:[],plans:[]};
  const fake={
    auth:{async requireRepository(_s,r){assert.equal(r,repo);return {full_name:repo,default_branch:'main'};}},
    issueExplorer:{async list(_s,r,state){assert.equal(r,repo);assert.equal(state,'open');calls.list++;return {issues:optionalCandidates};}},
    async workspace(){return {
      codeFixInvestigator:{async chooseOpenIssue(r,b,o,issues){calls.select.push({r,b,o,issues});return 1;},
        async propose(r,b,n,o){calls.propose.push({r,b,n,o});return plan;}},
      codeFixPlans:{put(v){calls.plans.push(v);}}
    };},
    budget:{reserve(id,count){calls.budget.push([id,count]);}}
  };
  const response=await GitHubAppUserWorkflow.prototype.investigatePr.call(fake,session,{repository:repo,branch:'main',objective:autoObjective});
  assert.equal(response.kind,'pull_request');
  assert.deepEqual(response.issue_selection,{mode:'COMINTY_SELECTED',issue_number:1,issue_title:optionalCandidates[0].title});
  assert.equal(calls.list,1);
  assert.equal(calls.select.length,1);
  assert.equal(calls.propose[0].n,1);
  assert.deepEqual(calls.budget,[['github-owner',3]]);
  assert.equal(calls.plans.length,1);
  assert.equal(m.state.writes.length,0);
});

test('Code fix: explicit issue number still pins the user-selected issue; no autonomous selection',async()=>{
  const m=fakeGh(),{plan}=await planFrom(m);
  const {GitHubAppUserWorkflow}=await import('../dist/api/ui/github-app-workflow.js');
  const session={session_id:'sid',principal:{principal_id:'github-owner'}};
  const calls={budget:[],propose:[],stored:0};
  const fake={
    auth:{async requireRepository(_s,r){assert.equal(r,repo);return {full_name:repo,default_branch:'main'};}},
    issueExplorer:{async list(){throw Error('must NOT auto-discover for explicit issue');}},
    async workspace(){return {codeFixInvestigator:{async chooseOpenIssue(){throw Error('should NOT select automatically');},
      async propose(_r,_b,n){calls.propose.push(n);return plan;}},codeFixPlans:{put(){calls.stored++;}}};},
    budget:{reserve(_id,n){calls.budget.push(n);}}
  };
  const response=await GitHubAppUserWorkflow.prototype.investigatePr.call(fake,session,{repository:repo,issue_number:1});
  assert.equal(response.issue_selection.mode,'USER_SPECIFIED');
  assert.deepEqual(calls.propose,[1]);
  assert.deepEqual(calls.budget,[2]);
  assert.equal(calls.stored,1);
  assert.equal(m.state.writes.length,0);
});

test('Code fix: invalid explicit issue number fails before Cominty or data writes',async()=>{
  const {GitHubAppUserWorkflow}=await import('../dist/api/ui/github-app-workflow.js');
  const session={session_id:'sid',principal:{principal_id:'github-owner'}};
  let calls=0;
  const fake={auth:{async requireRepository(){return {full_name:repo,default_branch:'main'};}},
    async workspace(){calls++;throw Error('should not open workspace');}};
  for(const number of [null,0,-1,1.2,'1',NaN]){
    await assert.rejects(GitHubAppUserWorkflow.prototype.investigatePr.call(fake,session,{repository:repo,issue_number:number}),/positive integer/);
  }
  assert.equal(calls,0);
});

test('Code fix: UI no longer demands issue number, sends omitted field and shows the selected issue',async()=>{
  const [html,js]=await Promise.all(['public/index.html','public/app.js'].map(p=>readFile(p,'utf8')));
  assert.match(html,/optional — Cominty selects an open issue if empty/);
  assert.doesNotMatch(js,/Choose the issue number to solve before preparing a code PR/);
  assert.match(js,/\.\.\.\(request\.issue_number !== undefined \? \{ issue_number: request\.issue_number \} : \{\}\)/);
  assert.match(js,/Cominty selected issue #\$\{draft\.issue_number\}/);
});


test('Code fix: automatic selection then code proposal uses exactly three read-only Cominty calls',async()=>{
  const m=fakeGh(),ai=agent([{issue_number:1},{paths:['app.py']},proposal]);
  const investigator=new CodeFixGitHubInvestigator(m.api,ai);
  const number=await investigator.chooseOpenIssue(repo,branch,autoObjective,[optionalCandidates[0]]);
  const sealed=await investigator.propose(repo,branch,number,autoObjective);
  assert.equal(sealed.issue_number,1);
  assert.equal(ai.calls.length,3);
  assert.equal(m.state.writes.length,0);
  assert.ok(m.state.reads.length>0);
});

test('Code fix: server rejects inconsistent selection before proposing code',async()=>{
  const {GitHubAppUserWorkflow}=await import('../dist/api/ui/github-app-workflow.js');
  const session={session_id:'sid',principal:{principal_id:'github-owner'}};
  let proposals=0,stored=0;
  const fake={
    auth:{async requireRepository(){return {full_name:repo,default_branch:'main'};}},
    issueExplorer:{async list(){return {issues:[optionalCandidates[0]]};}},
    async workspace(){return {codeFixInvestigator:{async chooseOpenIssue(){return 99;},
      async propose(){proposals++;throw Error('should not propose');}},codeFixPlans:{put(){stored++;}}};},
    budget:{reserve(){}}
  };
  await assert.rejects(GitHubAppUserWorkflow.prototype.investigatePr.call(fake,session,{repository:repo}),/not in the verified open-issue list/);
  assert.equal(proposals,0);
  assert.equal(stored,0);
});
