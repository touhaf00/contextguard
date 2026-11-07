import test from 'node:test';
import assert from 'node:assert/strict';
import { digestCanonicalJson } from '../dist/core/authorization-integrity.js';
import { validateTrustedExecutionAuthorizationV2 } from '../dist/core/trusted-executor.js';
import { GitHubTrustedExecutorV2 } from '../dist/adapters/github/trusted-executor.js';
import { isMaintenanceAction, validateMaintenanceInput, normalizeIssue, fingerprintIssue, assertStateAction } from '../dist/adapters/github/issue-maintenance.js';
import { GitHubRestExecutionTransportV2 } from '../dist/adapters/github/execution-transport.js';
import { GitHubUiFlowV2 } from '../dist/api/ui/github-flow.js';
import { GitHubMaintenanceDiscovery } from '../dist/api/ui/agent-maintenance.js';

const repository = 'touhaf00/contextguard-demo';
const sha = '1'.repeat(40);
const issueResponse = (extra = {}) => ({
  number: 1, title: 'Investigate CI login failure', body: 'Real failure in the Docker job.',
  state: 'open', labels:[{name:'bug'}], comments:0,
  html_url:`https://github.com/${repository}/issues/1`,
  updated_at:'2026-11-05T16:18:42Z', ...extra
});
const normalized = () => normalizeIssue(issueResponse(), repository);

test('Maintenance: recognizes precisely five bounded maintenance actions', () => {
  for (const name of ['comment_issue','add_labels','edit_issue','close_issue','reopen_issue']) assert.equal(isMaintenanceAction(name),true);
  for (const name of ['delete_repository','force_push','merge_pr','create_issue','']) assert.equal(isMaintenanceAction(name),false);
});

test('Maintenance: rejects unexpected parameters, forged fingerprint, and out-of-range issue', () => {
  assert.throws(()=>validateMaintenanceInput('comment_issue',{issue_number:1, body:'ok', issue_fingerprint:'a'.repeat(64)}),/Unsupported/);
  assert.throws(()=>validateMaintenanceInput('comment_issue',{issue_number:1, body:'ok'},true),/fingerprint/);
  assert.throws(()=>validateMaintenanceInput('close_issue',{issue_number:0}),/issue_number/);
  assert.throws(()=>validateMaintenanceInput('add_labels',{issue_number:1,labels:[]}),/labels/);
  assert.throws(()=>validateMaintenanceInput('edit_issue',{issue_number:1,title:'ok',body:'',other:true}),/Unsupported/);
  assert.deepEqual(validateMaintenanceInput('close_issue',{issue_number:1}),{issue_number:1});
});

test('Maintenance: fingerprints the actual issue state and detects all observed changes', () => {
  const a = normalized(); const fingerprint = fingerprintIssue(a);
  for (const delta of [{body:'changed'},{comments:1},{labels:['urgent']},{state:'closed'},{updated_at:'2026-11-05T16:18:43Z'}]) {
    assert.notEqual(fingerprint, fingerprintIssue({...a,...delta}));
  }
  assert.throws(()=>assertStateAction('reopen_issue',a),/not closed/);
  assert.throws(()=>assertStateAction('close_issue',{...a,state:'closed'}),/not open/);
  assert.throws(()=>normalizeIssue(issueResponse({pull_request:{url:'x'}}),repository),/invalid/);
  assert.throws(()=>normalizeIssue(issueResponse({html_url:'https://example.com/evil'}),repository),/URL/);
});

for (const [action,parameters,expectedMethod,suffix,expectedStatus,reply] of [
  ['comment_issue',{issue_number:1, body:'Please check secrets.'},'POST','/comments',201,{html_url:`https://github.com/${repository}/issues/1#issuecomment-321`}],
  ['add_labels',{issue_number:1, labels:['bug','triage']},'POST','/labels',200,[{name:'bug'},{name:'triage'}]],
  ['edit_issue',{issue_number:1, title:'New title',body:'New body'},'PATCH','',200,{number:1,html_url:`https://github.com/${repository}/issues/1`}],
  ['close_issue',{issue_number:1},'PATCH','',200,{number:1,html_url:`https://github.com/${repository}/issues/1`}],
  ['reopen_issue',{issue_number:1},'PATCH','',200,{number:1,html_url:`https://github.com/${repository}/issues/1`}]
]) {
  test(`Maintenance: ${action} uses real GitHub ${expectedMethod} endpoint and user's scoped token`,async()=>{
    const log=[];
    const t=new GitHubRestExecutionTransportV2({token:'test-user-token',fetchImpl:async(url,options)=>{
      log.push({url,options});return {status:expectedStatus,ok:true,async json(){return reply;}};
    }});
    const result=await t.executeMaintenance(repository,action,{...parameters,issue_fingerprint:'a'.repeat(64)});
    assert.equal(log.length,1);
    assert.equal(log[0].options.method,expectedMethod);
    assert.equal(log[0].options.headers.authorization,'Bearer test-user-token');
    assert.match(log[0].url,new RegExp(`/issues/1${suffix.replace('/','\\/')}$`));
    const body=JSON.parse(log[0].options.body);
    assert.equal('issue_fingerprint' in body,false);
    assert.equal('issue_number' in body,false);
    assert.equal(result.html_url,`https://github.com/${repository}/issues/1`);
  });
}

