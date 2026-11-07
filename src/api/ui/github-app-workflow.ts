import { CodeFixGitHubApi, CodeFixGitHubInvestigator, CodeFixPlanStore, codeFixPlanPublicResponse } from './github-code-fix.js';
import { comintyIssueDraftChat as codeFixComintyAgent } from './agent-issue-draft.js';
import type { AuthorizationRequest } from '../../core/contracts.js';
import { GitHubRestExecutionTransportV2 } from '../../adapters/github/execution-transport.js';
import { GitHubIssuesExplorer } from './github-issues.js';
import { GitHubMaintenanceDiscovery, type MaintenanceDraft } from './agent-maintenance.js';
import { isMaintenanceAction, type MaintenanceAction } from '../../adapters/github/issue-maintenance.js';
import { GitHubAgentIssueDiscovery, comintyIssueDraftChat, validateAgentDraftInput } from './agent-issue-draft.js';
import { AgentIssueDraftStore } from './agent-issue-store.js';
import { GitHubUiFlowV2 } from './github-flow.js';
import { ContextGuardUiHttpV2 } from './http.js';
import { ComintyGenericAgentPipelineV2 } from './cominty-pipeline.js';
import { createGitHubAuthorizationPresetV2 } from '../../adapters/github/preset.js';
import { createGitHubSnapshotResolverV2 } from '../../adapters/github/snapshot-resolver.js';
import type { ContextGuardUiAccessGateV2 } from './access.js';
import type { ContextGuardUiSessionV2 } from './session.js';
import { GitHubAppAuthError, GitHubAppUserAuth } from './github-app-auth.js';
import { GitHubAppComintyBudget } from './github-app-budget.js';

