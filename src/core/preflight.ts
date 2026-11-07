import {
  canonicalJson,
  sameSubject,
  validatePolicyDefinition,
  validateProposedAction,
  validateResourceSnapshot,
  validateRuntimeIdentity
} from "./contracts.js";

import {
  verifyGenericActionLockV2
} from "./action-lock.js";

import {
  validateApprovalAttestationV2
} from "./approval-attestation.js";

import type {
  PolicyDefinition,
  ProposedAction,
  ResourceSnapshot,
  RuntimeIdentity
} from "./contracts.js";

import type {
  GenericActionLockV2
} from "./action-lock.js";

import type {
  ApprovalAttestationV2
} from "./approval-attestation.js";

export const GENERIC_PREFLIGHT_VERSION =
  "2" as const;

export type GenericPreflightErrorCode =
  | "INVALID_LOCK"
  | "INVALID_TIME"
  | "INVALID_OBSERVATION"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_NOT_ALLOWED"
  | "APPROVAL_INVALID"
  | "APPROVAL_REJECTED"
  | "APPROVAL_EXPIRED"
  | "SUBJECT_CHANGED"
  | "SNAPSHOT_CHANGED"
  | "SNAPSHOT_NOT_FRESH"
  | "ACTION_CHANGED"
  | "POLICY_CHANGED"
  | "RUNTIME_CHANGED";

export class GenericPreflightError
  extends Error {
  constructor(
    public readonly code:
      GenericPreflightErrorCode,

    message: string
  ) {
    super(message);
  }
}

export interface GenericPreflightObservationV2 {
  snapshot:
    ResourceSnapshot;

  proposed_action:
    ProposedAction;

  policy:
    PolicyDefinition;

  runtime:
    RuntimeIdentity;
}

export interface GenericPreflightResultV2 {
  preflight_version:
    typeof GENERIC_PREFLIGHT_VERSION;

  lock_id: string;
  lock_fingerprint: string;

  approval_id?: string;

  status:
    "PRE_EXECUTION_VERIFIED";

  approval_requirement:
    "REQUIRED" |
    "OPTIONAL" |
    "NONE";

  approval_verified:
    boolean;

  subject_integrity_verified:
    true;

  snapshot_integrity_verified:
    true;

  action_integrity_verified:
    true;

  policy_integrity_verified:
    true;

  runtime_integrity_verified:
    true;

  observed_snapshot_version:
    string;

  execution_permitted_by_policy:
    true;

  execution_configured:
    false;

  external_action_executed:
    false;

  checked_at:
    string;
}

export interface GenericPreflightOptions {
  checkedAt?: string;
}

