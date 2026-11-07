import {
  authorizationRequestDigest,
  digestCanonicalJson
} from "./authorization-integrity.js";

import {
  evidenceProtocolDigest,
  validateEvidenceProtocolV2
} from "./evidence.js";

import {
  validateWorkerAssessmentV2,
  workerAssessmentDigest
} from "./assessment.js";

import {
  guardVerificationDigest,
  validateGuardVerificationV2
} from "./verification.js";

import {
  validateAuthorizationRequest
} from "./contracts.js";

import type {
  HumanApprovalRequirement
} from "./contracts.js";

export const AUTHORIZATION_DECISION_VERSION =
  "2" as const;

export const AUTHORIZATION_STATUSES = [
  "AWAITING_HUMAN_APPROVAL",
  "AUTHORIZED_BY_POLICY",
  "BLOCKED_NOT_READY",
  "STOPPED_UNKNOWN",
  "STOPPED_REVIEW",
  "BLOCKED_VERIFICATION"
] as const;

export type AuthorizationStatus =
  (
    typeof AUTHORIZATION_STATUSES
  )[number];

export interface AuthorizationDecisionV2 {
  decision_version:
    typeof AUTHORIZATION_DECISION_VERSION;

  request_digest: string;

  evidence_digest: string;

  worker_assessment_digest:
    string;

  guard_verification_digest:
    string;

  status:
    AuthorizationStatus;

  worker_decision:
    "READY" |
    "NOT_READY" |
    "UNKNOWN";

  guard_verdict:
    "PASS" |
    "REVIEW" |
    "FAIL";

  human_approval:
    HumanApprovalRequirement;

  human_approval_required:
    boolean;

  preflight_required:
    boolean;

  action_lock_eligible:
    boolean;

  policy_authorized:
    boolean;

  external_action_executed:
    false;

  reason: string;
}

export function evaluateAuthorizationDecisionV2(
  requestValue: unknown,
  evidenceValue: unknown,
  workerAssessmentValue: unknown,
  guardVerificationValue: unknown
): AuthorizationDecisionV2 {
  const request =
    validateAuthorizationRequest(
      requestValue
    );

  const evidence =
    validateEvidenceProtocolV2(
      evidenceValue,
      request
    );

  const worker =
    validateWorkerAssessmentV2(
      workerAssessmentValue,
      evidence,
      request
    );

  const guard =
    validateGuardVerificationV2(
      guardVerificationValue,
      worker,
      evidence,
      request
    );

  const requestDigest =
    authorizationRequestDigest(
      request
    );

  const evidenceDigest =
    evidenceProtocolDigest(
      evidence,
      request
    );

  const workerDigest =
    workerAssessmentDigest(
      worker,
      evidence,
      request
    );

  const guardDigest =
    guardVerificationDigest(
      guard,
      worker,
      evidence,
      request
    );

  const base = {
    decision_version:
      AUTHORIZATION_DECISION_VERSION,

    request_digest:
      requestDigest,

    evidence_digest:
      evidenceDigest,

    worker_assessment_digest:
      workerDigest,

    guard_verification_digest:
      guardDigest,

    worker_decision:
      worker.decision,

    guard_verdict:
      guard.verdict,

    human_approval:
      request.policy
        .human_approval,

    human_approval_required:
      request.policy
        .human_approval ===
        "REQUIRED",

    preflight_required:
      request.policy
        .preflight_required,

    external_action_executed:
      false as const
  };

  if (
    guard.verdict === "FAIL"
  ) {
    return {
      ...base,

      status:
        "BLOCKED_VERIFICATION",

      action_lock_eligible:
        false,

      policy_authorized:
        false,

      reason:
        "ContextGuard independently detected a material verification or integrity failure."
    };
  }

  if (
    guard.verdict === "REVIEW"
  ) {
    return {
      ...base,

      status:
        "STOPPED_REVIEW",

      action_lock_eligible:
        false,

      policy_authorized:
        false,

      reason:
        guard.retry_recommended
          ? "ContextGuard requires targeted evidence recovery before authorization can continue."
          : "ContextGuard requires review and no further automatic retry is authorized."
    };
  }

  if (
    worker.decision ===
      "NOT_READY"
  ) {
    return {
      ...base,

      status:
        "BLOCKED_NOT_READY",

      action_lock_eligible:
        false,

      policy_authorized:
        false,

      reason:
        "The Worker decision is NOT_READY and ContextGuard independently supports that decision."
    };
  }

  if (
    worker.decision ===
      "UNKNOWN"
  ) {
    return {
      ...base,

      status:
        "STOPPED_UNKNOWN",

      action_lock_eligible:
        false,

      policy_authorized:
        false,

      reason:
        "The Worker decision remains UNKNOWN and ContextGuard independently supports preserving that uncertainty."
    };
  }

  if (
    request.policy
      .human_approval ===
      "REQUIRED"
  ) {
    return {
      ...base,

      status:
        "AWAITING_HUMAN_APPROVAL",

      action_lock_eligible:
        true,

      policy_authorized:
        false,

      reason:
        "READY + PASS satisfies the deterministic safety gate, but policy requires explicit human approval."
    };
  }

  return {
    ...base,

    status:
      "AUTHORIZED_BY_POLICY",

    action_lock_eligible:
      true,

    policy_authorized:
      true,

    reason:
      request.policy
        .preflight_required
        ? "READY + PASS satisfies policy authorization. Pre-execution verification is still required."
        : "READY + PASS satisfies the deterministic authorization policy."
  };
}

export function authorizationDecisionDigest(
  requestValue: unknown,
  evidenceValue: unknown,
  workerAssessmentValue: unknown,
  guardVerificationValue: unknown
): string {
  return digestCanonicalJson(
    evaluateAuthorizationDecisionV2(
      requestValue,
      evidenceValue,
      workerAssessmentValue,
      guardVerificationValue
    )
  );
}
