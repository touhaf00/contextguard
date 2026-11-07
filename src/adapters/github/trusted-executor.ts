import {codeFixActionFromPlan, validateCodeFixApprovalAction, type CodeFixProviderResult} from "../../api/ui/github-code-fix.js";
import {canonicalJson} from "../../core/contracts.js";
import type {CodeFixSealedProposal} from "../../api/ui/code-fix-plan.js";
import { isMaintenanceAction, validateMaintenanceInput, fingerprintIssue, assertStateAction, type MaintenanceAction, type MaintenanceLockedInput, type MaintenanceIssueState } from './issue-maintenance.js';
import {
  TrustedExecutorStateErrorV2,
  validateTrustedExecutionAuthorizationV2
} from "../../core/trusted-executor.js";

import {
  resolveResourceSnapshotV2
} from "../../core/snapshot-resolver.js";

import type {
  TrustedExecutionAuthorizationV2,
  TrustedExecutorResultV2,
  TrustedExecutorV2
} from "../../core/trusted-executor.js";

import type {
  SnapshotResolverV2
} from "../../core/snapshot-resolver.js";

export const GITHUB_TRUSTED_EXECUTOR_VERSION =
  "2" as const;

export const GITHUB_CREATE_ISSUE_ACTION =
  "create_issue" as const;

const REPOSITORY =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const ALLOWED_PARAMETER_FIELDS =
  new Set([
    "title",
    "body"
  ]);

export type GitHubTrustedExecutorErrorCodeV2 =
  | "INVALID_CONFIG"
  | "INVALID_AUTHORIZATION"
  | "UNSUPPORTED_PROVIDER"
  | "UNSUPPORTED_RESOURCE"
  | "ACTION_NOT_ALLOWED"
  | "INVALID_PARAMETERS"
  | "EXECUTION_FAILED"
  | "INVALID_RESULT";

export class GitHubTrustedExecutorErrorV2
  extends Error {
  constructor(
    public readonly code:
      GitHubTrustedExecutorErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface GitHubCreateIssueInputV2 {
  title:
    string;

  body:
    string;
}

export interface GitHubCreateIssueResultV2 {
  issue_number:
    number;

  html_url:
    string;
}

export interface GitHubTrustedExecutionTransportV2 {
  createIssue(repository: string, input: GitHubCreateIssueInputV2): Promise<GitHubCreateIssueResultV2>;
  getIssueState?(repository: string, number: number): Promise<MaintenanceIssueState>;
  executeMaintenance?(repository: string, action: MaintenanceAction, input: MaintenanceLockedInput): Promise<GitHubCreateIssueResultV2>;
  findOpenIssuesWithTitle?(repository: string, title: string): Promise<number[]>;
}

export interface CodeFixTrustedExecutionOptions {
  loadPlan(digest: string): CodeFixSealedProposal | undefined;
  executeApprovedPlan(plan: CodeFixSealedProposal): Promise<CodeFixProviderResult>;
}

export interface GitHubTrustedExecutorOptionsV2 {
  transport:
    GitHubTrustedExecutionTransportV2;

  stateResolver:
    SnapshotResolverV2;

  allowedRepositories:
    readonly string[];

  codeFix?: CodeFixTrustedExecutionOptions;

  now?:
    () => Date;
}

export interface GitHubTrustedExecutorResultV2
  extends TrustedExecutorResultV2 {
  executor_version:
    typeof GITHUB_TRUSTED_EXECUTOR_VERSION;

  provider:
    "github";

  action:
    typeof GITHUB_CREATE_ISSUE_ACTION | MaintenanceAction | "propose_pr_fix";

  status:
    "EXECUTED";

  external_action_executed:
    true;

  repository:
    string;

  issue_number:
    number;

  html_url:
    string;

  pull_request?: {number:number;url:string;head_branch:string;commit_sha:string;draft:true};

  execution_snapshot_id:
    string;

  execution_snapshot_version:
    string;

  execution_state_checked_at:
    string;
}

function requiredString(
  value:
    unknown,

  label:
    string
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new GitHubTrustedExecutorErrorV2(
      "INVALID_PARAMETERS",
      `${label} must be a non-empty string.`
    );
  }

  return value.trim();
}

function normalizeRepository(
  value:
    unknown
): string {
  const repository =
    requiredString(
      value,
      "GitHub repository"
    );

  if (
    !REPOSITORY.test(
      repository
    )
  ) {
    throw new GitHubTrustedExecutorErrorV2(
      "UNSUPPORTED_RESOURCE",
      "GitHub repository must use owner/repository format."
    );
  }

  return repository;
}

function validateCreateIssueParameters(
  value:
    unknown
): GitHubCreateIssueInputV2 {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    throw new GitHubTrustedExecutorErrorV2(
      "INVALID_PARAMETERS",
      "GitHub create_issue parameters must be a JSON object."
    );
  }

  const object =
    value as
      Record<string, unknown>;

  for (
    const key
    of Object.keys(
      object
    )
  ) {
    if (
      !ALLOWED_PARAMETER_FIELDS.has(
        key
      )
    ) {
      throw new GitHubTrustedExecutorErrorV2(
        "INVALID_PARAMETERS",
        `GitHub create_issue contains unsupported parameter: ${key}.`
      );
    }
  }

  const title =
    requiredString(
      object.title,
      "title"
    );

  const body =
    requiredString(
      object.body,
      "body"
    );

  if (
    title.length >
      256
  ) {
    throw new GitHubTrustedExecutorErrorV2(
      "INVALID_PARAMETERS",
      "GitHub issue title exceeds the trusted executor limit."
    );
  }

  if (
    body.length >
      10_000
  ) {
    throw new GitHubTrustedExecutorErrorV2(
      "INVALID_PARAMETERS",
      "GitHub issue body exceeds the trusted executor limit."
    );
  }

  return {
    title,
    body
  };
}

