import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GitHubMaintenanceDiscovery } from '../dist/api/ui/agent-maintenance.js';
import { GitHubAppUserWorkflow } from '../dist/api/ui/github-app-workflow.js';
import { normalizeIssue } from '../dist/adapters/github/issue-maintenance.js';

const repository = 'touhaf00/contextguard-demo';
const sha = 'b'.repeat(40);
const session = {session_id:'session-owner',principal:{principal_id:'github-owner'}};
const issue = normalizeIssue({number:1,title:'Fix CI failure',body:'Workflow fails at Docker Hub login.',
  state:'open',labels:[{name:'bug'}],comments:1,updated_at:'2026-11-05T16:18:42Z',
  html_url:`https://github.com/${repository}/issues/1`},repository);
function setupDiscovery(reply) {
  const prompts=[];
  const github={async getRef(){return {object:{type:'commit',sha}};},
    async getBranch(){return {name:'main',commit:{sha}};}};
  const explorer={async list(){return {issues:[issue]};},
    async detail(_s,r,n){assert.equal(r,repository);assert.equal(n,1);return {issue};}};
  const transport={async getIssueState(_r,n){assert.equal(n,1);return issue;}};
  const agent={async run(prompt){prompts.push(prompt);return JSON.stringify(typeof reply==='function'?reply(prompt):reply);}};
  return {discovery:new GitHubMaintenanceDiscovery(github,transport,explorer,agent),prompts};
}
const validComment={action:'comment_issue',issue_number:1,parameters:{issue_number:1,body:'The CI log still requires investigation.'},rationale:'This issue has a documented CI failure that merits follow-up.',confidence:0.8};

test('Assistant: guided: Cominty can generate the requested comment without manual body text',async()=>{
  const {discovery,prompts}=setupDiscovery(validComment);
  const result=await discovery.investigate(session,repository,'main','Investigate the issue and propose guidance.',
    {requestedAction:'comment_issue',issueNumber:1});
  assert.equal(result.action,'comment_issue');
  assert.equal(result.parameters.body,validComment.parameters.body);
  assert.equal(result.issue_fingerprint.length,64);
  assert.match(prompts[0],/USER-LOCKED ACTION: comment_issue/);
  assert.match(prompts[0],/USER-LOCKED ISSUE NUMBER: 1/);
});

test('Assistant: guided: rejects an agent changing a user-selected comment into closure',async()=>{
  const {discovery}=setupDiscovery({...validComment,action:'close_issue',parameters:{issue_number:1}});
  await assert.rejects(discovery.investigate(session,repository,'main','Please propose a comment for issue number one.',
    {requestedAction:'comment_issue',issueNumber:1}),/changed the user-selected action/);
});

test('Assistant: guided: rejects an agent changing the selected issue number',async()=>{
  const {discovery}=setupDiscovery({...validComment,issue_number:2,parameters:{issue_number:2}});
  await assert.rejects(discovery.investigate(session,repository,'main','Comment on the selected issue only.',
    {requestedAction:'comment_issue',issueNumber:1}),/changed the user-selected issue/);
});

test('Assistant: guided: refuses an invalid selected action before any agent call',async()=>{
  const {discovery,prompts}=setupDiscovery(validComment);
  await assert.rejects(discovery.investigate(session,repository,'main','Investigate a valid issue for comments.',
    {requestedAction:'delete_repository'}),/Unsupported guided maintenance action/);
  assert.equal(prompts.length,0);
});

test('Assistant: guided: checks selected issue exists via authenticated read-only explorer',async()=>{
  const {discovery,prompts}=setupDiscovery(validComment);
  await assert.rejects(discovery.investigate(session,repository,'main','Investigate issue number two for me.',
    {requestedAction:'comment_issue',issueNumber:2}),/Expected values to be strictly equal/);
  assert.equal(prompts.length,0);
});

