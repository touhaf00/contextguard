import {
  validateAuthorizationRequest
} from "./contracts.js";

import {
  evaluateAuthorizationDecisionV2
} from "./decision.js";

import {
  createGenericActionLockV2
} from "./action-lock.js";

import {
  performResolvedGenericPreflightV2
} from "./resolved-preflight.js";

import {
  requestApprovalAttestationV2
} from "../approvals/provider.js";

import {
  readVerifiedAuditChainV2,
  validateAuditSinkV2
} from "../audit/sink.js";

import type {
  AuthorizationRequest
} from "./contracts.js";

import type {
  AuthorizationDecisionV2
} from "./decision.js";

import type {
  GenericActionLockV2
} from "./action-lock.js";

import type {
  ApprovalAttestationV2
} from "./approval-attestation.js";

import type {
  GenericPreflightResultV2
} from "./preflight.js";

import type {
  CurrentExecutionContextV2
} from "./resolved-preflight.js";

import type {
  SnapshotResolverRegistryV2
} from "./snapshot-resolver.js";

import type {
  ApprovalProviderV2
} from "../approvals/provider.js";

import type {
  AuditSinkV2
} from "../audit/sink.js";

export const AUTHORIZATION_LIFECYCLE_VERSION =
  "2" as const;

export type AuthorizationLifecycleStatusV2 =
  | AuthorizationDecisionV2["status"]
  | "REJECTED_BY_HUMAN"
  | "AUTHORIZED_FOR_EXECUTOR";

export interface AuthorizationLifecycleResultV2 {
  lifecycle_version:
    typeof AUTHORIZATION_LIFECYCLE_VERSION;

  status:
    AuthorizationLifecycleStatusV2;

  decision:
    AuthorizationDecisionV2;

  lock?:
    GenericActionLockV2;

  approval?:
    ApprovalAttestationV2;

  preflight?:
    GenericPreflightResultV2;

  execution_configured:
    false;

  external_action_executed:
    false;
}

export interface AuthorizationLifecycleOptionsV2 {
  intentId?: string;

  lockId?: string;

  lockCreatedAt?: string;

  approvalRequestedAt?: string;

  approvalId?: string;

  approvalTtlMs?: number;

  preflightCheckedAt?: string;
}

export interface RunAuthorizationLifecycleInputV2 {
  request:
    unknown;

  evidence:
    unknown;

  worker_assessment:
    unknown;

  guard_verification:
    unknown;

  current_context:
    CurrentExecutionContextV2;

  resolver_registry:
    SnapshotResolverRegistryV2;

  audit_sink:
    AuditSinkV2;

  approval_provider?:
    ApprovalProviderV2;

  options?:
    AuthorizationLifecycleOptionsV2;
}

export type AuthorizationLifecycleErrorCodeV2 =
  | "APPROVAL_PROVIDER_REQUIRED"
  | "AUDIT_VERIFICATION_FAILED";

export class AuthorizationLifecycleErrorV2
  extends Error {
  constructor(
    public readonly code:
      AuthorizationLifecycleErrorCodeV2,

    message: string
  ) {
    super(message);
  }
}

function subjectKey(
  request:
    AuthorizationRequest
): string {
  return [
    request.subject.provider,
    request.subject
      .resource_type,
    request.subject
      .resource_id
  ].join(":");
}

async function appendAudit(
  sink:
    AuditSinkV2,

  request:
    AuthorizationRequest,

  eventType:
    string,

  payload:
    Record<string, any>
): Promise<void> {
  await sink.append({
    event_type:
      eventType,

    subject_key:
      subjectKey(
        request
      ),

    payload
  });
}

async function verifyAudit(
  sink:
    AuditSinkV2
): Promise<void> {
  try {
    await readVerifiedAuditChainV2(
      sink
    );
  } catch (error) {
    throw new AuthorizationLifecycleErrorV2(
      "AUDIT_VERIFICATION_FAILED",

      error instanceof Error
        ? `Audit verification failed: ${error.message}`
        : "Audit verification failed."
    );
  }
}

function terminalResult(
  decision:
    AuthorizationDecisionV2
): AuthorizationLifecycleResultV2 {
  return {
    lifecycle_version:
      AUTHORIZATION_LIFECYCLE_VERSION,

    status:
      decision.status,

    decision,

    execution_configured:
      false,

    external_action_executed:
      false
  };
}

