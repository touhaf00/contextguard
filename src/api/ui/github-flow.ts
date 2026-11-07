import {codeFixActionFromPlan} from "./github-code-fix.js";
import {assertCodeFixPlanIntegrity,type CodeFixSealedProposal} from "./code-fix-plan.js";
import { isMaintenanceAction, validateMaintenanceInput, fingerprintIssue, assertStateAction, type MaintenanceAction, type MaintenanceLockedInput, type MaintenanceActionInput, type MaintenanceIssueState } from '../../adapters/github/issue-maintenance.js';
import {
  randomUUID
} from "node:crypto";

import {
  validateAuthorizationRequest,
  validateRuntimeIdentity
} from "../../core/contracts.js";

import {
  resolveResourceSnapshotV2
} from "../../core/snapshot-resolver.js";

import {
  applyTrustedExecutionContextApiV2
} from "../v2/execution-context.js";

import type {
  AuthorizationRequest,
  PolicyDefinition,
  ProposedAction,
  RuntimeIdentity,
  SubjectRef
} from "../../core/contracts.js";

import type {
  SnapshotResolverV2
} from "../../core/snapshot-resolver.js";

import type {
  GenericAuthorizationServiceV2,
  GenericAuthorizationServiceResponseV2
} from "../v2/service.js";

import type {
  TrustedExecutionContextStoreV2
} from "../v2/execution-context-store.js";

import type {
  TrustedExecutionContextApiResponseV2
} from "../v2/execution-context.js";

import type {
  GenericAgentPipelineV2,
  GenericAgentPipelineResultV2
} from "./cominty-pipeline.js";

const GITHUB_REPOSITORY =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const TARGET_KINDS = [
  "branch",
  "tag",
  "commit",
  "current_state"
] as const;

type GitHubUiTargetKind =
  (typeof TARGET_KINDS)[number];

const START_FIELDS =
  new Set([
    "repository",
    "target",
    "issue",
    "draft_id",
    "action",
    "parameters",
    "maintenance_draft_id",
    "pr_draft_id"
  ]);

const TARGET_FIELDS =
  new Set([
    "kind",
    "ref"
  ]);

const ISSUE_FIELDS =
  new Set([
    "title",
    "body"
  ]);

export type GitHubUiFlowErrorCodeV2 =
  | "INVALID_BODY"
  | "UNSUPPORTED_FIELD"
  | "INVALID_REPOSITORY"
  | "INVALID_TARGET"
  | "INVALID_ISSUE";

