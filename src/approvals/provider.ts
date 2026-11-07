import {
  APPROVAL_DECISIONS,
  createApprovalAttestationV2,
  validateHumanApprovalPrincipalV2
} from "../core/approval-attestation.js";

import {
  verifyGenericActionLockV2
} from "../core/action-lock.js";

import type {
  ApprovalAttestationV2,
  ApprovalDecisionV2,
  HumanApprovalPrincipalV2
} from "../core/approval-attestation.js";

import type {
  GenericActionLockV2
} from "../core/action-lock.js";

import type {
  PolicyDefinition,
  ProposedAction,
  SubjectRef
} from "../core/contracts.js";

export const APPROVAL_PROVIDER_VERSION =
  "2" as const;

export const APPROVAL_CHALLENGE_VERSION =
  "2" as const;

export const APPROVAL_PROVIDER_DECISION_VERSION =
  "2" as const;

const IDENTIFIER =
  /^[a-z0-9][a-z0-9._-]*$/;

const SHA256 =
  /^[0-9a-f]{64}$/i;

const ALLOWED_DECISION_FIELDS =
  new Set([
    "decision_version",
    "provider_id",
    "lock_id",
    "lock_fingerprint",
    "principal",
    "decision",
    "decided_at"
  ]);

export type ApprovalProviderErrorCodeV2 =
  | "INVALID_PROVIDER"
  | "INVALID_LOCK"
  | "APPROVAL_NOT_ALLOWED"
  | "PROVIDER_FAILED"
  | "INVALID_DECISION"
  | "LOCK_MISMATCH"
  | "UNAUTHENTICATED_PRINCIPAL"
  | "INVALID_TIME";

export class ApprovalProviderErrorV2
  extends Error {
  constructor(
    public readonly code:
      ApprovalProviderErrorCodeV2,
    message: string
  ) {
    super(message);
  }
}

export interface ApprovalChallengeV2 {
  challenge_version:
    typeof APPROVAL_CHALLENGE_VERSION;

  provider_id:
    string;

  lock_id:
    string;

  lock_fingerprint:
    string;

  requested_at:
    string;

  subject:
    SubjectRef;

  proposed_action:
    ProposedAction;

  policy:
    PolicyDefinition;
}

export interface ApprovalProviderDecisionV2 {
  decision_version:
    typeof APPROVAL_PROVIDER_DECISION_VERSION;

  provider_id:
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
}

export interface ApprovalProviderV2 {
  provider_version:
    typeof APPROVAL_PROVIDER_VERSION;

  provider_id:
    string;

  requestDecision(
    challenge:
      ApprovalChallengeV2
  ): Promise<unknown>;
}

export interface RequestApprovalOptionsV2 {
  requestedAt?: string;

  approvalId?: string;

  ttlMs?: number;
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
    throw new ApprovalProviderErrorV2(
      "INVALID_DECISION",
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

function identifier(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !IDENTIFIER.test(
      value.trim()
    )
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_PROVIDER",
      `${label} must be a valid identifier.`
    );
  }

  return value.trim();
}

function requiredString(
  object:
    Record<string, unknown>,
  key: string,
  label: string
): string {
  const value =
    object[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_DECISION",
      `${label}.${key} must be a non-empty string.`
    );
  }

  return value.trim();
}

function timestamp(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_TIME",
      `${label} must be a valid timestamp.`
    );
  }

  const parsed =
    Date.parse(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_TIME",
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function cloneJson<T>(
  value: T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

export function validateApprovalProviderV2(
  provider:
    ApprovalProviderV2
): ApprovalProviderV2 {
  if (
    typeof provider !== "object" ||
    provider === null
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_PROVIDER",
      "ApprovalProviderV2 must be an object."
    );
  }

  if (
    provider.provider_version !==
      APPROVAL_PROVIDER_VERSION
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_PROVIDER",
      `ApprovalProviderV2.provider_version must be ${APPROVAL_PROVIDER_VERSION}.`
    );
  }

  identifier(
    provider.provider_id,
    "ApprovalProviderV2.provider_id"
  );

  if (
    typeof provider.requestDecision !==
      "function"
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_PROVIDER",
      "ApprovalProviderV2.requestDecision must be a function."
    );
  }

  return provider;
}

