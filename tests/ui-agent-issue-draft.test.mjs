import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  GitHubAgentIssueDiscovery, GitHubAgentDraftError,
  validateAgentDraftInput, validateComintyIssueProposal
} from "../dist/api/ui/agent-issue-draft.js";
import { AgentIssueDraftStore } from "../dist/api/ui/agent-issue-store.js";
import { GitHubUiFlowV2, GitHubUiFlowErrorV2 } from "../dist/api/ui/github-flow.js";

const REPO = "touhaf00/tp-cicd";
const BRANCH = "main";
const SHA = "a".repeat(40);
const COMMIT_URL = `https://github.com/${REPO}/commit/${SHA}`;
const RUN_URL = `https://github.com/${REPO}/actions/runs/123`;
const INPUT = {
  repository: REPO,
  branch: BRANCH,
  objective: "Investigate recent CI results and propose one actionable issue."
};
const TITLE = "Add a CI failure triage checklist";
const BODY = `## Observed context\nThe latest repository commit was reviewed. ${COMMIT_URL}\n\n## Proposal\nAdd a short triage checklist for investigating future CI failures with reproducible steps and expected outcomes.\n\n## Acceptance criteria\n- Checklist committed.\n- Reviewer confirms clarity.`;

function reader({ mismatch = false, noRuns = false, conclusion = "failure" } = {}) {
  return {
    async getWorkflowRun(repo, id) {
      return { id, name: "CI", event: "push", status: "completed", conclusion, head_branch: BRANCH, head_sha: SHA, run_attempt: 1, html_url: RUN_URL };
    },
    async getWorkflowRunJobs(repo, id) {
      return { jobs: [{ id: 9, run_id: id, name: "build", conclusion, steps: [{ name: "Run tests", conclusion }] }] };
    },
    async getWorkflowJobLog() {
      return { text: "FAILED (failures=1)\n##[error]Process completed with exit code 1.", truncated: false };
    },
    async getRef(repo, namespace, branch) {
      assert.equal(repo, REPO);
      assert.equal(namespace, "heads");
      assert.equal(branch, BRANCH);
      return { object: { type: "commit", sha: SHA } };
    },
    async getBranch(repo, branch) {
      assert.equal(repo, REPO);
      assert.equal(branch, BRANCH);
      return { name: branch, commit: { sha: mismatch ? "b".repeat(40) : SHA } };
    },
    async getCommit(repo, sha) {
      assert.equal(repo, REPO);
      assert.equal(sha, SHA);
      return { sha: SHA, commit: { message: "chore: improve build automation" } };
    },
    async getWorkflowRuns() {
      if (noRuns) throw new Error("GitHub API unavailable");
      return {
        workflow_runs: [{
          id: 123,
          name: "CI",
          conclusion,
          html_url: RUN_URL
        }]
      };
    }
  };
}

function draftAgent({ output, record = [] } = {}) {
  return {
    async run(prompt) {
      record.push(prompt);
      return JSON.stringify(output ?? {
        action: "create_issue",
        title: TITLE,
        body: BODY,
        rationale: "A consistent triage checklist will make future failures faster to investigate.",
        confidence: 0.8,
        evidence_urls: [COMMIT_URL]
      });
    }
  };
}

test("Cominty agent authors issue from trusted real GitHub evidence, no write", async () => {
  const prompts = [];
  const service = new GitHubAgentIssueDiscovery(reader(), draftAgent({record: prompts}));
  const result = await service.generate(INPUT);
  assert.equal(result.created_by, "COMINTY_MANAGED_AGENT");
  assert.equal(result.external_action_executed, false);
  assert.equal(result.issue.title, 'CI failure in run 123: job "build", step "Run tests"');
  assert.equal(result.rationale, "A consistent triage checklist will make future failures faster to investigate.");
  assert.equal(result.investigated_sha, SHA);
  assert.equal(result.evidence_summary.workflow_runs[0].conclusion, "failure");
  assert.match(prompts[0], /real repository evidence/i);
  assert.match(prompts[0], /chore: improve build automation/);
  assert.match(prompts[0], /human approval/i);
  assert.match(prompts[0], /failure/);
  assert.ok(!prompts[0].includes("GITHUB_EXECUTION_TOKEN"));
});

test("A branch without a failed run proposes nothing and calls no agent", async () => {
  const prompts = [];
  await assert.rejects(
    new GitHubAgentIssueDiscovery(reader({ conclusion: "success" }), draftAgent({ record: prompts })).generate(INPUT),
    e => e instanceof GitHubAgentDraftError && e.code === "NO_CI_FAILURE" && /nothing was written/.test(e.message)
  );
  assert.equal(prompts.length, 0, "no Cominty credit is spent on an issue that could not be verified");
});

test("Branch disagreement fails closed before any Cominty agent call", async () => {
  let count = 0;
  const service = new GitHubAgentIssueDiscovery(reader({mismatch:true}), {
    async run() { count++; return "{}"; }
  });
  await assert.rejects(service.generate(INPUT), /inconsistent|disagree/i);
  assert.equal(count, 0);
});