test('Maintenance: transport gets fresh issue state using GET and refuses PRs',async()=>{
  const log=[];
  const t=new GitHubRestExecutionTransportV2({token:'test',fetchImpl:async(url,opts)=>{
    log.push(opts.method); return {status:200,ok:true,async json(){return issueResponse();}};
  }});
  assert.equal((await t.getIssueState(repository,1)).number,1);
  assert.deepEqual(log,['GET']);
  const pr=new GitHubRestExecutionTransportV2({token:'test',fetchImpl:async()=>({status:200,ok:true,async json(){return issueResponse({pull_request:{url:'x'}});}})});
  await assert.rejects(pr.getIssueState(repository,1),/invalid issue/);
});

test('Maintenance: transport never reports success for failed or mismatched provider responses',async()=>{
  const failed=new GitHubRestExecutionTransportV2({token:'test',fetchImpl:async()=>({status:403,ok:false,async json(){return {};}})});
  await assert.rejects(failed.executeMaintenance(repository,'close_issue',{issue_number:1,issue_fingerprint:'a'.repeat(64)}),/HTTP 403/);
  const other=new GitHubRestExecutionTransportV2({token:'test',fetchImpl:async()=>({status:200,ok:true,async json(){return {number:2,html_url:`https://github.com/${repository}/issues/2`};}})});
  await assert.rejects(other.executeMaintenance(repository,'close_issue',{issue_number:1,issue_fingerprint:'a'.repeat(64)}),/another issue/);
});

function uiFlow({getDraft, getState = async()=>normalized(), onRequest=()=>{}}={}) {
  return new GitHubUiFlowV2({
    authorizationService:{authorize:({request})=>{onRequest(request);return {};},sessions:{}},
    executionContextStore:{},
    snapshotResolver:{resolver_version:'2',resolver_id:'maintenance.test',provider:'github',supports:()=>true,
      async resolve(subject){return {snapshot_id:`github:${repository}@${sha}`,subject,version:sha,observed_at:new Date().toISOString()};}},
    agentPipeline:{runtimeIdentity:()=>({platform:'cominty',worker_agent_id:'worker-test',guard_agent_id:'guard-test',tool_scope:['github.read']}),
      async run(request){onRequest(request);return {evidence:{},worker_assessment:{},guard_verification:{}};}},
    issueReader:{getIssueState:getState},
    getMaintenanceDraft:getDraft
  });
}
const validManual = {repository,target:{kind:'branch',ref:'main'},action:'comment_issue',parameters:{issue_number:1,body:'Investigate secrets without sharing values.'}};

test('Maintenance: protected start locks a real issue fingerprint before Worker/Guard',async()=>{
  let request;
  const f=uiFlow({onRequest:r=>{request=r;}});
  const result=await f.start(validManual);
  assert.equal(result.stage,'STOPPED');
  assert.equal(request.proposed_action.action,'comment_issue');
  assert.equal(request.proposed_action.parameters.issue_fingerprint,fingerprintIssue(normalized()));
  assert.equal(request.policy.human_approval,'REQUIRED');
  assert.equal(request.policy.preflight_required,true);
  assert.equal(request.context.operation,'github_issue_maintenance');
});

test('Maintenance: rejects browser-supplied fingerprints and unsupported actions before provider calls',async()=>{
  let reads=0;
  const f=uiFlow({getState:async()=>{reads++;return normalized();}});
  await assert.rejects(f.start({...validManual,parameters:{...validManual.parameters,issue_fingerprint:'a'.repeat(64)}}),/Unsupported maintenance parameter/);
  await assert.rejects(f.start({...validManual,action:'delete_repository'}),/Invalid maintenance action/);
  await assert.rejects(f.start({...validManual,issue:{title:'x',body:'y'}}),/Invalid maintenance action/);
  assert.equal(reads,0);
});

