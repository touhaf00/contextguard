import {
  randomUUID
} from "node:crypto";

import {
  canonicalJson
} from "../../core/contracts.js";

import {
  digestCanonicalJson
} from "../../core/authorization-integrity.js";

import type {
  JsonObject
} from "../../core/contracts.js";

import type {
  TrustedExecutorResultV2
} from "../../core/trusted-executor.js";

export const EXECUTION_PROOF_VERSION =
  "2" as const;

const SHA256 =
  /^[0-9a-f]{64}$/i;

const PROOF_FIELDS =
  new Set([
    "proof_version",
    "proof_id",
    "receipt_id",
    "receipt_digest",
    "consumption_id",
    "consumption_digest",
    "lock_id",
    "lock_fingerprint",
    "action_digest",
    "authorized_snapshot_version",
    "provider",
    "action",
    "status",
    "external_action_executed",
    "verified_at",
    "completed_at",
    "created_at",
    "provider_result",
    "provider_result_digest",
    "proof_digest"
  ]);

export interface CreateExecutionProofInputV2 {
  receipt_id:
    string;

  receipt_digest:
    string;

  consumption_id:
    string;

  consumption_digest:
    string;

  lock_id:
    string;

  lock_fingerprint:
    string;

  action_digest:
    string;

  authorized_snapshot_version:
    string;

  provider:
    string;

  action:
    string;

  verified_at:
    string;

  result:
    TrustedExecutorResultV2;
}

export interface CreateExecutionProofOptionsV2 {
  proofId?:
    string;

  createdAt?:
    string;
}

export interface ExecutionProofV2 {
  proof_version:
    typeof EXECUTION_PROOF_VERSION;

  proof_id:
    string;

  receipt_id:
    string;

  receipt_digest:
    string;

  consumption_id:
    string;

  consumption_digest:
    string;

  lock_id:
    string;

  lock_fingerprint:
    string;

  action_digest:
    string;

  authorized_snapshot_version:
    string;

  provider:
    string;

  action:
    string;

  status:
    "EXTERNAL_ACTION_EXECUTED";

  external_action_executed:
    true;

  verified_at:
    string;

  completed_at:
    string;

  created_at:
    string;

  provider_result:
    JsonObject;

  provider_result_digest:
    string;

  proof_digest:
    string;
}

export type ExecutionProofErrorCodeV2 =
  | "INVALID_INPUT"
  | "INVALID_DIGEST"
  | "INVALID_TIME"
  | "INVALID_RESULT"
  | "RESULT_MISMATCH";

export class ExecutionProofErrorV2
  extends Error {
  constructor(
    public readonly code:
      ExecutionProofErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
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
    throw new ExecutionProofErrorV2(
      "INVALID_INPUT",
      `${label} must be a non-empty string.`
    );
  }

  return value.trim();
}

function digest(
  value:
    unknown,

  label:
    string
): string {
  const normalized =
    requiredString(
      value,
      label
    ).toLowerCase();

  if (
    !SHA256.test(
      normalized
    )
  ) {
    throw new ExecutionProofErrorV2(
      "INVALID_DIGEST",
      `${label} must be a SHA-256 hex digest.`
    );
  }

  return normalized;
}

