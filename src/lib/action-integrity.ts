import {
  createHash,
  randomUUID
} from "node:crypto";

import type {
  ActionIntent,
  ActionLock,
  OrchestrationResult
} from "../types.js";

function canonicalize(
  value: unknown
): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return (
      "[" +
      value
        .map(canonicalize)
        .join(",") +
      "]"
    );
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        "Cannot canonicalize a non-finite number."
      );
    }

    return JSON.stringify(value);
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    const object =
      value as
        Record<string, unknown>;

    const keys =
      Object.keys(object)
        .filter(
          (key) =>
            object[key] !==
              undefined
        )
        .sort();

    return (
      "{" +
      keys
        .map(
          (key) =>
            `${JSON.stringify(key)}:${canonicalize(
              object[key]
            )}`
        )
        .join(",") +
      "}"
    );
  }

  throw new Error(
    `Unsupported canonical value: ${typeof value}.`
  );
}

function sha256(
  value: unknown
): string {
  return createHash("sha256")
    .update(
      canonicalize(value),
      "utf8"
    )
    .digest("hex");
}

export function assessmentDigest(
  result: OrchestrationResult
): string {
  return sha256({
    repository:
      result.repository,

    target:
      result.target,

    target_integrity: {
      status:
        result.target_integrity.status,

      locked_sha:
        result.target_integrity.locked_sha
    },

    worker: {
      decision:
        result.worker.decision,

      claims:
        result.worker.claims ?? [],

      evidence:
        result.worker.evidence ?? []
    },

    guard: {
      verdict:
        result.guard.verdict,

      worker_decision_supported:
        result.guard
          .worker_decision_supported,

      verified_claims:
        result.guard
          .verified_claims ?? [],

      unverified_claims:
        result.guard
          .unverified_claims ?? [],

      contradicted_claims:
        result.guard
          .contradicted_claims ?? []
    }
  });
}

export interface BuildActionIntentOptions {
  intentId?: string;
  createdAt?: string;
}

export function buildActionIntent(
  result: OrchestrationResult,
  options: BuildActionIntentOptions = {}
): ActionIntent {
  if (
    result.status !==
      "AWAITING_HUMAN_APPROVAL"
  ) {
    throw new Error(
      "Action intent requires AWAITING_HUMAN_APPROVAL."
    );
  }

  if (
    result.worker.decision !==
      "READY"
  ) {
    throw new Error(
      "Action intent requires Worker decision READY."
    );
  }

  if (
    result.guard.verdict !==
      "PASS"
  ) {
    throw new Error(
      "Action intent requires Guard verdict PASS."
    );
  }

  if (
    !result.guard
      .worker_decision_supported
  ) {
    throw new Error(
      "Action intent requires the Worker decision to remain supported."
    );
  }

  if (
    !result.guard.allowed_to_act
  ) {
    throw new Error(
      "Action intent requires Guard allowed_to_act=true."
    );
  }

  if (
    result.target_integrity.status !==
      "VERIFIED"
  ) {
    throw new Error(
      "Action intent requires VERIFIED target integrity."
    );
  }

  const lockedSha =
    result.target_integrity
      .locked_sha;

  if (!lockedSha) {
    throw new Error(
      "Action intent requires an immutable locked SHA."
    );
  }

  if (
    !result.human_approval_required
  ) {
    throw new Error(
      "Action intent requires a human approval gate."
    );
  }

  if (
    result.external_action_executed
  ) {
    throw new Error(
      "Cannot create an ActionIntent after an external action was executed."
    );
  }

  const verifiedClaimIds =
    [
      ...(
        result.guard
          .verified_claims ?? []
      )
    ]
      .sort();

  return {
    intent_id:
      options.intentId ??
      randomUUID(),

    action_type:
      "PROCEED_TO_NEXT_STAGE",

    repository:
      result.repository,

    target:
      result.target,

    locked_sha:
      lockedSha,

    assessment_digest:
      assessmentDigest(result),

    worker_decision:
      "READY",

    guard_verdict:
      "PASS",

    verified_claim_ids:
      verifiedClaimIds,

    created_at:
      options.createdAt ??
      new Date().toISOString()
  };
}

export function fingerprintActionIntent(
  intent: ActionIntent
): string {
  return sha256(intent);
}

export interface CreateActionLockOptions
  extends BuildActionIntentOptions {
  approvalId?: string;
}

export function createActionLock(
  result: OrchestrationResult,
  options: CreateActionLockOptions = {}
): ActionLock {
  const intent =
    buildActionIntent(
      result,
      options
    );

  return {
    approval_id:
      options.approvalId ??
      randomUUID(),

    intent,

    fingerprint:
      fingerprintActionIntent(
        intent
      ),

    status:
      "PENDING",

    created_at:
      intent.created_at
  };
}

export function verifyActionLock(
  lock: ActionLock
): boolean {
  return (
    lock.fingerprint ===
    fingerprintActionIntent(
      lock.intent
    )
  );
}

export function actionLockMatchesResult(
  lock: ActionLock,
  result: OrchestrationResult
): boolean {
  if (
    !verifyActionLock(lock)
  ) {
    return false;
  }

  let currentIntent:
    ActionIntent;

  try {
    currentIntent =
      buildActionIntent(
        result,
        {
          intentId:
            lock.intent.intent_id,

          createdAt:
            lock.intent.created_at
        }
      );
  } catch {
    return false;
  }

  return (
    fingerprintActionIntent(
      currentIntent
    ) ===
    lock.fingerprint
  );
}