test('Maintenance: agent draft cannot be forged or edited before Worker/Guard',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const d={repository,branch:'main',investigated_sha:sha,action:'comment_issue',parameters:validManual.parameters,issue_fingerprint:fingerprintIssue(normalized())};
  const f=uiFlow({getDraft:key=>key===id?d:undefined});
  await assert.rejects(f.start({...validManual,maintenance_draft_id:id,parameters:{...validManual.parameters,body:'Changed text'}}),/edited/);
  await assert.rejects(f.start({...validManual,maintenance_draft_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}),/expired or is not owned/);
  assert.equal((await f.start({...validManual,maintenance_draft_id:id})).stage,'STOPPED');
});

test('Maintenance: detects issue changes since agent investigation before any Worker/Guard',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const d={repository,branch:'main',investigated_sha:sha,action:'comment_issue',parameters:validManual.parameters,issue_fingerprint:fingerprintIssue(normalized())};
  let runs=0;
  const f=uiFlow({getDraft:()=>d,getState:async()=>({...normalized(),updated_at:'2026-11-05T17:00:00Z'}),onRequest:()=>runs++});
  await assert.rejects(f.start({...validManual,maintenance_draft_id:id}),/Repository or issue changed/);
  assert.equal(runs,0);
});

test('Maintenance: agent proposes only an observed issue with immutable server GitHub evidence',async()=>{
  const github={
    async getRef(){return {object:{type:'commit',sha}};},
    async getBranch(){return {name:'main',commit:{sha}};}
  };
  const explorer={async list(){return {issues:[{number:1,title:'Investigate CI',state:'open',labels:['bug'],updated_at:'2026-11-05T16:18:42Z',comments:0,html_url:`https://github.com/${repository}/issues/1`,body:'Real evidence'}]};}};
  const transport={async getIssueState(){return normalized();}};
  const agent={async run(){return JSON.stringify({action:'comment_issue',issue_number:1,parameters:{issue_number:1,body:'Check documented CI failure without sharing secrets.'},rationale:'The CI login failed and merits a factual investigation note.',confidence:0.92});}};
  const result=await new GitHubMaintenanceDiscovery(github,transport,explorer,agent).investigate({session_id:'session'},repository,'main');
  assert.equal(result.action,'comment_issue');
  assert.equal(result.issue_fingerprint,fingerprintIssue(normalized()));
  assert.equal(result.external_action_executed,false);
  assert.ok(result.draft_id);
  const bad={async run(){return JSON.stringify({action:'comment_issue',issue_number:2,parameters:{issue_number:2,body:'wrong issue'},rationale:'A specific issue would benefit from this investigation.',confidence:0.4});}};
  await assert.rejects(new GitHubMaintenanceDiscovery(github,transport,explorer,bad).investigate({session_id:'session'},repository,'main'),/unobserved/);
});

function buildAuthorization({
  repository =
    "touhaf00/contextguard",

  provider =
    "github",

  resourceType =
    "repository_ref",

  namespace =
    "github",

  action =
    "create_issue",

  parameters = {
    title:
      "ContextGuard controlled execution test",

    body:
      "Created through a single-use ContextGuard authorization."
  }
} = {}) {
  const proposedAction = {
    namespace,
    action,
    parameters
  };

  const receiptBase = {
    receipt_version:
      "2",

    receipt_id:
      "receipt-github-executor-1",

    session_id:
      "session-github-executor-1",

    request_id:
      "request-github-executor-1",

    lock_id:
      "lock-github-executor-1",

    lock_fingerprint:
      "a".repeat(64),

    status:
      "AUTHORIZED_FOR_EXECUTOR",

    subject: {
      provider,

      resource_type:
        resourceType,

      resource_id:
        repository,

      selector: {
        kind:
          "branch",

        ref:
          "main"
      }
    },

    snapshot_id:
      "github:snapshot-1",

    authorized_snapshot_version:
      "1".repeat(40),

    proposed_action:
      proposedAction,

    action_digest:
      digestCanonicalJson(
        proposedAction
      ),

    policy_digest:
      "b".repeat(64),

    runtime_digest:
      "c".repeat(64),

    approval_requirement:
      "REQUIRED",

    approval_id:
      "approval-github-executor-1",

    approval_principal_id:
      "operator",

    approval_record_digest:
      "d".repeat(64),

    approval_attestation_digest:
      "e".repeat(64),

    preflight_checked_at:
      "2026-11-02T02:10:00.000Z",

    preflight_response_digest:
      "f".repeat(64),

    issued_at:
      "2026-11-02T02:10:30.000Z",

    expires_at:
      "2026-11-02T02:20:00.000Z",

    execution_configured:
      false,

    external_action_executed:
      false
  };

  const receipt = {
    ...receiptBase,

    receipt_digest:
      digestCanonicalJson(
        receiptBase
      )
  };

  const consumptionBase = {
    consumption_version:
      "2",

    consumption_id:
      "consumption-github-executor-1",

    receipt_id:
      receipt.receipt_id,

    receipt_digest:
      receipt.receipt_digest,

    lock_id:
      receipt.lock_id,

    lock_fingerprint:
      receipt.lock_fingerprint,

    action_digest:
      receipt.action_digest,

    authorized_snapshot_version:
      receipt.authorized_snapshot_version,

    status:
      "CONSUMED_FOR_EXECUTION",

    consumed_at:
      "2026-11-02T02:12:00.000Z",

    execution_configured:
      false,

    external_action_executed:
      false
  };

  const consumption = {
    ...consumptionBase,

    consumption_digest:
      digestCanonicalJson(
        consumptionBase
      )
  };

  return validateTrustedExecutionAuthorizationV2(
    receipt,
    consumption,
    {
      checkedAt:
        "2026-11-02T02:13:00.000Z"
    }
  );
}