for(const [choice,expected] of [['create_issue','create_issue'],['maintain_issue','maintain_issue']]) {
  test(`Assistant: autonomous planner can choose ${choice}`,async()=>{
    const {discovery,prompts}=setupDiscovery({choice});
    assert.equal(await discovery.chooseMission(session,repository,'Investigate GitHub for useful tasks.'),expected);
    assert.match(prompts[0],/create_issue \(research a NEW problem/);
  });
}
test('Assistant: autonomous planner refuses unsupported or extra fields',async()=>{
  for(const answer of [{choice:'delete_repository'},{choice:'maintain_issue',token:'please'}]) {
    const {discovery}=setupDiscovery(answer);
    await assert.rejects(discovery.chooseMission(session,repository,'Investigate GitHub for useful tasks.'),/unsupported mission/);
  }
});

function fakeWorkflow() {
  const calls={maintain:[],create:[],plan:[],budget:[]};
  const workspace={
    maintenance:{
      async chooseMission(_session,repo,obj){calls.plan.push([repo,obj]);return 'maintain_issue';},
      async investigate(_session,repo,branch,obj,options){calls.maintain.push({repo,branch,obj,options});return {
        draft_id:'new-draft',created_by:'COMINTY_MANAGED_AGENT',repository:repo,branch,action:options.requestedAction||'comment_issue',
        parameters:{issue_number:1,body:'Investigate.'},issue_number:1
      };}
    },
    discovery:{async generate(x){calls.create.push(x);return {draft_id:'create-draft',created_by:'COMINTY_MANAGED_AGENT',repository:x.repository,branch:x.branch,issue:{title:'Fix CI',body:'Explain CI failure'}};}},
    drafts:{put(x){calls.storedCreate=x;}},maintenanceDrafts:new Map()
  };
  const fake={
    auth:{async requireRepository(_session,repo){if(repo!==repository)throw Error('not authorized');return {full_name:repository,default_branch:'main'};}},
    async workspace(){return workspace;},budget:{reserve(_id,n){calls.budget.push(n);}}
  };
  return {run:(input)=>GitHubAppUserWorkflow.prototype.investigateAssistant.call(fake,session,input),calls,workspace};
}

test('Assistant: guided create_issue routes through existing protected create draft store',async()=>{
  const {run,calls}=fakeWorkflow();
  const r=await run({repository,mode:'guided',requested_action:'create_issue'});
  assert.equal(r.kind,'create_issue');
  assert.equal(r.proposal.draft_id,'create-draft');
  assert.equal(calls.create.length,1);
  assert.equal(calls.maintain.length,0);
  assert.equal(calls.storedCreate.draft_id,'create-draft');
  assert.deepEqual(calls.budget,[1]);
});

test('Assistant: guided maintenance passes a server-enforced action and exact issue selection',async()=>{
  const {run,calls,workspace}=fakeWorkflow();
  const r=await run({repository,mode:'guided',requested_action:'add_labels',issue_number:1});
  assert.equal(r.kind,'maintenance');
  assert.deepEqual(calls.maintain[0].options,{requestedAction:'add_labels',issueNumber:1});
  assert.equal(workspace.maintenanceDrafts.get('new-draft').draft.action,'add_labels');
});

test('Assistant: autonomous planning cannot write directly and reserves two Cominty calls',async()=>{
  const {run,calls}=fakeWorkflow();
  const r=await run({repository,mode:'auto'});
  assert.equal(r.kind,'maintenance');
  assert.equal(calls.plan.length,1);
  assert.deepEqual(calls.budget,[2]);
  assert.deepEqual(calls.maintain[0].options,{});
});

test('Assistant: rejects switching action or targeting an issue outside guided mode',async()=>{
  const {run,calls}=fakeWorkflow();
  for(const input of [
    {mode:'auto',requested_action:'close_issue'},
    {mode:'auto',issue_number:1},
    {mode:'guided'},
    {mode:'guided',requested_action:'create_issue',issue_number:1},
    {mode:'guided',requested_action:'merge_pr'},
    {mode:'guided',requested_action:'close_issue',issue_number:0},
    {mode:'guided',requested_action:'close_issue',extra:'unsafe'}
  ]) await assert.rejects(run({repository,...input}));
  assert.deepEqual(calls.budget,[]);
});

test('Assistant: no GitHub write bypass: UI and server only route agent draft through /api/ui/start',async()=>{
  const [html,js,server]=await Promise.all(['public/index.html','public/app.js','src/server.ts'].map(x=>readFile(x,'utf8')));
  for(const a of ['create_issue','comment_issue','add_labels','edit_issue','close_issue','reopen_issue']) {
    assert.match(html,new RegExp(`<option value="${a}">`));
  }
  assert.match(html,/id="assistantMode"/);
  assert.match(js,/postUi\("\/api\/ui\/github\/assistant\/investigate", request\)/);
  assert.match(js,/await maintenanceRunProtectedAction\(/);
  assert.match(js,/applyAgentIssueDraft\(\)/);
  assert.match(js,/await startWorkflow\(\)/);
  assert.match(server,/\/api\/ui\/github\/assistant\/investigate/);
  assert.doesNotMatch(server,/\/api\/ui\/github\/assistant\/execute/);
});