export class GitHubUiFlowErrorV2
  extends Error {
  constructor(
    public readonly code:
      GitHubUiFlowErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

interface GitHubUiStartRequestV2 {
  repository:
    string;

  target: {
    kind:
      GitHubUiTargetKind;

    ref?:
      string;
  };

  issue?: { title: string; body: string };
  draft_id?: string;
  action?: MaintenanceAction;
  parameters?: MaintenanceActionInput;
  maintenance_draft_id?: string;
  pr_draft_id?: string;
}

export interface GitHubUiStartResponseV2 {
  ui_api_version:
    "1";

  stage:
    | "STOPPED"
    | "AWAITING_HUMAN_APPROVAL"
    | "READY_FOR_PREFLIGHT";

  request:
    AuthorizationRequest;

  pipeline:
    GenericAgentPipelineResultV2;

  authorization:
    GenericAuthorizationServiceResponseV2;

  trusted_execution_context?:
    TrustedExecutionContextApiResponseV2;

  execution_configured:
    boolean;

  external_action_executed:
    false;
}

export interface GitHubUiFlowOptionsV2 {
  authorizationService:
    GenericAuthorizationServiceV2;

  executionContextStore:
    TrustedExecutionContextStoreV2;

  snapshotResolver:
    SnapshotResolverV2;

  agentPipeline:
    GenericAgentPipelineV2;

  executionConfigured?:
    boolean;

  now?:
    () => Date;

  requestId?:
    () => string;

  getAgentDraft?: (id: string) => {
    repository: string;
    branch: string;
    investigated_sha: string;
    issue: { title: string; body: string };
  } | undefined;

  explainMissingAgentDraft?: (id: string) => "expired" | "unknown";
  issueReader?: { getIssueState(repository: string, issueNumber: number): Promise<MaintenanceIssueState> };
  getCodeFixPlan?: (digest:string)=>CodeFixSealedProposal|undefined;
  verifyCodeFixPlan?: (plan:CodeFixSealedProposal)=>Promise<void>;
  getMaintenanceDraft?: (id: string) => {
    repository: string; branch: string; investigated_sha: string;
    action: MaintenanceAction; parameters: MaintenanceActionInput; issue_fingerprint: string;
  } | undefined;
}

function asObject(
  value:
    unknown,

  label:
    string
): Record<string, unknown> {
  if (
    typeof value !==
      "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new GitHubUiFlowErrorV2(
      "INVALID_BODY",
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

function rejectUnknownFields(
  object:
    Record<string, unknown>,

  allowed:
    ReadonlySet<string>,

  label:
    string
): void {
  for (
    const field
    of Object.keys(object)
  ) {
    if (
      !allowed.has(field)
    ) {
      throw new GitHubUiFlowErrorV2(
        "UNSUPPORTED_FIELD",
        `${label} contains unsupported field: ${field}.`
      );
    }
  }
}

function requiredString(
  object:
    Record<string, unknown>,

  field:
    string,

  label:
    string
): string {
  const value =
    object[field];

  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new GitHubUiFlowErrorV2(
      "INVALID_BODY",
      `${label}.${field} must be a non-empty string.`
    );
  }

  return value.trim();
}

function validateStartRequest(
  value:
    unknown
): GitHubUiStartRequestV2 {
  const body =
    asObject(
      value,
      "GitHubUiStartRequestV2"
    );

  rejectUnknownFields(
    body,
    START_FIELDS,
    "GitHubUiStartRequestV2"
  );

  const repository =
    requiredString(
      body,
      "repository",
      "GitHubUiStartRequestV2"
    );

  if (
    !GITHUB_REPOSITORY.test(
      repository
    )
  ) {
    throw new GitHubUiFlowErrorV2(
      "INVALID_REPOSITORY",
      "repository must use owner/repository format."
    );
  }

  const target =
    asObject(
      body.target,
      "GitHubUiStartRequestV2.target"
    );

  rejectUnknownFields(
    target,
    TARGET_FIELDS,
    "GitHubUiStartRequestV2.target"
  );

  const kind =
    requiredString(
      target,
      "kind",
      "GitHubUiStartRequestV2.target"
    );

  if (
    !TARGET_KINDS.includes(
      kind as GitHubUiTargetKind
    )
  ) {
    throw new GitHubUiFlowErrorV2(
      "INVALID_TARGET",
      "target.kind must be branch, tag, commit or current_state."
    );
  }

  let ref:
    string | undefined;

  if (
    kind ===
      "current_state"
  ) {
    if (
      target.ref !==
        undefined
    ) {
      throw new GitHubUiFlowErrorV2(
        "INVALID_TARGET",
        "current_state must not contain target.ref."
      );
    }
  } else {
    ref =
      requiredString(
        target,
        "ref",
        "GitHubUiStartRequestV2.target"
      );
  }

  if (body.pr_draft_id !== undefined) {
    if (typeof body.pr_draft_id !== 'string' || !/^[a-f0-9]{64}$/.test(body.pr_draft_id) ||
        kind !== 'branch' || body.issue !== undefined || body.draft_id !== undefined ||
        body.action !== undefined || body.parameters !== undefined || body.maintenance_draft_id !== undefined) {
      throw new GitHubUiFlowErrorV2('INVALID_BODY','Code fix start accepts only the server-owned plan digest, repository and base branch.');
    }
    return {repository,target:{kind:'branch',ref},pr_draft_id:body.pr_draft_id};
  }

  if (body.action !== undefined) {
    if (!isMaintenanceAction(body.action) || body.issue !== undefined || body.draft_id !== undefined) {
      throw new GitHubUiFlowErrorV2('INVALID_BODY', 'Invalid maintenance action format.');
    }
    if (kind !== 'branch') {
      throw new GitHubUiFlowErrorV2('INVALID_TARGET', 'Maintenance actions require a branch target.');
    }
    let parameters: MaintenanceActionInput;
    try { parameters = validateMaintenanceInput(body.action, body.parameters) as MaintenanceActionInput; }
    catch (error) { throw new GitHubUiFlowErrorV2('INVALID_ISSUE', error instanceof Error ? error.message : 'Invalid maintenance action.'); }
    const maintenanceId = body.maintenance_draft_id;
    if (maintenanceId !== undefined && (typeof maintenanceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(maintenanceId))) {
      throw new GitHubUiFlowErrorV2('INVALID_BODY', 'Invalid maintenance draft id.');
    }
    return {
      repository,
      target: { kind: 'branch', ref },
      action: body.action,
      parameters,
      ...(maintenanceId ? { maintenance_draft_id: maintenanceId as string } : {})
    };
  }
  if (body.parameters !== undefined || body.maintenance_draft_id !== undefined) {
    throw new GitHubUiFlowErrorV2('INVALID_BODY', 'Maintenance parameters require a maintenance action.');
  }

  const issue =
    asObject(
      body.issue,
      "GitHubUiStartRequestV2.issue"
    );

  rejectUnknownFields(
    issue,
    ISSUE_FIELDS,
    "GitHubUiStartRequestV2.issue"
  );

  const title =
    requiredString(
      issue,
      "title",
      "GitHubUiStartRequestV2.issue"
    );

  if (
    title.length >
      256
  ) {
    throw new GitHubUiFlowErrorV2(
      "INVALID_ISSUE",
      "GitHub issue title must not exceed 256 characters."
    );
  }

  const issueBody =
    requiredString(
      issue,
      "body",
      "GitHubUiStartRequestV2.issue"
    );

  if (
    issueBody.length >
      10_000
  ) {
    throw new GitHubUiFlowErrorV2(
      "INVALID_ISSUE",
      "GitHub issue body must not exceed 10000 characters."
    );
  }

  const draftId = body.draft_id;
  if (draftId !== undefined &&
      (typeof draftId !== "string" || !/^[0-9a-f-]{36}$/i.test(draftId))) {
    throw new GitHubUiFlowErrorV2("INVALID_BODY", "Invalid agent draft id.");
  }

  return {
    repository,
    ...(draftId ? { draft_id: draftId as string } : {}),

    target: {
      kind:
        kind as
          GitHubUiTargetKind,

      ...(ref
        ? {
            ref
          }
        : {})
    },

    issue: {
      title,
      body:
        issueBody
    }
  };
}

function createSubject(
  input:
    GitHubUiStartRequestV2
): SubjectRef {
  return {
    provider:
      "github",

    resource_type:
      "repository_ref",

    resource_id:
      input.repository,

    selector: {
      kind:
        input.target.kind,

      ...(input.target.ref
        ? {
            ref:
              input.target.ref
          }
        : {})
    }
  };
}

function createProposedAction(
  input:
    GitHubUiStartRequestV2
): ProposedAction {
  return {
    namespace:
      "github",

    action:
      "create_issue",

    parameters: {
      title:
        input.issue!.title,

      body:
        input.issue!.body
    }
  };
}

function createPolicy(action?: MaintenanceAction | 'propose_pr_fix'): PolicyDefinition {
  if(action==='propose_pr_fix') return {
    policy_id:'github.ui.propose_pr_fix', version:'1.0.0',
    name:'Protected, reviewable draft PR with exact code patch',
    objective:'Authorize only the exact previously server-sealed code diff, on a new branch, as a draft pull request after human approval and fresh provider-state verification.',
    decision_rules:[
      'Verify the issue is open, correctly identified and relevant to the proposed bounded code patch.',
      'Review GitHub file contents and provider SHA evidence from the server; each patch must refer to a verified, unchanged Git blob.',
      'Only authorize a proposed DRAFT PR for human code review, not a proven bug fix or automatic merge. Do not invent successful tests.',
      'Never allow changes to secrets, workflow configuration or paths beyond the server-locked file list.',
      'The same issue, branch commit, file bytes and exact proposed code modification must be rechecked by deterministic server code after human approval and before external execution.'
    ],
    human_approval:'REQUIRED',preflight_required:true,freshness:{max_age_seconds:900}
  };
  if (action) return {
    policy_id: `github.ui.${action}`,
    version: '1.1.0',
    name: `ContextGuard authorized issue maintenance: ${action}`,
    objective: 'Verify actual GitHub issue evidence and authorize only the exact selected issue change after human approval and fresh provider-state verification.',
    decision_rules: [
      'The proposed action must target the observed issue number of the authorized repository.',
      'The exact issue content and state, including the issue fingerprint, must remain unchanged between proposal and execution.',
      'Check factual claims in any proposed comment or edit against supplied evidence; preserve UNKNOWN if not verifiable.',
      'Never assume an issue is resolved solely because a model suggests closing it.'
    ],
    human_approval: 'REQUIRED',
    preflight_required: true,
    freshness: { max_age_seconds: 900 }
  };

  return {
    policy_id:
      "github.ui.create-issue",

    version:
      "1.1.0",

    name:
      "ContextGuard UI GitHub issue creation",

    objective:
      "Authorize an exact GitHub issue creation only after independent evidence verification, explicit human approval and fresh provider-state verification.",

    decision_rules: [
      "The requested GitHub repository reference must be independently verified against the exact server-trusted snapshot supplied for this assessment.",
      "Currently observable GitHub provider evidence must not contradict proceeding with the proposed issue creation.",
      "Factual claims in the issue body must be corroborated by repository evidence; do not mistake CI success for deployment. Preserve UNKNOWN when a decision-critical claim is unverified."
    ],

    human_approval:
      "REQUIRED",

    preflight_required:
      true,

    freshness: {
      max_age_seconds:
        900
    }
  };
}

export class GitHubUiFlowV2 {
  private readonly service:
    GenericAuthorizationServiceV2;

  private readonly contextStore:
    TrustedExecutionContextStoreV2;

  private readonly snapshotResolver:
    SnapshotResolverV2;

  private readonly pipeline:
    GenericAgentPipelineV2;

  private readonly executionConfigured:
    boolean;

  private readonly now:
    () => Date;

  private readonly requestId:
    () => string;

  private readonly getAgentDraft?: GitHubUiFlowOptionsV2["getAgentDraft"];
  private readonly explainMissingAgentDraft?: GitHubUiFlowOptionsV2["explainMissingAgentDraft"];
  private readonly issueReader?: GitHubUiFlowOptionsV2['issueReader'];
  private readonly getMaintenanceDraft?: GitHubUiFlowOptionsV2['getMaintenanceDraft'];
  private readonly getCodeFixPlan?: GitHubUiFlowOptionsV2['getCodeFixPlan'];
  private readonly verifyCodeFixPlan?: GitHubUiFlowOptionsV2['verifyCodeFixPlan'];

  constructor(
    options:
      GitHubUiFlowOptionsV2
  ) {
    this.service =
      options.authorizationService;

    this.contextStore =
      options.executionContextStore;

    this.snapshotResolver =
      options.snapshotResolver;

    this.pipeline =
      options.agentPipeline;

    this.executionConfigured =
      options.executionConfigured ??
      false;

    this.now =
      options.now ??
      (() => new Date());

    this.requestId =
      options.requestId ??
      randomUUID;

    this.getAgentDraft = options.getAgentDraft;
    this.explainMissingAgentDraft = options.explainMissingAgentDraft;
    this.issueReader = options.issueReader;
    this.getMaintenanceDraft = options.getMaintenanceDraft;
    this.getCodeFixPlan=options.getCodeFixPlan;
    this.verifyCodeFixPlan=options.verifyCodeFixPlan;
  }

  async start(
    bodyValue:
      unknown
  ): Promise<
    GitHubUiStartResponseV2
  > {
    const input =
      validateStartRequest(
        bodyValue
      );

    const trustedDraft = input.draft_id
      ? this.getAgentDraft?.(input.draft_id)
      : undefined;
    if (input.draft_id) {
      if (!trustedDraft) {
        const reason = this.explainMissingAgentDraft?.(input.draft_id);
        throw new GitHubUiFlowErrorV2(
          "INVALID_ISSUE",
          reason === "expired"
            ? "The agent draft has expired. Generate a fresh draft; no GitHub write occurred."
            : reason === "unknown"
              ? "This server has no record of that agent draft (it may predate a restart). Generate a fresh draft; no GitHub write occurred."
              : "Agent draft expired, changed, or did not match the exact issue. Generate a fresh draft."
        );
      }
      const changed: string[] = [];
      if (trustedDraft.repository !== input.repository) changed.push("repository");
      if (trustedDraft.branch !== input.target.ref || input.target.kind !== "branch") changed.push("branch");
      if (trustedDraft.issue.title !== input.issue?.title) changed.push("title");
      if (trustedDraft.issue.body !== input.issue?.body) changed.push("body");
      if (changed.length > 0) {
        throw new GitHubUiFlowErrorV2(
          "INVALID_ISSUE",
          `The submitted issue does not match the agent draft (changed: ${changed.join(", ")}). Generate a fresh draft; no GitHub write occurred.`
        );
      }
    }

    const maintenanceDraft = input.maintenance_draft_id
      ? this.getMaintenanceDraft?.(input.maintenance_draft_id)
      : undefined;
    if (input.maintenance_draft_id) {
      if (!maintenanceDraft) throw new GitHubUiFlowErrorV2('INVALID_ISSUE', 'Maintenance draft expired or is not owned by this session.');
      if (maintenanceDraft.repository !== input.repository ||
          maintenanceDraft.branch !== input.target.ref ||
          maintenanceDraft.action !== input.action ||
          JSON.stringify(maintenanceDraft.parameters) !== JSON.stringify(input.parameters)) {
        throw new GitHubUiFlowErrorV2('INVALID_ISSUE', 'Agent maintenance action was edited. Generate a new draft.');
      }
    }

    const codeFixPlan = input.pr_draft_id ? this.getCodeFixPlan?.(input.pr_draft_id) : undefined;
    if (input.pr_draft_id) {
      if (!codeFixPlan || !this.verifyCodeFixPlan) throw new GitHubUiFlowErrorV2('INVALID_ISSUE', 'Code PR proposal expired or does not belong to this GitHub session.');
      try {assertCodeFixPlanIntegrity(codeFixPlan);}catch {throw new GitHubUiFlowErrorV2('INVALID_ISSUE','Code PR proposal integrity failed.');}
      if (codeFixPlan.repository!==input.repository || codeFixPlan.base_branch!==input.target.ref ||
          codeFixPlan.plan_digest!==input.pr_draft_id) {
        throw new GitHubUiFlowErrorV2('INVALID_TARGET', 'Code PR proposal repository or branch differs.');
      }
      try {await this.verifyCodeFixPlan(codeFixPlan);}catch(error) {
        throw new GitHubUiFlowErrorV2('INVALID_TARGET', error instanceof Error ? error.message : 'Code PR target changed.');
      }
    }

    const subject =
      createSubject(
        input
      );

    const snapshot =
      await resolveResourceSnapshotV2(
        this.snapshotResolver,
        subject
      );

    if (codeFixPlan && snapshot.version.toLowerCase()!==codeFixPlan.base_commit_sha) {
      throw new GitHubUiFlowErrorV2('INVALID_TARGET', 'Base branch changed since PR proposal.');
    }
    if (trustedDraft &&
        snapshot.version.toLowerCase() !== trustedDraft.investigated_sha) {
      throw new GitHubUiFlowErrorV2(
        "INVALID_TARGET",
        "GitHub branch changed since the agent investigated. Generate a new draft."
      );
    }

    let proposedAction: ProposedAction;
    if (codeFixPlan) {
      proposedAction = {namespace:'github',action:'propose_pr_fix',parameters:{...codeFixActionFromPlan(codeFixPlan)}};
    } else if (input.action && input.parameters) {
      if (!this.issueReader) throw new GitHubUiFlowErrorV2('INVALID_ISSUE', 'Trusted issue-state reader is unavailable.');
      let current: MaintenanceIssueState;
      try { current = await this.issueReader.getIssueState(input.repository, input.parameters.issue_number); }
      catch { throw new GitHubUiFlowErrorV2('INVALID_ISSUE', 'Could not independently verify the issue from GitHub.'); }
      const fingerprint = fingerprintIssue(current);
      if (maintenanceDraft && (maintenanceDraft.investigated_sha !== snapshot.version.toLowerCase() ||
          maintenanceDraft.issue_fingerprint !== fingerprint)) {
        throw new GitHubUiFlowErrorV2('INVALID_TARGET', 'Repository or issue changed since agent investigation. Generate a new proposal.');
      }
      try { assertStateAction(input.action, current); }
      catch (error) { throw new GitHubUiFlowErrorV2('INVALID_ISSUE', error instanceof Error ? error.message : 'Invalid issue state.'); }
      const params: MaintenanceLockedInput = { ...input.parameters, issue_fingerprint: fingerprint };
      proposedAction = { namespace: 'github', action: input.action, parameters: { ...params } };
    } else {
      proposedAction = createProposedAction(input);
    }

    const policy = createPolicy(codeFixPlan ? 'propose_pr_fix' : input.action);

    const runtime:
      RuntimeIdentity =
      validateRuntimeIdentity(
        this.pipeline
          .runtimeIdentity(),
        "GitHubUiRuntimeIdentity"
      );

    const request =
      validateAuthorizationRequest({
        request_id:
          this.requestId(),

        subject,

        snapshot,

        proposed_action:
          proposedAction,

        policy,

        runtime,

        requested_at:
          this.now()
            .toISOString(),

        context: {
          surface:
            "contextguard_ui",

          operation: codeFixPlan ? 'github_draft_pr_code_fix' : input.action ? 'github_issue_maintenance' : 'github_issue_creation',
          ...(codeFixPlan ? {code_fix_plan_digest:codeFixPlan.plan_digest, proposed_by:'cominty_managed_agent'} : {}),
          ...(input.maintenance_draft_id ? {
            maintenance_draft_id: input.maintenance_draft_id,
            proposed_by: 'cominty_managed_agent'
          } : {}),
          ...(input.draft_id ? {
            agent_issue_draft_id: input.draft_id,
            proposed_by: "cominty_managed_agent"
          } : {})
        }
      });

    const pipeline =
      await this.pipeline.run(
        request
      );

    const authorization =
      this.service.authorize({
        request,

        evidence:
          pipeline.evidence,

        worker_assessment:
          pipeline.worker_assessment,

        guard_verification:
          pipeline.guard_verification
      });

    let trustedExecutionContext:
      TrustedExecutionContextApiResponseV2 |
      undefined;

    if (
      authorization.session
    ) {
      trustedExecutionContext =
        applyTrustedExecutionContextApiV2(
          {
            session_id:
              authorization
                .session
                .session_id,

            proposed_action:
              proposedAction,

            policy,

            runtime
          },
          this.service.sessions,
          this.contextStore
        );
    }

    const stage:
      GitHubUiStartResponseV2[
        "stage"
      ] =
      !authorization.session
        ? "STOPPED"
        : authorization
            .session
            .session_state ===
              "AWAITING_HUMAN_APPROVAL"
          ? "AWAITING_HUMAN_APPROVAL"
          : "READY_FOR_PREFLIGHT";

    console.log(
      "[ui-v2][diagnostic] Authorization",
      {
        stage,

        has_action_lock:
          Boolean(
            authorization.lock
          ),

        has_session:
          Boolean(
            authorization.session
          ),

        session_state:
          authorization.session
            ? authorization
                .session
                .session_state
            : null
      }
    );

    return {
      ui_api_version:
        "1",

      stage,

      request,

      pipeline,

      authorization,

      ...(trustedExecutionContext
        ? {
            trusted_execution_context:
              trustedExecutionContext
          }
        : {}),

      execution_configured:
        this.executionConfigured,

      external_action_executed:
        false
    };
  }
}