test("No CI data is disclosed as unavailable and cannot become claimed success", async () => {
  const prompts=[];
  const service=new GitHubAgentIssueDiscovery(reader({noRuns:true}), draftAgent({record:prompts}));
  await assert.rejects(service.generate(INPUT),
    e => e instanceof GitHubAgentDraftError && e.code === "NO_CI_FAILURE" && /could not be read/.test(e.message));
  assert.equal(prompts.length, 0);
});

test("Model cannot fabricate GitHub evidence URLs", async () => {
  const bad = draftAgent({output: {
    action:"create_issue",title:TITLE,body:BODY+"\nhttps://evil.example/notes",
    rationale:"We need a clear plan to address this issue going forward.",confidence:0.9,
    evidence_urls:["https://evil.example/notes"]
  }});
  const draft = await new GitHubAgentIssueDiscovery(reader(),bad).generate(INPUT);
  assert.doesNotMatch(`${draft.issue.title}\n${draft.issue.body}`, /evil\.example/);
  assert.deepEqual(draft.evidence_urls, [COMMIT_URL, RUN_URL]);
});

test("Model cannot introduce unauthorized GitHub writes or metadata", async () => {
  await assert.rejects(
    new GitHubAgentIssueDiscovery(reader(), draftAgent({output:{
      action:"merge_pull_request",title:TITLE,body:BODY,
      rationale:"This long rationale describes the action to take.",
      confidence:0.8,evidence_urls:[COMMIT_URL]
    }})).generate(INPUT), /create_issue/);
  assert.throws(()=>validateComintyIssueProposal({
    action:"create_issue",title:TITLE,body:BODY,
    rationale:"This long rationale describes the action to take.",
    confidence:0.8,evidence_urls:[COMMIT_URL],execute:true
  },new Set([COMMIT_URL])),/unsupported/i);
});

test("Malformed input and prompt injection-like repository values are rejected",()=>{
  assert.throws(()=>validateAgentDraftInput({...INPUT,branch:"main;rm -rf /"}), /branch/i);
  assert.throws(()=>validateAgentDraftInput({...INPUT,repository:"https://github.com/x/y"}), /repository/i);
  assert.throws(()=>validateAgentDraftInput({...INPUT,execute:true}), /field/i);
  assert.throws(()=>validateAgentDraftInput({...INPUT,objective:"short"}), /objective/i);
});

test("Draft store returns detached values and expires safely",()=>{
  const store = new AgentIssueDraftStore(2,1000);
  const x = {draft_id:"d1", issue:{title:TITLE,body:BODY}, repository:REPO, branch:BRANCH, investigated_sha:SHA};
  store.put(x);
  const value=store.get("d1");value.issue.title="tamper";
  assert.equal(store.get("d1").issue.title,TITLE);
  assert.equal(store.get("missing"),undefined);
});

test("Authenticated GitHub authorization refuses a forged or edited agent issue", async()=>{
  let runs=0;
  const flow = new GitHubUiFlowV2({
    authorizationService:{},executionContextStore:{},
    snapshotResolver:{
      resolver_version:"2",resolver_id:"test",provider:"github",supports:()=>true,
      async resolve(subject){return {snapshot_id:"a",subject,version:SHA,observed_at:new Date().toISOString()};}
    },
    agentPipeline:{runtimeIdentity(){return {platform:"cominty",worker_agent_id:"test",guard_agent_id:"guard",tool_scope:["github.read"]}},async run(){runs++}},
    getAgentDraft(id){return id === "01234567-89ab-4def-8012-3456789abcde"
      ? {repository:REPO,branch:BRANCH,investigated_sha:SHA,issue:{title:TITLE,body:BODY}}
      : undefined;
    }
  });
  const base={repository:REPO,target:{kind:"branch",ref:BRANCH},issue:{title:TITLE,body:BODY},draft_id:"01234567-89ab-4def-8012-3456789abcde"};
  for(const b of [{...base,issue:{...base.issue,title:"changed"}},{...base,draft_id:"11111111-1111-4111-8111-111111111111"},{...base,target:{kind:"branch",ref:"develop"}}]){
    await assert.rejects(flow.start(b),e=>e instanceof GitHubUiFlowErrorV2 && e.code==="INVALID_ISSUE");
  }
  assert.equal(runs,0);
});

