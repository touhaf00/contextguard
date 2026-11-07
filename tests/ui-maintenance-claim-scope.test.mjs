import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubRestSnapshotClientV2 } from '../dist/adapters/github/rest-client.js';
import { normalizeIssue, fingerprintIssue } from '../dist/adapters/github/issue-maintenance.js';
import { readIssueEvidence, referencedWorkflowRunsV2, buildClaimScopeGuidanceV2 } from '../dist/api/ui/cominty-pipeline.js';

const repo='touhaf00/contextguard-demo';
const run=42036585403;
const runUrl=`https://github.com/${repo}/actions/runs/${run}`;
const issue={number:1,title:'Investigate Docker Hub',state:'open',body:`CI failed; verify secrets. ${runUrl}`,updated_at:'2026-11-05T16:18:42Z',labels:[],comments:0,html_url:`https://github.com/${repo}/issues/1`};
const fp=fingerprintIssue(normalizeIssue(issue,repo));
function request(body=`The issue reports an observed Docker login failure. Secret availability is unverified. No fix has been applied. Evidence: ${runUrl}`) {
  return {subject:{resource_id:repo},proposed_action:{action:'comment_issue',parameters:{issue_number:1,body,issue_fingerprint:fp}}};
}

test('Maintenance: discovers only same-repository workflow run references, with bounded IDs',()=>{
  assert.deepEqual(referencedWorkflowRunsV2(`X ${runUrl} other https://github.com/other/repo/actions/runs/9`,repo),[run]);
  assert.deepEqual(referencedWorkflowRunsV2(`https://github.com/other/repo/actions/runs/${run}`,repo),[]);
  assert.deepEqual(referencedWorkflowRunsV2(`https://github.com/${repo}/actions/runs/999999999999999999`,repo),[]);
});

test('Maintenance: source read authenticates GitHub jobs GET only, with user token and no writes',async()=>{
  const calls=[];
  const client=new GitHubRestSnapshotClientV2({token:'USER_TOKEN',fetchImpl:async(url,opt)=>{
    calls.push({url,opt});
    assert.equal(opt.method,'GET');
    return {ok:true,async json(){return {total_count:1,jobs:[{run_id:run,name:'docker',conclusion:'failure',steps:[{name:'Connexion à Docker Hub',conclusion:'failure'}]}]};}};
  }});
  const result=await client.getWorkflowRunJobs(repo,run);
  assert.equal(result.jobs[0].conclusion,'failure');
  assert.match(calls[0].url,RegExp(`/repos/${repo}/actions/runs/${run}/jobs\\?per_page=100&`));
  assert.equal(calls[0].opt.headers.authorization,'Bearer USER_TOKEN');
  await assert.rejects(client.getWorkflowRunJobs(repo,0),/Invalid GitHub workflow run ID/);
});

test('Maintenance: issue and workflow evidence are actually re-read and attribute only what was observed',async()=>{
  let reads=0, jobs=0;
  const client={
    async getIssue(){reads++;return issue;},
    async getWorkflowRunJobs(repository,id){jobs++;assert.equal(repository,repo);assert.equal(id,run);return {jobs:[{run_id:run,name:'docker',conclusion:'failure',steps:[{name:'Connexion à Docker Hub',conclusion:'failure'}]}]};}
  };
  const response=await readIssueEvidence(request(),client);
  assert.equal(reads,1); assert.equal(jobs,1);
  assert.match(response,/GITHUB ACTIONS JOB AND STEP OUTCOMES/);
  assert.match(response,/Connexion à Docker Hub/);
  assert.match(response,/actual log text, secret existence/);
  assert.match(response,/root cause, deployment and any fix are NOT established/);
});

test('Maintenance: does not fetch a run mentioned only in an untrusted new comment',async()=>{
  let jobs=0;
  const client={async getIssue(){return {...issue,body:'No run URL here'};},async getWorkflowRunJobs(){jobs++;return {};}};
  const current=normalizeIssue({...issue,body:'No run URL here'},repo);
  const r=request();r.proposed_action.parameters.issue_fingerprint=fingerprintIssue(current);
  const message=await readIssueEvidence(r,client);
  assert.equal(jobs,0);assert.doesNotMatch(message,/GITHUB ACTIONS JOB AND STEP OUTCOMES/);
});

test('Maintenance: prevents state drift before any Actions evidence read',async()=>{
  let jobs=0;
  const client={async getIssue(){return {...issue,updated_at:'2026-11-05T16:18:43Z'};},async getWorkflowRunJobs(){jobs++;}};
  await assert.rejects(readIssueEvidence(request(),client),/GITHUB_ISSUE_CHANGED/);
  assert.equal(jobs,0);
});

test('Maintenance: unavailable Actions evidence cannot be represented as verified',async()=>{
  const client={async getIssue(){return issue;},async getWorkflowRunJobs(){throw new Error('403');}};
  const text=await readIssueEvidence(request(),client);
  assert.match(text,/JOB OBSERVATION UNAVAILABLE/);
  assert.doesNotMatch(text,/GITHUB ACTIONS JOB AND STEP OUTCOMES/);
});

test('Maintenance: instructions distinguish uncertain statements, do not bypass approval or Guard',()=>{
  const guide=buildClaimScopeGuidanceV2(request());
  assert.match(guide,/does NOT assert/);
  assert.match(guide,/NEVER be marked SUPPORTED unless directly and reliably corroborated/);
  assert.match(guide,/independent Guard, human approval, preflight and single-use receipt remain mandatory/);
  assert.equal(buildClaimScopeGuidanceV2({proposed_action:{action:'create_issue'}}),'');
});