function timestamp(
  value:
    unknown,

  label:
    string
): string {
  const raw =
    requiredString(
      value,
      label
    );

  const parsed =
    Date.parse(
      raw
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    throw new ExecutionProofErrorV2(
      "INVALID_TIME",
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function jsonObject(
  value:
    unknown,

  label:
    string
): JsonObject {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    throw new ExecutionProofErrorV2(
      "INVALID_RESULT",
      `${label} must be a JSON object.`
    );
  }

  try {
    return JSON.parse(
      canonicalJson(
        value
      )
    ) as JsonObject;
  } catch (error) {
    throw new ExecutionProofErrorV2(
      "INVALID_RESULT",
      error instanceof Error
        ? `${label} is invalid: ${error.message}`
        : `${label} is invalid.`
    );
  }
}

function proofMaterial(
  value:
    Omit<
      ExecutionProofV2,
      "proof_digest"
    >
) {
  return value;
}

export function createExecutionProofV2(
  input:
    CreateExecutionProofInputV2,

  options:
    CreateExecutionProofOptionsV2 = {}
): ExecutionProofV2 {
  const receiptId =
    requiredString(
      input.receipt_id,
      "receipt_id"
    );

  const receiptDigest =
    digest(
      input.receipt_digest,
      "receipt_digest"
    );

  const consumptionId =
    requiredString(
      input.consumption_id,
      "consumption_id"
    );

  const consumptionDigest =
    digest(
      input.consumption_digest,
      "consumption_digest"
    );

  const lockId =
    requiredString(
      input.lock_id,
      "lock_id"
    );

  const lockFingerprint =
    digest(
      input.lock_fingerprint,
      "lock_fingerprint"
    );

  const actionDigest =
    digest(
      input.action_digest,
      "action_digest"
    );

  const authorizedSnapshotVersion =
    requiredString(
      input.authorized_snapshot_version,
      "authorized_snapshot_version"
    );

  const provider =
    requiredString(
      input.provider,
      "provider"
    );

  const action =
    requiredString(
      input.action,
      "action"
    );

  const verifiedAt =
    timestamp(
      input.verified_at,
      "verified_at"
    );

  const providerResult =
    jsonObject(
      input.result,
      "result"
    );

  if (
    providerResult.executor_version !==
      "2" ||
    providerResult.status !==
      "EXECUTED" ||
    providerResult.external_action_executed !==
      true
  ) {
    throw new ExecutionProofErrorV2(
      "INVALID_RESULT",
      "Execution proof requires a successful trusted executor result."
    );
  }

  if (
    providerResult.receipt_id !==
      receiptId ||
    providerResult.consumption_id !==
      consumptionId ||
    providerResult.provider !==
      provider ||
    providerResult.action !==
      action
  ) {
    throw new ExecutionProofErrorV2(
      "RESULT_MISMATCH",
      "Trusted executor result does not match the execution authorization."
    );
  }

  const completedAt =
    timestamp(
      providerResult.completed_at,
      "result.completed_at"
    );

  if (
    Date.parse(
      completedAt
    ) <
    Date.parse(
      verifiedAt
    )
  ) {
    throw new ExecutionProofErrorV2(
      "INVALID_TIME",
      "Execution cannot complete before trusted authorization verification."
    );
  }

  const createdAt =
    timestamp(
      options.createdAt ??
        new Date()
          .toISOString(),
      "created_at"
    );

  if (
    Date.parse(
      createdAt
    ) <
    Date.parse(
      completedAt
    )
  ) {
    throw new ExecutionProofErrorV2(
      "INVALID_TIME",
      "Execution proof cannot be created before execution completed."
    );
  }

  const providerResultDigest =
    digestCanonicalJson(
      providerResult
    );

  const base:
    Omit<
      ExecutionProofV2,
      "proof_digest"
    > = {
    proof_version:
      EXECUTION_PROOF_VERSION,

    proof_id:
      requiredString(
        options.proofId ??
          randomUUID(),
        "proof_id"
      ),

    receipt_id:
      receiptId,

    receipt_digest:
      receiptDigest,

    consumption_id:
      consumptionId,

    consumption_digest:
      consumptionDigest,

    lock_id:
      lockId,

    lock_fingerprint:
      lockFingerprint,

    action_digest:
      actionDigest,

    authorized_snapshot_version:
      authorizedSnapshotVersion,

    provider,

    action,

    status:
      "EXTERNAL_ACTION_EXECUTED",

    external_action_executed:
      true,

    verified_at:
      verifiedAt,

    completed_at:
      completedAt,

    created_at:
      createdAt,

    provider_result:
      providerResult,

    provider_result_digest:
      providerResultDigest
  };

  return {
    ...base,

    proof_digest:
      digestCanonicalJson(
        proofMaterial(
          base
        )
      )
  };
}

export function verifyExecutionProofIntegrityV2(
  value:
    unknown
): boolean {
  try {
    if (
      typeof value !==
        "object" ||
      value ===
        null ||
      Array.isArray(
        value
      )
    ) {
      return false;
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
        !PROOF_FIELDS.has(
          key
        )
      ) {
        return false;
      }
    }

    if (
      object.proof_version !==
        EXECUTION_PROOF_VERSION ||
      object.status !==
        "EXTERNAL_ACTION_EXECUTED" ||
      object.external_action_executed !==
        true
    ) {
      return false;
    }

    const providerResult =
      jsonObject(
        object.provider_result,
        "provider_result"
      );

    const normalized:
      Omit<
        ExecutionProofV2,
        "proof_digest"
      > = {
      proof_version:
        EXECUTION_PROOF_VERSION,

      proof_id:
        requiredString(
          object.proof_id,
          "proof_id"
        ),

      receipt_id:
        requiredString(
          object.receipt_id,
          "receipt_id"
        ),

      receipt_digest:
        digest(
          object.receipt_digest,
          "receipt_digest"
        ),

      consumption_id:
        requiredString(
          object.consumption_id,
          "consumption_id"
        ),

      consumption_digest:
        digest(
          object.consumption_digest,
          "consumption_digest"
        ),

      lock_id:
        requiredString(
          object.lock_id,
          "lock_id"
        ),

      lock_fingerprint:
        digest(
          object.lock_fingerprint,
          "lock_fingerprint"
        ),

      action_digest:
        digest(
          object.action_digest,
          "action_digest"
        ),

      authorized_snapshot_version:
        requiredString(
          object.authorized_snapshot_version,
          "authorized_snapshot_version"
        ),

      provider:
        requiredString(
          object.provider,
          "provider"
        ),

      action:
        requiredString(
          object.action,
          "action"
        ),

      status:
        "EXTERNAL_ACTION_EXECUTED",

      external_action_executed:
        true,

      verified_at:
        timestamp(
          object.verified_at,
          "verified_at"
        ),

      completed_at:
        timestamp(
          object.completed_at,
          "completed_at"
        ),

      created_at:
        timestamp(
          object.created_at,
          "created_at"
        ),

      provider_result:
        providerResult,

      provider_result_digest:
        digest(
          object.provider_result_digest,
          "provider_result_digest"
        )
    };

    if (
      normalized.provider_result_digest !==
      digestCanonicalJson(
        providerResult
      )
    ) {
      return false;
    }

    if (
      providerResult.executor_version !==
        "2" ||
      providerResult.status !==
        "EXECUTED" ||
      providerResult.external_action_executed !==
        true ||
      providerResult.receipt_id !==
        normalized.receipt_id ||
      providerResult.consumption_id !==
        normalized.consumption_id ||
      providerResult.provider !==
        normalized.provider ||
      providerResult.action !==
        normalized.action ||
      providerResult.completed_at !==
        normalized.completed_at
    ) {
      return false;
    }

    if (
      Date.parse(
        normalized.completed_at
      ) <
        Date.parse(
          normalized.verified_at
        ) ||
      Date.parse(
        normalized.created_at
      ) <
        Date.parse(
          normalized.completed_at
        )
    ) {
      return false;
    }

    const proofDigest =
      digest(
        object.proof_digest,
        "proof_digest"
      );

    return (
      proofDigest ===
      digestCanonicalJson(
        proofMaterial(
          normalized
        )
      )
    );
  } catch {
    return false;
  }
}