test("Authenticated browser exposes agent investigation but requires explicit click",async()=>{
  const html=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
  const app=await readFile(new URL("../public/app.js",import.meta.url),"utf8");
  const server=await readFile(new URL("../src/server.ts",import.meta.url),"utf8");
  assert.match(html,/id="agentInvestigateButton"/);
  assert.match(html,/id="agentDraftPreview"/);
  assert.match(app,/window\.confirm\(/);
  assert.match(app,/\/api\/ui\/agent-draft/);
  assert.match(app,/created_by !== "COMINTY_MANAGED_AGENT"/);
  assert.match(server,/contextGuardUiAccessGate\.authenticate\(/);
  assert.match(server,/agentIssueDraftStore\.put/);
  assert.doesNotMatch(server,/\/api\/ui\/agent-draft[\s\S]{0,250}executeReceipt/);
});

test("Exact agent proposal reaches original independent verification and ActionLock",async()=>{
  const {GenericAuthorizationServiceV2} = await import("../dist/api/v2/service.js");
  const {TrustedExecutionContextStoreV2} = await import("../dist/api/v2/execution-context-store.js");
  const {authorizationRequestDigest}=await import("../dist/core/authorization-integrity.js");
  const {evidenceProtocolDigest}=await import("../dist/core/evidence.js");
  const {workerAssessmentDigest}=await import("../dist/core/assessment.js");
  const id="01234567-89ab-4def-8012-3456789abcde";
  const input={repository:REPO,target:{kind:"branch",ref:BRANCH},issue:{title:TITLE,body:BODY},draft_id:id};
  let sawRequest;
  const flow=new GitHubUiFlowV2({
    authorizationService:new GenericAuthorizationServiceV2(),
    executionContextStore:new TrustedExecutionContextStoreV2(),
    snapshotResolver:{
      resolver_version:"2",resolver_id:"github.agentic-test",provider:"github",supports:()=>true,
      async resolve(subject){return {snapshot_id:"github:agentic",subject,version:SHA,observed_at:"2026-11-04T09:00:00Z"}}
    },
    getAgentDraft(key){return key===id?{repository:REPO,branch:BRANCH,investigated_sha:SHA,issue:{title:TITLE,body:BODY}}:undefined},
    agentPipeline:{
      runtimeIdentity(){return {platform:"cominty",worker_agent_id:"worker",guard_agent_id:"guard",tool_scope:["github.read"]}},
      async run(request){
        sawRequest=request;
        const evidence={protocol_version:"2",request_digest:authorizationRequestDigest(request),assembled_at:"2026-11-04T09:01:00Z",
          evidence:[{evidence_id:"E1",source_snapshot:request.snapshot,locator:COMMIT_URL,observation:"Referenced exact SHA",level:"OUTPUT_OBSERVED"}],
          claims:[{claim_id:"C1",statement:"Exact branch SHA matches",criticality:"REQUIRED",status:"SUPPORTED",evidence_refs:["E1"]}]};
        const worker={protocol_version:"2",request_digest:authorizationRequestDigest(request),evidence_digest:evidenceProtocolDigest(evidence,request),decision:"READY",confidence:0.88,summary:"GitHub evidence supports the proposed agent-authored issue",assessed_at:"2026-11-04T09:02:00Z"};
        const guard={protocol_version:"2",request_digest:authorizationRequestDigest(request),evidence_digest:evidenceProtocolDigest(evidence,request),worker_assessment_digest:workerAssessmentDigest(worker,evidence,request),verdict:"PASS",risk:"LOW",verified_claims:["C1"],unverified_claims:[],contradicted_claims:[],findings:[],requested_checks:[],worker_decision_supported:true,retry_recommended:false,summary:"Independently verified evidence",verified_at:"2026-11-04T09:03:00Z"};
        return {evidence,worker_assessment:worker,guard_verification:guard};
      }
    },
    now:()=>new Date("2026-11-04T09:00:30Z")
  });
  const res=await flow.start(input);
  assert.equal(res.stage,"AWAITING_HUMAN_APPROVAL");
  assert.equal(res.request.proposed_action.parameters.title,TITLE);
  assert.equal(res.request.proposed_action.parameters.body,BODY);
  assert.equal(res.request.context.proposed_by,"cominty_managed_agent");
  assert.equal(res.request.context.agent_issue_draft_id,id);
  assert.equal(res.pipeline.worker_assessment.decision,"READY");
  assert.equal(res.pipeline.guard_verification.verdict,"PASS");
  assert.ok(res.authorization.lock);
  assert.ok(res.authorization.session);
  assert.equal(res.external_action_executed,false);
  assert.equal(sawRequest.request_id,res.request.request_id);
});

test("Agent issue draft is invalid if the branch moved since the investigation",async()=>{
  const id="01234567-89ab-4def-8012-3456789abcde";
  let agentCalled=false;
  const flow=new GitHubUiFlowV2({
    authorizationService:{},executionContextStore:{},
    snapshotResolver:{resolver_version:"2",resolver_id:"git.test",provider:"github",supports:()=>true,
      async resolve(subject){return {snapshot_id:"x",subject,version:"b".repeat(40),observed_at:new Date().toISOString()}}},
    agentPipeline:{runtimeIdentity(){return{platform:"cominty",worker_agent_id:"a",guard_agent_id:"b",tool_scope:["github.read"]}},async run(){agentCalled=true}},
    getAgentDraft:()=>({repository:REPO,branch:BRANCH,investigated_sha:SHA,issue:{title:TITLE,body:BODY}})
  });
  await assert.rejects(flow.start({repository:REPO,target:{kind:"branch",ref:BRANCH},issue:{title:TITLE,body:BODY},draft_id:id}),/GitHub branch changed since the agent investigated/);
  assert.equal(agentCalled,false);
});
