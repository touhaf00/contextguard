import {
  randomUUID
} from "node:crypto";

import {
  authorizationRequestDigest,
  digestCanonicalJson
} from "./authorization-integrity.js";

import {
  authorizationDecisionDigest,
  evaluateAuthorizationDecisionV2
} from "./decision.js";

import {
  validateAuthorizationRequest
} from "./contracts.js";

import {
  validateGuardVerificationV2
} from "./verification.js";

import type {
  AuthorizationRequest
} from "./contracts.js";

import type {
  AuthorizationDecisionV2
} from "./decision.js";

export const GENERIC_ACTION_INTENT_VERSION =
  "2" as const;

export const GENERIC_ACTION_LOCK_VERSION =
  "2" as const;

export interface GenericActionIntentV2 {
  intent_version:
    typeof GENERIC_ACTION_INTENT_VERSION;

  intent_id: string;

  request:
    AuthorizationRequest;

  authorization_decision:
    AuthorizationDecisionV2;

  authorization_decision_digest:
    string;

  created_at: string;
}

export interface GenericActionLockV2 {
  lock_version:
    typeof GENERIC_ACTION_LOCK_VERSION;

  lock_id: string;

  intent:
    GenericActionIntentV2;

  intent_digest: string;

  fingerprint: string;

  created_at: string;
}

export interface CreateGenericActionLockOptions {
  intentId?: string;
  lockId?: string;
  createdAt?: string;
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

function requiredId(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label} must be a non-empty string.`
    );
  }

  return value.trim();
}

export function buildGenericActionIntentV2(
  requestValue: unknown,
  evidenceValue: unknown,
  workerAssessmentValue: unknown,
  guardVerificationValue: unknown,
  options:
    CreateGenericActionLockOptions = {}
): GenericActionIntentV2 {
  const request =
    validateAuthorizationRequest(
      requestValue
    );

  const decision =
    evaluateAuthorizationDecisionV2(
      request,
      evidenceValue,
      workerAssessmentValue,
      guardVerificationValue
    );

  if (
    !decision.action_lock_eligible
  ) {
    throw new Error(
      `Generic ActionLock requires an eligible authorization decision; received ${decision.status}.`
    );
  }

  if (
    decision.external_action_executed !==
      false
  ) {
    throw new Error(
      "Generic ActionLock cannot be created after external execution."
    );
  }

  const guard =
    validateGuardVerificationV2(
      guardVerificationValue,
      workerAssessmentValue,
      evidenceValue,
      request
    );

  const createdAt =
    normalizeTimestamp(
      options.createdAt ??
        new Date().toISOString(),
      "GenericActionIntentV2.created_at"
    );

  if (
    Date.parse(createdAt) <
    Date.parse(
      guard.verified_at
    )
  ) {
    throw new Error(
      "Generic ActionLock cannot be created before Guard verification."
    );
  }

  return {
    intent_version:
      GENERIC_ACTION_INTENT_VERSION,

    intent_id:
      requiredId(
        options.intentId ??
          randomUUID(),
        "GenericActionIntentV2.intent_id"
      ),

    request,

    authorization_decision:
      decision,

    authorization_decision_digest:
      authorizationDecisionDigest(
        request,
        evidenceValue,
        workerAssessmentValue,
        guardVerificationValue
      ),

    created_at:
      createdAt
  };
}

export function genericActionIntentDigest(
  intent:
    GenericActionIntentV2
): string {
  return digestCanonicalJson(
    intent
  );
}

function lockFingerprintMaterial(
  lock: {
    lock_version: string;
    lock_id: string;
    intent_digest: string;
    created_at: string;
  }
) {
  return {
    lock_version:
      lock.lock_version,

    lock_id:
      lock.lock_id,

    intent_digest:
      lock.intent_digest,

    created_at:
      lock.created_at
  };
}

export function fingerprintGenericActionLockV2(
  lock: Omit<
    GenericActionLockV2,
    "fingerprint"
  >
): string {
  return digestCanonicalJson(
    lockFingerprintMaterial(
      lock
    )
  );
}

export function createGenericActionLockV2(
  requestValue: unknown,
  evidenceValue: unknown,
  workerAssessmentValue: unknown,
  guardVerificationValue: unknown,
  options:
    CreateGenericActionLockOptions = {}
): GenericActionLockV2 {
  const intent =
    buildGenericActionIntentV2(
      requestValue,
      evidenceValue,
      workerAssessmentValue,
      guardVerificationValue,
      options
    );

  const intentDigest =
    genericActionIntentDigest(
      intent
    );

  const base = {
    lock_version:
      GENERIC_ACTION_LOCK_VERSION,

    lock_id:
      requiredId(
        options.lockId ??
          randomUUID(),
        "GenericActionLockV2.lock_id"
      ),

    intent,

    intent_digest:
      intentDigest,

    created_at:
      intent.created_at
  } as const;

  return {
    ...base,

    fingerprint:
      fingerprintGenericActionLockV2(
        base
      )
  };
}

export function verifyGenericActionLockV2(
  lock:
    GenericActionLockV2
): boolean {
  if (
    lock.lock_version !==
      GENERIC_ACTION_LOCK_VERSION
  ) {
    return false;
  }

  if (
    lock.intent.intent_version !==
      GENERIC_ACTION_INTENT_VERSION
  ) {
    return false;
  }

  if (
    lock.created_at !==
      lock.intent.created_at
  ) {
    return false;
  }

  let expectedRequestDigest:
    string;

  try {
    expectedRequestDigest =
      authorizationRequestDigest(
        lock.intent.request
      );
  } catch {
    return false;
  }

  if (
    lock.intent
      .authorization_decision
      .request_digest !==
      expectedRequestDigest
  ) {
    return false;
  }

  const embeddedDecisionDigest =
    digestCanonicalJson(
      lock.intent
        .authorization_decision
    );

  if (
    lock.intent
      .authorization_decision_digest !==
      embeddedDecisionDigest
  ) {
    return false;
  }

  if (
    !lock.intent
      .authorization_decision
      .action_lock_eligible
  ) {
    return false;
  }

  if (
    lock.intent
      .authorization_decision
      .external_action_executed !==
      false
  ) {
    return false;
  }

  const intentDigest =
    genericActionIntentDigest(
      lock.intent
    );

  if (
    lock.intent_digest !==
      intentDigest
  ) {
    return false;
  }

  const expectedFingerprint =
    fingerprintGenericActionLockV2({
      lock_version:
        lock.lock_version,

      lock_id:
        lock.lock_id,

      intent:
        lock.intent,

      intent_digest:
        lock.intent_digest,

      created_at:
        lock.created_at
    });

  return (
    lock.fingerprint ===
    expectedFingerprint
  );
}

export function genericActionLockMatchesPipelineV2(
  lock:
    GenericActionLockV2,

  requestValue: unknown,
  evidenceValue: unknown,
  workerAssessmentValue: unknown,
  guardVerificationValue: unknown
): boolean {
  if (
    !verifyGenericActionLockV2(
      lock
    )
  ) {
    return false;
  }

  let expectedIntent:
    GenericActionIntentV2;

  try {
    expectedIntent =
      buildGenericActionIntentV2(
        requestValue,
        evidenceValue,
        workerAssessmentValue,
        guardVerificationValue,
        {
          intentId:
            lock.intent
              .intent_id,

          createdAt:
            lock.intent
              .created_at
        }
      );
  } catch {
    return false;
  }

  return (
    genericActionIntentDigest(
      expectedIntent
    ) ===
      lock.intent_digest
  );
}