function validateTransportResult(
  value:
    unknown
): GitHubCreateIssueResultV2 {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    throw new GitHubTrustedExecutorErrorV2(
      "INVALID_RESULT",
      "GitHub executor transport returned an invalid result."
    );
  }

  const object =
    value as
      Record<string, unknown>;

  if (
    !Number.isInteger(
      object.issue_number
    ) ||
    Number(
      object.issue_number
    ) <= 0
  ) {
    throw new GitHubTrustedExecutorErrorV2(
      "INVALID_RESULT",
      "GitHub executor transport returned an invalid issue number."
    );
  }

  if (
    typeof object.html_url !==
      "string" ||
    !object.html_url.startsWith(
      "https://github.com/"
    )
  ) {
    throw new GitHubTrustedExecutorErrorV2(
      "INVALID_RESULT",
      "GitHub executor transport returned an invalid issue URL."
    );
  }

  return {
    issue_number:
      Number(
        object.issue_number
      ),

    html_url:
      object.html_url
  };
}

export class GitHubTrustedExecutorV2
  implements TrustedExecutorV2 {
  private readonly transport:
    GitHubTrustedExecutionTransportV2;

  private readonly codeFix?: CodeFixTrustedExecutionOptions;

  private readonly stateResolver:
    SnapshotResolverV2;

  private readonly allowedRepositories:
    Set<string>;

  private readonly now:
    () => Date;

  constructor(
    options:
      GitHubTrustedExecutorOptionsV2
  ) {
    if (
      !options ||
      typeof options.transport
        ?.createIssue !==
        "function"
    ) {
      throw new GitHubTrustedExecutorErrorV2(
        "INVALID_AUTHORIZATION",
        "GitHub trusted executor requires an execution transport."
      );
    }

    this.transport =
      options.transport;

    this.codeFix = options.codeFix;

    if (
      !options.stateResolver
    ) {
      throw new GitHubTrustedExecutorErrorV2(
        "INVALID_CONFIG",
        "GitHub trusted executor requires a fresh-state resolver."
      );
    }

    this.stateResolver =
      options.stateResolver;

    this.allowedRepositories =
      new Set(
        options.allowedRepositories
          .map(
            repository =>
              normalizeRepository(
                repository
              ).toLowerCase()
          )
      );

    if (
      this.allowedRepositories
        .size === 0
    ) {
      throw new GitHubTrustedExecutorErrorV2(
        "UNSUPPORTED_RESOURCE",
        "GitHub trusted executor requires at least one allowed repository."
      );
    }

    this.now =
      options.now ??
      (() => new Date());
  }

  async execute(
    authorizationValue:
      TrustedExecutionAuthorizationV2
  ): Promise<
    GitHubTrustedExecutorResultV2
  > {
    let authorization:
      TrustedExecutionAuthorizationV2;

    const checkedAt =
      this.now()
        .toISOString();

    try {
      authorization =
        validateTrustedExecutionAuthorizationV2(
          authorizationValue
            ?.receipt,
          authorizationValue
            ?.consumption,
          {
            checkedAt
          }
        );
    } catch (error) {
      throw new GitHubTrustedExecutorErrorV2(
        "INVALID_AUTHORIZATION",
        error instanceof Error
          ? error.message
          : "Trusted execution authorization is invalid."
      );
    }

    const receipt =
      authorization.receipt;

    if (
      receipt.subject.provider !==
        "github"
    ) {
      throw new GitHubTrustedExecutorErrorV2(
        "UNSUPPORTED_PROVIDER",
        "GitHub trusted executor accepts only GitHub subjects."
      );
    }

    if (
      receipt.subject.resource_type !==
        "repository_ref"
    ) {
      throw new GitHubTrustedExecutorErrorV2(
        "UNSUPPORTED_RESOURCE",
        "GitHub trusted executor accepts only repository_ref subjects."
      );
    }

    const repository =
      normalizeRepository(
        receipt.subject
          .resource_id
      );

    if (
      !this.allowedRepositories
        .has(
          repository
            .toLowerCase()
        )
    ) {
      throw new GitHubTrustedExecutorErrorV2(
        "UNSUPPORTED_RESOURCE",
        "GitHub repository is not in the trusted executor allowlist."
      );
    }

    const action = receipt.proposed_action.action;
    if (receipt.proposed_action.namespace !== 'github' ||
        (action !== GITHUB_CREATE_ISSUE_ACTION && !isMaintenanceAction(action) && action !== 'propose_pr_fix')) {
      throw new GitHubTrustedExecutorErrorV2(
        'ACTION_NOT_ALLOWED',
        'GitHub trusted executor rejects this action.'
      );
    }
    let input: GitHubCreateIssueInputV2 | MaintenanceLockedInput | ReturnType<typeof validateCodeFixApprovalAction>;
    try {
      input = action === GITHUB_CREATE_ISSUE_ACTION
        ? validateCreateIssueParameters(receipt.proposed_action.parameters)
        : action === "propose_pr_fix"
          ? validateCodeFixApprovalAction(receipt.proposed_action.parameters)
          : validateMaintenanceInput(action as MaintenanceAction, receipt.proposed_action.parameters, true) as MaintenanceLockedInput;
    } catch (error) {
      throw new GitHubTrustedExecutorErrorV2('INVALID_PARAMETERS', error instanceof Error ? error.message : 'Invalid parameters.');
    }

    let executionSnapshot;

    try {
      executionSnapshot =
        await resolveResourceSnapshotV2(
          this.stateResolver,
          receipt.subject
        );
    } catch (error) {
      throw new TrustedExecutorStateErrorV2(
        "STATE_UNAVAILABLE",
        error instanceof Error
          ? `Fresh execution state could not be resolved: ${error.message}`
          : "Fresh execution state could not be resolved."
      );
    }

    if (
      executionSnapshot.version !==
        receipt.authorized_snapshot_version ||
      executionSnapshot.snapshot_id !==
        receipt.snapshot_id
    ) {
      throw new TrustedExecutorStateErrorV2(
        "STATE_CHANGED",
        "GitHub resource state changed after authorization."
      );
    }

    if (action === GITHUB_CREATE_ISSUE_ACTION && this.transport.findOpenIssuesWithTitle) {
      let duplicates: number[];
      try {
        duplicates = await this.transport.findOpenIssuesWithTitle(repository, (input as GitHubCreateIssueInputV2).title);
      } catch {
        throw new TrustedExecutorStateErrorV2('STATE_UNAVAILABLE', 'Fresh GitHub open issues are unavailable.');
      }
      if (duplicates.length > 0) {
        throw new TrustedExecutorStateErrorV2(
          'STATE_CHANGED',
          `GITHUB_DUPLICATE_ISSUE: an open issue with exactly this title already exists (#${duplicates[0]}). Nothing was written to GitHub.`
        );
      }
    }

    if (action !== GITHUB_CREATE_ISSUE_ACTION && action !== "propose_pr_fix") {
      if (!this.transport.getIssueState || !this.transport.executeMaintenance) {
        throw new GitHubTrustedExecutorErrorV2('ACTION_NOT_ALLOWED', 'Issue maintenance transport is unavailable.');
      }
      let current: MaintenanceIssueState;
      try { current = await this.transport.getIssueState(repository, (input as MaintenanceLockedInput).issue_number); }
      catch { throw new TrustedExecutorStateErrorV2('STATE_UNAVAILABLE', 'Fresh GitHub issue state is unavailable.'); }
      if (fingerprintIssue(current) !== (input as MaintenanceLockedInput).issue_fingerprint) {
        throw new TrustedExecutorStateErrorV2('STATE_CHANGED', 'GitHub issue changed since approval.');
      }
      try { assertStateAction(action as MaintenanceAction, current); }
      catch { throw new TrustedExecutorStateErrorV2('STATE_CHANGED', 'Issue state no longer supports this action.'); }
    }

    let rawResult: unknown;
    let codeFixResult: CodeFixProviderResult | undefined;
    try {
      if (action === 'propose_pr_fix') {
        if (!this.codeFix) throw new GitHubTrustedExecutorErrorV2('ACTION_NOT_ALLOWED','Code fix execution is not configured.');
        const locked = input as ReturnType<typeof validateCodeFixApprovalAction>;
        const plan = this.codeFix.loadPlan(locked.plan_digest);
        if (!plan || plan.repository.toLowerCase() !== repository.toLowerCase() ||
            plan.base_branch !== receipt.subject.selector?.ref ||
            plan.base_commit_sha !== receipt.authorized_snapshot_version ||
            canonicalJson(codeFixActionFromPlan(plan)) !== canonicalJson(locked)) {
          throw new GitHubTrustedExecutorErrorV2('INVALID_AUTHORIZATION', 'Code fix server plan is absent, changed or no longer owned by this authorization.');
        }
        codeFixResult = await this.codeFix.executeApprovedPlan(plan);
        rawResult = codeFixResult;
      } else {
        rawResult = action === GITHUB_CREATE_ISSUE_ACTION
          ? await this.transport.createIssue(repository, input as GitHubCreateIssueInputV2)
          : await this.transport.executeMaintenance!(repository, action as MaintenanceAction, input as MaintenanceLockedInput);
      }
    } catch (error) {
      throw new GitHubTrustedExecutorErrorV2(
        "EXECUTION_FAILED",
        error instanceof Error
          ? `GitHub execution failed: ${error.message}`
          : "GitHub execution failed."
      );
    }

    const result =
      validateTransportResult(
        rawResult
      );

    const completedAt =
      this.now()
        .toISOString();

    return {
      executor_version:
        GITHUB_TRUSTED_EXECUTOR_VERSION,

      receipt_id:
        receipt.receipt_id,

      consumption_id:
        authorization
          .consumption
          .consumption_id,

      provider:
        "github",

      action: action as typeof GITHUB_CREATE_ISSUE_ACTION | MaintenanceAction | "propose_pr_fix",

      ...(codeFixResult ? {pull_request:{number:codeFixResult.pr_number,url:codeFixResult.pr_url,
        head_branch:codeFixResult.head_branch,commit_sha:codeFixResult.commit_sha,draft:true as const}} : {}),

      status:
        "EXECUTED",

      external_action_executed:
        true,

      completed_at:
        completedAt,

      repository,

      issue_number:
        result.issue_number,

      html_url:
        result.html_url,

      execution_snapshot_id:
        executionSnapshot.snapshot_id,

      execution_snapshot_version:
        executionSnapshot.version,

      execution_state_checked_at:
        executionSnapshot.observed_at
    };
  }
}
