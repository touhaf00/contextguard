import {
  randomUUID
} from "node:crypto";

import {
  digestCanonicalJson
} from "./authorization-integrity.js";

import {
  verifyGenericActionLockV2
} from "./action-lock.js";

import type {
  GenericActionLockV2
} from "./action-lock.js";

export const APPROVAL_ATTESTATION_VERSION =
  "2" as const;

export const APPROVAL_DECISIONS = [
  "APPROVED",
  "REJECTED"
] as const;

export type ApprovalDecisionV2 =
  (
    typeof APPROVAL_DECISIONS
  )[number];

export interface HumanApprovalPrincipalV2 {
  principal_type:
    "HUMAN";

  principal_id:
    string;

  display_name?: string;

  authentication_method?:
    string;
}

export interface ApprovalAttestationV2 {
  attestation_version:
    typeof APPROVAL_ATTESTATION_VERSION;

  approval_id:
    string;

  lock_id:
    string;

  lock_fingerprint:
    string;

  principal:
    HumanApprovalPrincipalV2;

  decision:
    ApprovalDecisionV2;

  decided_at:
    string;

  approval_expires_at?:
    string;

  attestation_digest:
    string;
}

export interface CreateApprovalAttestationOptions {
  approvalId?: string;

  decidedAt?: string;

  ttlMs?: number;
}

const SHA256 =
  /^[0-9a-f]{64}$/i;

const DEFAULT_APPROVAL_TTL_MS =
  15 * 60 * 1000;