interface Workspace {
  repository: string;
  http: ContextGuardUiHttpV2;
  discovery: GitHubAgentIssueDiscovery;
  drafts: AgentIssueDraftStore;
  maintenance: GitHubMaintenanceDiscovery;
  maintenanceDrafts: Map<string, { draft: MaintenanceDraft; expiresAt: number }>;
  codeFixApi: CodeFixGitHubApi;
  codeFixPlans: CodeFixPlanStore;
  codeFixInvestigator: CodeFixGitHubInvestigator;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GitHubAppAuthError(400, 'Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}
function field(value: unknown, key: string): string {
  const result = object(value)[key];
  if (typeof result !== 'string' || !result.trim()) {
    throw new GitHubAppAuthError(400, `${key} is required.`);
  }
  return result.trim();
}

export class GitHubAppUserWorkflow {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly sessions = new Map<string, Workspace>();
  private readonly receipts = new Map<string, Workspace>();
  private readonly issueExplorer: GitHubIssuesExplorer;
  private readonly budget = new GitHubAppComintyBudget(
    Number(process.env.CONTEXTGUARD_COMINTY_MAX_USER_HOUR ?? 50),
    Number(process.env.CONTEXTGUARD_COMINTY_MAX_GLOBAL_DAY ?? 300)
  );

  constructor(
    private readonly auth: GitHubAppUserAuth,
    private readonly access: ContextGuardUiAccessGateV2,
    private readonly executionEnabled: boolean
  ) {
    this.issueExplorer = new GitHubIssuesExplorer(auth);
  }

  private key(session: ContextGuardUiSessionV2, repository: string): string {
    return `${session.session_id}:${repository.toLowerCase()}`;
  }

  private async workspace(session: ContextGuardUiSessionV2, repository: string): Promise<Workspace> {
    const selected = await this.auth.requireRepository(session, repository);
    const key = this.key(session, selected.full_name);
    const existing = this.workspaces.get(key);
    if (existing) return existing;
    if (this.workspaces.size > 300) {
      throw new GitHubAppAuthError(503, 'Workspace capacity reached. Sign out and try again.');
    }
    const token = this.auth.tokenFor(session);
    const codeFixApi = new CodeFixGitHubApi({token});
    const codeFixPlans = new CodeFixPlanStore();
    const codeFixInvestigator = new CodeFixGitHubInvestigator(codeFixApi, codeFixComintyAgent);
    const preset = createGitHubAuthorizationPresetV2({
      token,
      ...(this.executionEnabled ? {
        execution: { token, allowedRepositories: [selected.full_name],codeFix: {
          loadPlan: digest => codeFixPlans.get(digest),
          executeApprovedPlan: async plan => {
            const latest = await this.auth.requireRepository(session,selected.full_name);
            if(!latest.can_create_pr) throw new GitHubAppAuthError(403,
              'Code fixes require Contents: write and Pull requests: write for this GitHub App installation. Update permissions and reconnect before attempting execution. No commit or PR was created.');
            return codeFixApi.executeApprovedPlan(plan);
          }
        } }
      } : {})
    });
    const drafts = new AgentIssueDraftStore(100, 60 * 60_000);
    const maintenanceDrafts = new Map<string, { draft: MaintenanceDraft; expiresAt: number }>();
    const maintenanceTransport = preset.executionTransport ?? new GitHubRestExecutionTransportV2({ token });
    const maintenance = new GitHubMaintenanceDiscovery(preset.client, maintenanceTransport,
      new GitHubIssuesExplorer(this.auth), comintyIssueDraftChat);
    const flow = new GitHubUiFlowV2({
      authorizationService: preset.service,
      executionContextStore: preset.contextStore,
      snapshotResolver: createGitHubSnapshotResolverV2(preset.client, { resolverId: 'github.github-app-ui' }),
      agentPipeline: new ComintyGenericAgentPipelineV2(preset.client, async (request:AuthorizationRequest,role:'WORKER'|'GUARD')=>{
        if(request.proposed_action.action!=='propose_pr_fix')return '';
        const digest=request.proposed_action.parameters.plan_digest;
        const plan=typeof digest==='string'?codeFixPlans.get(digest):undefined;
        if(!plan || plan.repository.toLowerCase()!==request.subject.resource_id.toLowerCase() ||
           plan.base_commit_sha!==request.snapshot.version.toLowerCase() ||
           request.subject.selector?.ref!==plan.base_branch) throw new Error('Code fix plan not owned by this user or state changed.');
        return codeFixApi.verificationEvidence(plan,role);
      }),
      getAgentDraft: id => drafts.get(id),
      issueReader: maintenanceTransport,
      getCodeFixPlan: digest => codeFixPlans.get(digest),
      verifyCodeFixPlan: async plan => { await codeFixApi.fresh(plan); },
      getMaintenanceDraft: id => {
        const item = maintenanceDrafts.get(id);
        if (!item) return undefined;
        if (item.expiresAt <= Date.now()) { maintenanceDrafts.delete(id); return undefined; }
        return structuredClone(item.draft);
      },
      explainMissingAgentDraft: id => drafts.lookup(id).status === 'expired' ? 'expired' : 'unknown',
      executionConfigured: Boolean(preset.executor) && this.executionEnabled
    });
    const result: Workspace = {
      repository: selected.full_name,
      http: new ContextGuardUiHttpV2(flow, preset.service, this.access),
      discovery: new GitHubAgentIssueDiscovery(preset.client, comintyIssueDraftChat),
      drafts,
      maintenance,
      maintenanceDrafts,
      codeFixApi,codeFixPlans,codeFixInvestigator
    };
    this.workspaces.set(key, result);
    return result;
  }

  async investigate(session: ContextGuardUiSessionV2, body: unknown): Promise<unknown> {
    const input = validateAgentDraftInput(body);
    const workspace = await this.workspace(session, input.repository);
    this.budget.reserve(session.principal.principal_id, 1);
    const draft = await workspace.discovery.generate(body);
    workspace.drafts.put(draft);
    return draft;
  }

  async investigateMaintenance(session: ContextGuardUiSessionV2, body: unknown): Promise<MaintenanceDraft> {
    const input = object(body);
    if (Object.keys(input).some(k => !['repository', 'branch', 'objective'].includes(k))) {
      throw new GitHubAppAuthError(400, 'Unknown maintenance investigation field.');
    }
    const repository = field(input, 'repository');
    const selected = await this.auth.requireRepository(session, repository);
    const branch = typeof input.branch === 'string' && input.branch.trim()
      ? input.branch.trim() : selected.default_branch;
    if (!/^[A-Za-z0-9_./-]{1,180}$/.test(branch) || branch.includes('..') || branch.startsWith('/')) {
      throw new GitHubAppAuthError(400, 'Invalid branch.');
    }
    const objective = typeof input.objective === 'string' && input.objective.trim()
      ? input.objective.trim() : 'Identify a useful maintenance action on an existing GitHub issue.';
    const workspace = await this.workspace(session, repository);
    this.budget.reserve(session.principal.principal_id, 1);
    const draft = await workspace.maintenance.investigate(session, selected.full_name, branch, objective);
    if (workspace.maintenanceDrafts.size >= 50) {
      const first = workspace.maintenanceDrafts.keys().next().value;
      if (first) workspace.maintenanceDrafts.delete(first);
    }
    workspace.maintenanceDrafts.set(draft.draft_id, { draft: structuredClone(draft), expiresAt: Date.now() + 60 * 60_000 });
    return draft;
  }

  async investigateAssistant(session: ContextGuardUiSessionV2, body: unknown): Promise<unknown> {
    const input = object(body);
    const allowed = ['repository','branch','objective','mode','requested_action','issue_number'];
    if (Object.keys(input).some(k => !allowed.includes(k))) {
      throw new GitHubAppAuthError(400, 'Unsupported assistant investigation field.');
    }
    const repository = field(input, 'repository');
    const choice = await this.auth.requireRepository(session, repository);
    const branch = typeof input.branch === 'string' && input.branch.trim()
      ? input.branch.trim() : choice.default_branch;
    if (!/^[A-Za-z0-9_./-]{1,180}$/.test(branch) || branch.includes('..') || branch.startsWith('/')) {
      throw new GitHubAppAuthError(400, 'Invalid branch.');
    }
    const mode = input.mode;
    if (mode !== 'auto' && mode !== 'guided') throw new GitHubAppAuthError(400, 'Choose auto or guided mode.');
    const requestedAction = input.requested_action;
    if ((mode === 'guided' && requestedAction !== 'create_issue' && !isMaintenanceAction(requestedAction)) ||
        (mode === 'auto' && requestedAction !== undefined)) {
      throw new GitHubAppAuthError(400, 'Invalid user-selected action.');
    }
    const issueNumber = input.issue_number;
    if (issueNumber !== undefined && (!Number.isSafeInteger(issueNumber) || Number(issueNumber) < 1 ||
        mode !== 'guided' || requestedAction === 'create_issue')) {
      throw new GitHubAppAuthError(400, 'Issue number can only constrain a guided maintenance action.');
    }
    const objective = typeof input.objective === 'string' && input.objective.trim()
      ? input.objective.trim() : 'Investigate the repository and propose one useful action supported by GitHub evidence.';
    if (objective.length < 10 || objective.length > 600) throw new GitHubAppAuthError(400, 'Objective must be 10–600 characters.');
    const workspace = await this.workspace(session, choice.full_name);
    this.budget.reserve(session.principal.principal_id, mode === 'auto' ? 2 : 1);
    const action = mode === 'auto'
      ? await workspace.maintenance.chooseMission(session, choice.full_name, objective)
      : requestedAction;
    if (action === 'create_issue') {
      const draft = await workspace.discovery.generate({ repository: choice.full_name, branch, objective });
      workspace.drafts.put(draft);
      return { kind: 'create_issue', mode, proposal: draft };
    }
    const draft = await workspace.maintenance.investigate(session, choice.full_name, branch, objective, {
      ...(mode === 'guided' ? { requestedAction: action as MaintenanceAction } : {}),
      ...(issueNumber !== undefined ? { issueNumber: Number(issueNumber) } : {})
    });
    if (workspace.maintenanceDrafts.size >= 50) {
      const first = workspace.maintenanceDrafts.keys().next().value;
      if (first) workspace.maintenanceDrafts.delete(first);
    }
    workspace.maintenanceDrafts.set(draft.draft_id, {draft: structuredClone(draft), expiresAt: Date.now() + 60 * 60_000});
    return { kind: 'maintenance', mode, proposal: draft };
  }

  async investigatePr(session: ContextGuardUiSessionV2, body: unknown): Promise<unknown> {
    const input=object(body);
    if(Object.keys(input).some(k=>!['repository','branch','issue_number','objective'].includes(k))) {
      throw new GitHubAppAuthError(400,'Unsupported code PR investigation field.');
    }
    const selected=await this.auth.requireRepository(session,field(input,'repository'));
    const branch=typeof input.branch==='string'&&input.branch.trim()?input.branch.trim():selected.default_branch;
    if(!/^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9_.\/-]{1,120}$/.test(branch))throw new GitHubAppAuthError(400,'Invalid PR base branch.');
    const suppliedIssue=input.issue_number!==undefined;
    if(suppliedIssue && (!Number.isSafeInteger(input.issue_number)||Number(input.issue_number)<1)) {
      throw new GitHubAppAuthError(400,'Issue number must be a positive integer when provided.');
    }
    const objective=typeof input.objective==='string'&&input.objective.trim()?input.objective.trim():
      'Inspect open issues and propose one safe minimal source-code fix with a draft pull request.';
    if(objective.length<10||objective.length>600)throw new GitHubAppAuthError(400,'Objective must be 10–600 characters.');
    const workspace=await this.workspace(session,selected.full_name);
    this.budget.reserve(session.principal.principal_id,suppliedIssue?2:3);
    let issueNumber:number;
    let selectedTitle:string|undefined;
    if(suppliedIssue) {
      issueNumber=Number(input.issue_number);
    } else {
      const observed=await this.issueExplorer.list(session,selected.full_name,'open');
      issueNumber=await workspace.codeFixInvestigator.chooseOpenIssue(
        selected.full_name,branch,objective,observed.issues
      );
      selectedTitle=observed.issues.find(issue=>issue.number===issueNumber)?.title;
      if(!selectedTitle)throw new GitHubAppAuthError(502,'Selected issue was not in the verified open-issue list.');
    }
    const plan=await workspace.codeFixInvestigator.propose(selected.full_name,branch,issueNumber,objective);
    workspace.codeFixPlans.put(plan);
    return {...codeFixPlanPublicResponse(plan),issue_selection:{
      mode:suppliedIssue?'USER_SPECIFIED':'COMINTY_SELECTED',issue_number:issueNumber,
      ...(selectedTitle?{issue_title:selectedTitle}:{})
    }};
  }

  async start(session: ContextGuardUiSessionV2, body: unknown, cookies?: string): Promise<unknown> {
    const repository = field(body, 'repository');
    const workspace = await this.workspace(session, repository);
    this.budget.reserve(session.principal.principal_id, 3);
    const response = await workspace.http.start(body, undefined, cookies) as {
      authorization?: { session?: { session_id?: string } }
    };
    const sessionId = response.authorization?.session?.session_id;
    if (sessionId) this.sessions.set(`${session.session_id}:${sessionId}`, workspace);
    return response;
  }

  private async forSession(session: ContextGuardUiSessionV2, body: unknown): Promise<Workspace> {
    this.auth.tokenFor(session);
    const sessionId = field(body, 'session_id');
    const workspace = this.sessions.get(`${session.session_id}:${sessionId}`);
    if (!workspace) throw new GitHubAppAuthError(404, 'Authorization session is not owned by this GitHub user.');
    await this.auth.requireRepository(session, workspace.repository);
    return workspace;
  }

  async approve(session: ContextGuardUiSessionV2, body: unknown, cookies?: string): Promise<unknown> {
    const workspace = await this.forSession(session, body);
    return workspace.http.approve(body, undefined, cookies);
  }
  async preflight(session: ContextGuardUiSessionV2, body: unknown, cookies?: string): Promise<unknown> {
    const workspace = await this.forSession(session, body);
    return workspace.http.preflight(body, undefined, cookies);
  }
  async issueReceipt(session: ContextGuardUiSessionV2, body: unknown, cookies?: string): Promise<unknown> {
    const workspace = await this.forSession(session, body);
    const result = await workspace.http.issueReceipt(body, undefined, cookies) as {
      receipt?: { receipt_id?: string }
    };
    const receiptId = result.receipt?.receipt_id;
    if (receiptId) this.receipts.set(`${session.session_id}:${receiptId}`, workspace);
    return result;
  }
  async execute(session: ContextGuardUiSessionV2, body: unknown, cookies?: string): Promise<unknown> {
    if (!this.executionEnabled) throw new GitHubAppAuthError(403, 'Real GitHub execution is disabled.');
    if (field(body, 'confirmation') !== 'EXECUTE') {
      throw new GitHubAppAuthError(400, 'Explicit confirmation=EXECUTE is required.');
    }
    const id = field(body, 'receipt_id');
    const key = `${session.session_id}:${id}`;
    const workspace = this.receipts.get(key);
    if (!workspace) throw new GitHubAppAuthError(404, 'Execution receipt is not owned by this GitHub user.');
    await this.auth.requireRepository(session, workspace.repository);
    this.receipts.delete(key);
    return workspace.http.execute(body, undefined, cookies);
  }
  disconnect(sessionId: string): void {
    this.auth.disconnect(sessionId);
    for (const map of [this.workspaces, this.sessions, this.receipts]) {
      for (const key of map.keys()) if (key.startsWith(`${sessionId}:`)) map.delete(key);
    }
  }
}