function validateProviderDecisionV2(
  value: unknown,
  provider:
    ApprovalProviderV2,
  lock:
    GenericActionLockV2,
  requestedAt: string
): ApprovalProviderDecisionV2 {
  const object =
    asObject(
      value,
      "ApprovalProviderDecisionV2"
    );

  for (
    const key
    of Object.keys(object)
  ) {
    if (
      !ALLOWED_DECISION_FIELDS
        .has(key)
    ) {
      throw new ApprovalProviderErrorV2(
        "INVALID_DECISION",
        `ApprovalProviderDecisionV2 contains unsupported field: ${key}.`
      );
    }
  }

  if (
    object.decision_version !==
      APPROVAL_PROVIDER_DECISION_VERSION
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_DECISION",
      `ApprovalProviderDecisionV2.decision_version must be ${APPROVAL_PROVIDER_DECISION_VERSION}.`
    );
  }

  const providerId =
    requiredString(
      object,
      "provider_id",
      "ApprovalProviderDecisionV2"
    );

  if (
    providerId !==
      provider.provider_id
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_DECISION",
      "Approval decision came from a different provider."
    );
  }

  const lockId =
    requiredString(
      object,
      "lock_id",
      "ApprovalProviderDecisionV2"
    );

  const lockFingerprint =
    requiredString(
      object,
      "lock_fingerprint",
      "ApprovalProviderDecisionV2"
    ).toLowerCase();

  if (
    !SHA256.test(
      lockFingerprint
    )
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_DECISION",
      "Approval decision lock_fingerprint must be a SHA-256 digest."
    );
  }

  if (
    lockId !==
      lock.lock_id ||
    lockFingerprint !==
      lock.fingerprint
  ) {
    throw new ApprovalProviderErrorV2(
      "LOCK_MISMATCH",
      "Approval decision is bound to a different ActionLock."
    );
  }

  let principal:
    HumanApprovalPrincipalV2;

  try {
    principal =
      validateHumanApprovalPrincipalV2(
        object.principal
      );
  } catch (error) {
    throw new ApprovalProviderErrorV2(
      "INVALID_DECISION",
      error instanceof Error
        ? error.message
        : "Approval principal is invalid."
    );
  }

  if (
    !principal
      .authentication_method
  ) {
    throw new ApprovalProviderErrorV2(
      "UNAUTHENTICATED_PRINCIPAL",
      "Approval provider must supply an authenticated human principal."
    );
  }

  if (
    typeof object.decision !==
      "string" ||
    !APPROVAL_DECISIONS.includes(
      object.decision as
        ApprovalDecisionV2
    )
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_DECISION",
      "Approval provider decision is invalid."
    );
  }

  const decidedAt =
    timestamp(
      object.decided_at,
      "ApprovalProviderDecisionV2.decided_at"
    );

  if (
    Date.parse(decidedAt) <
    Date.parse(requestedAt)
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_TIME",
      "Approval decision cannot predate its approval challenge."
    );
  }

  return {
    decision_version:
      APPROVAL_PROVIDER_DECISION_VERSION,

    provider_id:
      providerId,

    lock_id:
      lockId,

    lock_fingerprint:
      lockFingerprint,

    principal,

    decision:
      object.decision as
        ApprovalDecisionV2,

    decided_at:
      decidedAt
  };
}

export function createApprovalChallengeV2(
  providerValue:
    ApprovalProviderV2,
  lock:
    GenericActionLockV2,
  requestedAtValue =
    new Date().toISOString()
): ApprovalChallengeV2 {
  const provider =
    validateApprovalProviderV2(
      providerValue
    );

  if (
    !verifyGenericActionLockV2(
      lock
    )
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_LOCK",
      "Approval challenge requires a valid GenericActionLockV2."
    );
  }

  if (
    lock.intent
      .request
      .policy
      .human_approval ===
      "NONE"
  ) {
    throw new ApprovalProviderErrorV2(
      "APPROVAL_NOT_ALLOWED",
      "This policy does not permit human approval."
    );
  }

  const requestedAt =
    timestamp(
      requestedAtValue,
      "ApprovalChallengeV2.requested_at"
    );

  if (
    Date.parse(requestedAt) <
    Date.parse(
      lock.created_at
    )
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_TIME",
      "Approval challenge cannot predate the ActionLock."
    );
  }

  return {
    challenge_version:
      APPROVAL_CHALLENGE_VERSION,

    provider_id:
      provider.provider_id,

    lock_id:
      lock.lock_id,

    lock_fingerprint:
      lock.fingerprint,

    requested_at:
      requestedAt,

    subject:
      cloneJson(
        lock.intent
          .request
          .subject
      ),

    proposed_action:
      cloneJson(
        lock.intent
          .request
          .proposed_action
      ),

    policy:
      cloneJson(
        lock.intent
          .request
          .policy
      )
  };
}

export async function requestApprovalAttestationV2(
  providerValue:
    ApprovalProviderV2,
  lock:
    GenericActionLockV2,
  options:
    RequestApprovalOptionsV2 = {}
): Promise<ApprovalAttestationV2> {
  const provider =
    validateApprovalProviderV2(
      providerValue
    );

  const challenge =
    createApprovalChallengeV2(
      provider,
      lock,
      options.requestedAt
    );

  let rawDecision:
    unknown;

  try {
    rawDecision =
      await provider
        .requestDecision(
          challenge
        );
  } catch (error) {
    throw new ApprovalProviderErrorV2(
      "PROVIDER_FAILED",
      error instanceof Error
        ? `Approval provider failed: ${error.message}`
        : "Approval provider failed."
    );
  }

  if (
    !verifyGenericActionLockV2(
      lock
    )
  ) {
    throw new ApprovalProviderErrorV2(
      "INVALID_LOCK",
      "ActionLock changed while approval was being collected."
    );
  }

  const decision =
    validateProviderDecisionV2(
      rawDecision,
      provider,
      lock,
      challenge.requested_at
    );

  return createApprovalAttestationV2(
    lock,
    decision.principal,
    decision.decision,
    {
      approvalId:
        options.approvalId,

      decidedAt:
        decision.decided_at,

      ttlMs:
        options.ttlMs
    }
  );
}