function asObject(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

function requiredString(
  object: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value =
    object[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label}.${key} must be a non-empty string.`
    );
  }

  return value.trim();
}

function normalizeTimestamp(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label} must be a non-empty timestamp.`
    );
  }

  const parsed =
    Date.parse(value);

  if (
    !Number.isFinite(parsed)
  ) {
    throw new Error(
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

export function validateHumanApprovalPrincipalV2(
  value: unknown
): HumanApprovalPrincipalV2 {
  const object =
    asObject(
      value,
      "HumanApprovalPrincipalV2"
    );

  if (
    object.principal_type !==
      "HUMAN"
  ) {
    throw new Error(
      "HumanApprovalPrincipalV2.principal_type must be HUMAN."
    );
  }

  const principalId =
    requiredString(
      object,
      "principal_id",
      "HumanApprovalPrincipalV2"
    );

  let displayName:
    string | undefined;

  if (
    object.display_name !==
      undefined
  ) {
    displayName =
      requiredString(
        object,
        "display_name",
        "HumanApprovalPrincipalV2"
      );
  }

  let authenticationMethod:
    string | undefined;

  if (
    object.authentication_method !==
      undefined
  ) {
    authenticationMethod =
      requiredString(
        object,
        "authentication_method",
        "HumanApprovalPrincipalV2"
      );
  }

  return {
    principal_type:
      "HUMAN",

    principal_id:
      principalId,

    ...(displayName
      ? {
          display_name:
            displayName
        }
      : {}),

    ...(authenticationMethod
      ? {
          authentication_method:
            authenticationMethod
        }
      : {})
  };
}

function attestationMaterial(
  value: Omit<
    ApprovalAttestationV2,
    "attestation_digest"
  >
) {
  return value;
}

export function createApprovalAttestationV2(
  lock:
    GenericActionLockV2,

  principalValue: unknown,

  decision:
    ApprovalDecisionV2,

  options:
    CreateApprovalAttestationOptions = {}
): ApprovalAttestationV2 {
  if (
    !verifyGenericActionLockV2(
      lock
    )
  ) {
    throw new Error(
      "Approval requires a valid GenericActionLockV2."
    );
  }

  if (
    lock.intent
      .request
      .policy
      .human_approval ===
      "NONE"
  ) {
    throw new Error(
      "This policy does not permit a human approval attestation."
    );
  }

  if (
    !APPROVAL_DECISIONS.includes(
      decision
    )
  ) {
    throw new Error(
      "Approval decision is invalid."
    );
  }

  const principal =
    validateHumanApprovalPrincipalV2(
      principalValue
    );

  const decidedAt =
    normalizeTimestamp(
      options.decidedAt ??
        new Date().toISOString(),
      "ApprovalAttestationV2.decided_at"
    );

  if (
    Date.parse(decidedAt) <
    Date.parse(
      lock.created_at
    )
  ) {
    throw new Error(
      "Approval cannot be decided before the ActionLock was created."
    );
  }

  let approvalExpiresAt:
    string | undefined;

  if (
    decision ===
      "APPROVED"
  ) {
    const ttlMs =
      options.ttlMs ??
      DEFAULT_APPROVAL_TTL_MS;

    if (
      !Number.isInteger(ttlMs) ||
      ttlMs <= 0
    ) {
      throw new Error(
        "Approval TTL must be a positive integer."
      );
    }

    approvalExpiresAt =
      new Date(
        Date.parse(
          decidedAt
        ) + ttlMs
      ).toISOString();
  }

  const base:
    Omit<
      ApprovalAttestationV2,
      "attestation_digest"
    > = {
    attestation_version:
      APPROVAL_ATTESTATION_VERSION,

    approval_id:
      options.approvalId ??
      randomUUID(),

    lock_id:
      lock.lock_id,

    lock_fingerprint:
      lock.fingerprint,

    principal,

    decision,

    decided_at:
      decidedAt,

    ...(approvalExpiresAt
      ? {
          approval_expires_at:
            approvalExpiresAt
        }
      : {})
  };

  return {
    ...base,

    attestation_digest:
      digestCanonicalJson(
        attestationMaterial(
          base
        )
      )
  };
}

export function validateApprovalAttestationV2(
  value: unknown,
  lock:
    GenericActionLockV2
): ApprovalAttestationV2 {
  if (
    !verifyGenericActionLockV2(
      lock
    )
  ) {
    throw new Error(
      "Approval attestation cannot be verified against an invalid ActionLock."
    );
  }

  const object =
    asObject(
      value,
      "ApprovalAttestationV2"
    );

  if (
    object.attestation_version !==
      APPROVAL_ATTESTATION_VERSION
  ) {
    throw new Error(
      `ApprovalAttestationV2.attestation_version must be ${APPROVAL_ATTESTATION_VERSION}.`
    );
  }

  if (
    lock.intent
      .request
      .policy
      .human_approval ===
      "NONE"
  ) {
    throw new Error(
      "This policy does not permit a human approval attestation."
    );
  }

  const approvalId =
    requiredString(
      object,
      "approval_id",
      "ApprovalAttestationV2"
    );

  const lockId =
    requiredString(
      object,
      "lock_id",
      "ApprovalAttestationV2"
    );

  if (
    lockId !==
      lock.lock_id
  ) {
    throw new Error(
      "ApprovalAttestationV2 is bound to a different ActionLock ID."
    );
  }

  const lockFingerprint =
    requiredString(
      object,
      "lock_fingerprint",
      "ApprovalAttestationV2"
    ).toLowerCase();

  if (
    !SHA256.test(
      lockFingerprint
    )
  ) {
    throw new Error(
      "ApprovalAttestationV2.lock_fingerprint must be a SHA-256 hex digest."
    );
  }

  if (
    lockFingerprint !==
      lock.fingerprint
  ) {
    throw new Error(
      "ApprovalAttestationV2 is bound to a different ActionLock fingerprint."
    );
  }

  const principal =
    validateHumanApprovalPrincipalV2(
      object.principal
    );

  if (
    typeof object.decision !==
      "string" ||
    !APPROVAL_DECISIONS.includes(
      object.decision as
        ApprovalDecisionV2
    )
  ) {
    throw new Error(
      "ApprovalAttestationV2.decision is invalid."
    );
  }

  const decision =
    object.decision as
      ApprovalDecisionV2;

  const decidedAt =
    normalizeTimestamp(
      object.decided_at,
      "ApprovalAttestationV2.decided_at"
    );

  if (
    Date.parse(decidedAt) <
    Date.parse(
      lock.created_at
    )
  ) {
    throw new Error(
      "Approval cannot be decided before the ActionLock was created."
    );
  }

  let approvalExpiresAt:
    string | undefined;

  if (
    decision ===
      "APPROVED"
  ) {
    approvalExpiresAt =
      normalizeTimestamp(
        object.approval_expires_at,
        "ApprovalAttestationV2.approval_expires_at"
      );

    if (
      Date.parse(
        approvalExpiresAt
      ) <=
      Date.parse(
        decidedAt
      )
    ) {
      throw new Error(
        "Approved attestation must expire after its decision time."
      );
    }
  } else if (
    object.approval_expires_at !==
      undefined
  ) {
    throw new Error(
      "Rejected attestation must not contain approval_expires_at."
    );
  }

  const digest =
    requiredString(
      object,
      "attestation_digest",
      "ApprovalAttestationV2"
    ).toLowerCase();

  if (
    !SHA256.test(
      digest
    )
  ) {
    throw new Error(
      "ApprovalAttestationV2.attestation_digest must be a SHA-256 hex digest."
    );
  }

  const base:
    Omit<
      ApprovalAttestationV2,
      "attestation_digest"
    > = {
    attestation_version:
      APPROVAL_ATTESTATION_VERSION,

    approval_id:
      approvalId,

    lock_id:
      lockId,

    lock_fingerprint:
      lockFingerprint,

    principal,

    decision,

    decided_at:
      decidedAt,

    ...(approvalExpiresAt
      ? {
          approval_expires_at:
            approvalExpiresAt
        }
      : {})
  };

  const expectedDigest =
    digestCanonicalJson(
      attestationMaterial(
        base
      )
    );

  if (
    digest !==
      expectedDigest
  ) {
    throw new Error(
      "ApprovalAttestationV2 digest verification failed."
    );
  }

  return {
    ...base,

    attestation_digest:
      digest
  };
}

export function verifyApprovalAttestationV2(
  value: unknown,
  lock:
    GenericActionLockV2
): boolean {
  try {
    validateApprovalAttestationV2(
      value,
      lock
    );

    return true;
  } catch {
    return false;
  }
}

export function isApprovalAttestationActiveV2(
  value: unknown,
  lock:
    GenericActionLockV2,
  nowMs = Date.now()
): boolean {
  let attestation:
    ApprovalAttestationV2;

  try {
    attestation =
      validateApprovalAttestationV2(
        value,
        lock
      );
  } catch {
    return false;
  }

  if (
    attestation.decision !==
      "APPROVED" ||
    !attestation
      .approval_expires_at
  ) {
    return false;
  }

  return (
    nowMs <
    Date.parse(
      attestation
        .approval_expires_at
    )
  );
}