const maintenanceAuthorize = (action, parameters) => buildAuthorization({repository, action, parameters});
function executorWith({getState=async()=>normalized(), execute=async()=>({issue_number:1,html_url:`https://github.com/${repository}/issues/1`})}={}) {
  let writes=0, reads=0;
  const executor=new GitHubTrustedExecutorV2({
    transport:{async createIssue(){throw new Error('Unapproved create_issue path');},
      async getIssueState(){reads++;return getState();},
      async executeMaintenance(repo, action, input){writes++;return execute(repo,action,input);}},
    stateResolver:{resolver_version:'2',resolver_id:'maintenance.executor',provider:'github',supports:()=>true,
      async resolve(subject){return {snapshot_id:'github:snapshot-1',subject,version:'1'.repeat(40),observed_at:'2026-11-02T02:13:30.000Z'};}},
    allowedRepositories:[repository],now:()=>new Date('2026-11-02T02:13:00.000Z')
  });
  return {executor, writes:()=>writes, reads:()=>reads};
}

test('Maintenance: trusted executor accepts valid consumed receipt and rechecks issue before real write',async()=>{
  const params={issue_number:1,body:'Investigate real GitHub CI errors.',issue_fingerprint:fingerprintIssue(normalized())};
  const v=executorWith();
  const result=await v.executor.execute(maintenanceAuthorize('comment_issue',params));
  assert.equal(v.reads(),1);
  assert.equal(v.writes(),1);
  assert.equal(result.action,'comment_issue');
  assert.equal(result.status,'EXECUTED');
  assert.equal(result.issue_number,1);
});

test('Maintenance: trusted executor denies receipt when existing issue changes before execution',async()=>{
  const params={issue_number:1,body:'Investigate real GitHub CI errors.',issue_fingerprint:fingerprintIssue(normalized())};
  const v=executorWith({getState:async()=>({...normalized(),updated_at:'2026-11-06T10:00:00Z'})});
  await assert.rejects(v.executor.execute(maintenanceAuthorize('comment_issue',params)),/GitHub issue changed/);
  assert.equal(v.writes(),0);
});

test('Maintenance: trusted executor requires correct issue state and forbids invalid action',async()=>{
  const params={issue_number:1,issue_fingerprint:fingerprintIssue(normalized())};
  const v=executorWith();
  await assert.rejects(v.executor.execute(maintenanceAuthorize('reopen_issue',params)),/no longer supports/);
  assert.equal(v.writes(),0);
  const forbidden=maintenanceAuthorize('delete_repository',{issue_number:1});
  await assert.rejects(v.executor.execute(forbidden),/rejects this action/);
  assert.equal(v.writes(),0);
});

test('Maintenance: trusted executor retains repository allowlist even with valid receipt',async()=>{
  const params={issue_number:1,body:'Investigate real GitHub CI errors.',issue_fingerprint:fingerprintIssue(normalized())};
  const v=executorWith();
  await assert.rejects(v.executor.execute(buildAuthorization({repository:'someone/other',action:'comment_issue',parameters:params})),/not in the trusted executor allowlist/);
  assert.equal(v.reads(),0);
  assert.equal(v.writes(),0);
});