export async function runAuthorizationLifecycleV2(
  input:
    RunAuthorizationLifecycleInputV2
): Promise<AuthorizationLifecycleResultV2> {
  const request =
    validateAuthorizationRequest(
      input.request
    );

  const auditSink =
    validateAuditSinkV2(
      input.audit_sink
    );

  const options =
    input.options ?? {};

  const decision =
    evaluateAuthorizationDecisionV2(
      request,
      input.evidence,
      input.worker_assessment,
      input.guard_verification
    );

  await appendAudit(
    auditSink,
    request,
    "authorization.decision",
    {
      request_id:
        request.request_id,

      status:
        decision.status,

      worker_decision:
        decision.worker_decision,

      guard_verdict:
        decision.guard_verdict,

      action_lock_eligible:
        decision
          .action_lock_eligible,

      policy_authorized:
        decision
          .policy_authorized,

      external_action_executed:
        false
    }
  );

  if (
    !decision
      .action_lock_eligible
  ) {
    await appendAudit(
      auditSink,
      request,
      "authorization.stopped",
      {
        request_id:
          request.request_id,

        status:
          decision.status,

        reason:
          decision.reason,

        external_action_executed:
          false
      }
    );

    await verifyAudit(
      auditSink
    );

    return terminalResult(
      decision
    );
  }

  const lock =
    createGenericActionLockV2(
      request,
      input.evidence,
      input.worker_assessment,
      input.guard_verification,
      {
        intentId:
          options.intentId,

        lockId:
          options.lockId,

        createdAt:
          options.lockCreatedAt
      }
    );

  await appendAudit(
    auditSink,
    request,
    "action.locked",
    {
      request_id:
        request.request_id,

      lock_id:
        lock.lock_id,

      lock_fingerprint:
        lock.fingerprint,

      external_action_executed:
        false
    }
  );

  let approval:
    ApprovalAttestationV2 |
    undefined;

  const approvalRequirement =
    request.policy
      .human_approval;

  if (
    approvalRequirement ===
      "REQUIRED" &&
    !input.approval_provider
  ) {
    await appendAudit(
      auditSink,
      request,
      "approval.unavailable",
      {
        request_id:
          request.request_id,

        lock_id:
          lock.lock_id,

        reason:
          "Required approval provider is missing.",

        external_action_executed:
          false
      }
    );

    await verifyAudit(
      auditSink
    );

    throw new AuthorizationLifecycleErrorV2(
      "APPROVAL_PROVIDER_REQUIRED",
      "Authorization policy requires a human approval provider."
    );
  }

  if (
    approvalRequirement !==
      "NONE" &&
    input.approval_provider
  ) {
    try {
      approval =
        await requestApprovalAttestationV2(
          input.approval_provider,
          lock,
          {
            requestedAt:
              options
                .approvalRequestedAt,

            approvalId:
              options.approvalId,

            ttlMs:
              options
                .approvalTtlMs
          }
        );
    } catch (error) {
      await appendAudit(
        auditSink,
        request,
        "approval.failed",
        {
          request_id:
            request.request_id,

          lock_id:
            lock.lock_id,

          reason:
            error instanceof Error
              ? error.message
              : "Approval provider failed.",

          external_action_executed:
            false
        }
      );

      await verifyAudit(
        auditSink
      );

      throw error;
    }

    await appendAudit(
      auditSink,
      request,
      "approval.decided",
      {
        request_id:
          request.request_id,

        approval_id:
          approval.approval_id,

        lock_id:
          lock.lock_id,

        principal_id:
          approval.principal
            .principal_id,

        decision:
          approval.decision,

        external_action_executed:
          false
      }
    );

    if (
      approval.decision ===
        "REJECTED"
    ) {
      await appendAudit(
        auditSink,
        request,
        "authorization.stopped",
        {
          request_id:
            request.request_id,

          status:
            "REJECTED_BY_HUMAN",

          lock_id:
            lock.lock_id,

          approval_id:
            approval.approval_id,

          external_action_executed:
            false
        }
      );

      await verifyAudit(
        auditSink
      );

      return {
        lifecycle_version:
          AUTHORIZATION_LIFECYCLE_VERSION,

        status:
          "REJECTED_BY_HUMAN",

        decision,

        lock,

        approval,

        execution_configured:
          false,

        external_action_executed:
          false
      };
    }
  }

  let preflight:
    GenericPreflightResultV2;

  try {
    preflight =
      await performResolvedGenericPreflightV2(
        input.resolver_registry,
        lock,
        approval,
        input.current_context,
        {
          checkedAt:
            options
              .preflightCheckedAt
        }
      );
  } catch (error) {
    await appendAudit(
      auditSink,
      request,
      "preflight.failed",
      {
        request_id:
          request.request_id,

        lock_id:
          lock.lock_id,

        reason:
          error instanceof Error
            ? error.message
            : "Preflight failed.",

        external_action_executed:
          false
      }
    );

    await verifyAudit(
      auditSink
    );

    throw error;
  }

  await appendAudit(
    auditSink,
    request,
    "preflight.verified",
    {
      request_id:
        request.request_id,

      lock_id:
        lock.lock_id,

      observed_snapshot_version:
        preflight
          .observed_snapshot_version,

      approval_verified:
        preflight
          .approval_verified,

      execution_permitted_by_policy:
        preflight
          .execution_permitted_by_policy,

      execution_configured:
        false,

      external_action_executed:
        false
    }
  );

  await appendAudit(
    auditSink,
    request,
    "authorization.ready_for_executor",
    {
      request_id:
        request.request_id,

      lock_id:
        lock.lock_id,

      lock_fingerprint:
        lock.fingerprint,

      execution_configured:
        false,

      external_action_executed:
        false
    }
  );

  await verifyAudit(
    auditSink
  );

  return {
    lifecycle_version:
      AUTHORIZATION_LIFECYCLE_VERSION,

    status:
      "AUTHORIZED_FOR_EXECUTOR",

    decision,

    lock,

    ...(approval
      ? { approval }
      : {}),

    preflight,

    execution_configured:
      false,

    external_action_executed:
      false
  };
}