function asObject(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new GenericPreflightError(
      "INVALID_OBSERVATION",
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

function normalizeTimestamp(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new GenericPreflightError(
      "INVALID_TIME",
      `${label} must be a non-empty timestamp.`
    );
  }

  const parsed =
    Date.parse(value);

  if (
    !Number.isFinite(parsed)
  ) {
    throw new GenericPreflightError(
      "INVALID_TIME",
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

export function validateGenericPreflightObservationV2(
  value: unknown
): GenericPreflightObservationV2 {
  const object =
    asObject(
      value,
      "GenericPreflightObservationV2"
    );

  try {
    return {
      snapshot:
        validateResourceSnapshot(
          object.snapshot,
          "GenericPreflightObservationV2.snapshot"
        ),

      proposed_action:
        validateProposedAction(
          object.proposed_action,
          "GenericPreflightObservationV2.proposed_action"
        ),

      policy:
        validatePolicyDefinition(
          object.policy,
          "GenericPreflightObservationV2.policy"
        ),

      runtime:
        validateRuntimeIdentity(
          object.runtime,
          "GenericPreflightObservationV2.runtime"
        )
    };
  } catch (error) {
    throw new GenericPreflightError(
      "INVALID_OBSERVATION",
      error instanceof Error
        ? error.message
        : "Invalid preflight observation."
    );
  }
}

function sameCanonicalValue(
  left: unknown,
  right: unknown
): boolean {
  return (
    canonicalJson(left) ===
    canonicalJson(right)
  );
}

function snapshotStateMatches(
  locked:
    ResourceSnapshot,

  observed:
    ResourceSnapshot
): boolean {
  if (
    !sameSubject(
      locked.subject,
      observed.subject
    )
  ) {
    return false;
  }

  if (
    locked.version !==
      observed.version
  ) {
    return false;
  }

  if (
    locked.integrity_hash !==
      undefined
  ) {
    if (
      observed.integrity_hash ===
        undefined
    ) {
      return false;
    }

    if (
      locked.integrity_hash !==
        observed.integrity_hash
    ) {
      return false;
    }
  }

  return true;
}

function validateApprovalForPreflight(
  lock:
    GenericActionLockV2,

  attestationValue:
    unknown,

  checkedAtMs:
    number
): {
  approval?: ApprovalAttestationV2;
  approvalVerified: boolean;
  freshnessReferenceMs: number;
} {
  const requirement =
    lock.intent
      .request
      .policy
      .human_approval;

  const hasAttestation =
    attestationValue !==
      undefined &&
    attestationValue !==
      null;

  if (
    requirement ===
      "NONE"
  ) {
    if (hasAttestation) {
      throw new GenericPreflightError(
        "APPROVAL_NOT_ALLOWED",
        "Policy NONE does not accept a human approval attestation."
      );
    }

    return {
      approvalVerified:
        false,

      freshnessReferenceMs:
        Date.parse(
          lock.created_at
        )
    };
  }

  if (
    requirement ===
      "REQUIRED" &&
    !hasAttestation
  ) {
    throw new GenericPreflightError(
      "APPROVAL_REQUIRED",
      "Explicit human approval is required before execution."
    );
  }

  if (!hasAttestation) {
    return {
      approvalVerified:
        false,

      freshnessReferenceMs:
        Date.parse(
          lock.created_at
        )
    };
  }

  let approval:
    ApprovalAttestationV2;

  try {
    approval =
      validateApprovalAttestationV2(
        attestationValue,
        lock
      );
  } catch (error) {
    throw new GenericPreflightError(
      "APPROVAL_INVALID",
      error instanceof Error
        ? error.message
        : "Approval attestation is invalid."
    );
  }

  if (
    approval.decision ===
      "REJECTED"
  ) {
    throw new GenericPreflightError(
      "APPROVAL_REJECTED",
      "Human approval explicitly rejected this ActionLock."
    );
  }

  const expiresAt =
    approval
      .approval_expires_at;

  if (!expiresAt) {
    throw new GenericPreflightError(
      "APPROVAL_INVALID",
      "Approved attestation is missing its expiration."
    );
  }

  if (
    checkedAtMs >=
    Date.parse(
      expiresAt
    )
  ) {
    throw new GenericPreflightError(
      "APPROVAL_EXPIRED",
      "Human approval expired before pre-execution verification."
    );
  }

  return {
    approval,

    approvalVerified:
      true,

    freshnessReferenceMs:
      Date.parse(
        approval.decided_at
      )
  };
}

export function performGenericPreflightV2(
  lock:
    GenericActionLockV2,

  attestationValue:
    unknown,

  observationValue:
    unknown,

  options:
    GenericPreflightOptions = {}
): GenericPreflightResultV2 {
  if (
    !verifyGenericActionLockV2(
      lock
    )
  ) {
    throw new GenericPreflightError(
      "INVALID_LOCK",
      "GenericActionLockV2 failed integrity verification."
    );
  }

  const checkedAt =
    normalizeTimestamp(
      options.checkedAt ??
        new Date().toISOString(),
      "GenericPreflightResultV2.checked_at"
    );

  const checkedAtMs =
    Date.parse(
      checkedAt
    );

  if (
    checkedAtMs <
    Date.parse(
      lock.created_at
    )
  ) {
    throw new GenericPreflightError(
      "INVALID_TIME",
      "Preflight cannot occur before ActionLock creation."
    );
  }

  const observation =
    validateGenericPreflightObservationV2(
      observationValue
    );

  const observedAtMs =
    Date.parse(
      observation
        .snapshot
        .observed_at
    );

  if (
    observedAtMs >
    checkedAtMs
  ) {
    throw new GenericPreflightError(
      "INVALID_OBSERVATION",
      "Preflight snapshot cannot be observed after the preflight check time."
    );
  }

  const approvalState =
    validateApprovalForPreflight(
      lock,
      attestationValue,
      checkedAtMs
    );

  const lockedRequest =
    lock.intent.request;

  if (
    !sameSubject(
      observation
        .snapshot
        .subject,

      lockedRequest
        .subject
    )
  ) {
    throw new GenericPreflightError(
      "SUBJECT_CHANGED",
      "The pre-execution resource subject differs from the approved ActionLock."
    );
  }

  if (
    !snapshotStateMatches(
      lockedRequest.snapshot,
      observation.snapshot
    )
  ) {
    throw new GenericPreflightError(
      "SNAPSHOT_CHANGED",
      "The resource state changed after the ActionLock was created."
    );
  }

  if (
    observedAtMs <
    approvalState
      .freshnessReferenceMs
  ) {
    throw new GenericPreflightError(
      "SNAPSHOT_NOT_FRESH",
      approvalState
        .approvalVerified
        ? "The preflight snapshot was observed before human approval."
        : "The preflight snapshot was observed before the ActionLock was created."
    );
  }

  if (
    !sameCanonicalValue(
      observation
        .proposed_action,

      lockedRequest
        .proposed_action
    )
  ) {
    throw new GenericPreflightError(
      "ACTION_CHANGED",
      "The proposed action or its parameters changed after locking."
    );
  }

  if (
    !sameCanonicalValue(
      observation.policy,
      lockedRequest.policy
    )
  ) {
    throw new GenericPreflightError(
      "POLICY_CHANGED",
      "The effective policy changed after locking."
    );
  }

  if (
    !sameCanonicalValue(
      observation.runtime,
      lockedRequest.runtime
    )
  ) {
    throw new GenericPreflightError(
      "RUNTIME_CHANGED",
      "The runtime identity or tool scope changed after locking."
    );
  }

  return {
    preflight_version:
      GENERIC_PREFLIGHT_VERSION,

    lock_id:
      lock.lock_id,

    lock_fingerprint:
      lock.fingerprint,

    ...(approvalState.approval
      ? {
          approval_id:
            approvalState
              .approval
              .approval_id
        }
      : {}),

    status:
      "PRE_EXECUTION_VERIFIED",

    approval_requirement:
      lockedRequest
        .policy
        .human_approval,

    approval_verified:
      approvalState
        .approvalVerified,

    subject_integrity_verified:
      true,

    snapshot_integrity_verified:
      true,

    action_integrity_verified:
      true,

    policy_integrity_verified:
      true,

    runtime_integrity_verified:
      true,

    observed_snapshot_version:
      observation
        .snapshot
        .version,

    execution_permitted_by_policy:
      true,

    execution_configured:
      false,

    external_action_executed:
      false,

    checked_at:
      checkedAt
  };
}
