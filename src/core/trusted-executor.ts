import {
  digestCanonicalJson
} from "./authorization-integrity.js";

import {
  verifyExecutionAuthorizationReceiptIntegrityV2
} from "../api/v2/execution-receipt.js";

import type {
  ExecutionAuthorizationReceiptV2
} from "../api/v2/execution-receipt.js";

import type {
  ExecutionReceiptConsumptionV2
} from "../api/v2/execution-receipt-store.js";

export const TRUSTED_EXECUTOR_VERSION =
  "2" as const;

export const TRUSTED_EXECUTION_AUTHORIZATION_VERSION =
  "2" as const;

const SHA256 =
  /^[0-9a-f]{64}$/i;

const CONSUMPTION_FIELDS =
  new Set([
    "consumption_version",
    "consumption_id",
    "receipt_id",
    "receipt_digest",
    "lock_id",
    "lock_fingerprint",
    "action_digest",
    "authorized_snapshot_version",
    "status",
    "consumed_at",
    "execution_configured",
    "external_action_executed",
    "consumption_digest"
  ]);

export type TrustedExecutionAuthorizationErrorCodeV2 =
  | "INVALID_RECEIPT"
  | "INVALID_CONSUMPTION"
  | "RECEIPT_MISMATCH"
  | "LOCK_MISMATCH"
  | "ACTION_MISMATCH"
  | "SNAPSHOT_MISMATCH"
  | "INVALID_TIME"
  | "AUTHORIZATION_EXPIRED";

export class TrustedExecutionAuthorizationErrorV2
  extends Error {
  constructor(
    public readonly code:
      TrustedExecutionAuthorizationErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export type TrustedExecutorStateErrorCodeV2 =
  | "STATE_UNAVAILABLE"
  | "STATE_CHANGED";

export class TrustedExecutorStateErrorV2
  extends Error {
  constructor(
    public readonly code:
      TrustedExecutorStateErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface TrustedExecutionAuthorizationV2 {
  authorization_version:
    typeof TRUSTED_EXECUTION_AUTHORIZATION_VERSION;

  status:
    "TRUSTED_EXECUTION_AUTHORIZATION_VERIFIED";

  receipt:
    ExecutionAuthorizationReceiptV2;

  consumption:
    ExecutionReceiptConsumptionV2;

  verified_at:
    string;

  execution_configured:
    false;

  external_action_executed:
    false;
}

export interface TrustedExecutionAuthorizationOptionsV2 {
  checkedAt?:
    string;
}

export interface TrustedExecutorResultV2 {
  executor_version:
    typeof TRUSTED_EXECUTOR_VERSION;

  receipt_id:
    string;

  consumption_id:
    string;

  provider:
    string;

  action:
    string;

  status:
    "EXECUTED" |
    "FAILED";

  external_action_executed:
    boolean;

  completed_at:
    string;
}

export interface TrustedExecutorV2 {
  execute(
    authorization:
      TrustedExecutionAuthorizationV2
  ): Promise<
    TrustedExecutorResultV2
  >;
}

function clone<T>(
  value:
    T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
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
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_CONSUMPTION",
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
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
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_CONSUMPTION",
      `${label} must be a non-empty string.`
    );
  }

  return value.trim();
}

function requiredDigest(
  value:
    unknown,

  label:
    string
): string {
  const digest =
    requiredString(
      value,
      label
    ).toLowerCase();

  if (
    !SHA256.test(
      digest
    )
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_CONSUMPTION",
      `${label} must be a SHA-256 hex digest.`
    );
  }

  return digest;
}

function normalizeTimestamp(
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
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_TIME",
      `${label} must be a non-empty timestamp.`
    );
  }

  const parsed =
    Date.parse(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_TIME",
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function validateConsumption(
  value:
    unknown
): ExecutionReceiptConsumptionV2 {
  const object =
    asObject(
      value,
      "ExecutionReceiptConsumptionV2"
    );

  for (
    const key
    of Object.keys(
      object
    )
  ) {
    if (
      !CONSUMPTION_FIELDS.has(
        key
      )
    ) {
      throw new TrustedExecutionAuthorizationErrorV2(
        "INVALID_CONSUMPTION",
        `ExecutionReceiptConsumptionV2 contains unsupported field: ${key}.`
      );
    }
  }

  if (
    object.consumption_version !==
      "2" ||
    object.status !==
      "CONSUMED_FOR_EXECUTION" ||
    object.execution_configured !==
      false ||
    object.external_action_executed !==
      false
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_CONSUMPTION",
      "Execution receipt consumption is not eligible for trusted execution."
    );
  }

  const consumptionId =
    requiredString(
      object.consumption_id,
      "consumption_id"
    );

  const receiptId =
    requiredString(
      object.receipt_id,
      "receipt_id"
    );

  const receiptDigest =
    requiredDigest(
      object.receipt_digest,
      "receipt_digest"
    );

  const lockId =
    requiredString(
      object.lock_id,
      "lock_id"
    );

  const lockFingerprint =
    requiredDigest(
      object.lock_fingerprint,
      "lock_fingerprint"
    );

  const actionDigest =
    requiredDigest(
      object.action_digest,
      "action_digest"
    );

  const authorizedSnapshotVersion =
    requiredString(
      object.authorized_snapshot_version,
      "authorized_snapshot_version"
    );

  const consumedAt =
    normalizeTimestamp(
      object.consumed_at,
      "consumed_at"
    );

  const consumptionDigest =
    requiredDigest(
      object.consumption_digest,
      "consumption_digest"
    );

  const material = {
    consumption_version:
      "2" as const,

    consumption_id:
      consumptionId,

    receipt_id:
      receiptId,

    receipt_digest:
      receiptDigest,

    lock_id:
      lockId,

    lock_fingerprint:
      lockFingerprint,

    action_digest:
      actionDigest,

    authorized_snapshot_version:
      authorizedSnapshotVersion,

    status:
      "CONSUMED_FOR_EXECUTION" as const,

    consumed_at:
      consumedAt,

    execution_configured:
      false as const,

    external_action_executed:
      false as const
  };

  if (
    consumptionDigest !==
    digestCanonicalJson(
      material
    )
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_CONSUMPTION",
      "Execution receipt consumption digest verification failed."
    );
  }

  return {
    ...material,

    consumption_digest:
      consumptionDigest
  };
}

export function validateTrustedExecutionAuthorizationV2(
  receiptValue:
    unknown,

  consumptionValue:
    unknown,

  options:
    TrustedExecutionAuthorizationOptionsV2 = {}
): TrustedExecutionAuthorizationV2 {
  if (
    !verifyExecutionAuthorizationReceiptIntegrityV2(
      receiptValue
    )
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_RECEIPT",
      "Execution authorization receipt failed integrity verification."
    );
  }

  const receipt =
    clone(
      receiptValue as
        ExecutionAuthorizationReceiptV2
    );

  const consumption =
    validateConsumption(
      consumptionValue
    );

  if (
    consumption.receipt_id !==
      receipt.receipt_id ||
    consumption.receipt_digest !==
      receipt.receipt_digest
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "RECEIPT_MISMATCH",
      "Consumption is bound to another execution authorization receipt."
    );
  }

  if (
    consumption.lock_id !==
      receipt.lock_id ||
    consumption.lock_fingerprint !==
      receipt.lock_fingerprint
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "LOCK_MISMATCH",
      "Consumption is bound to another ActionLock."
    );
  }

  const expectedActionDigest =
    digestCanonicalJson(
      receipt.proposed_action
    );

  if (
    receipt.action_digest !==
      expectedActionDigest ||
    consumption.action_digest !==
      expectedActionDigest
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "ACTION_MISMATCH",
      "Trusted execution action differs from the authorized action."
    );
  }

  if (
    consumption
      .authorized_snapshot_version !==
    receipt
      .authorized_snapshot_version
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "SNAPSHOT_MISMATCH",
      "Trusted execution resource version differs from the authorized version."
    );
  }

  const consumedAt =
    Date.parse(
      normalizeTimestamp(
        consumption.consumed_at,
        "consumed_at"
      )
    );

  const issuedAt =
    Date.parse(
      normalizeTimestamp(
        receipt.issued_at,
        "receipt.issued_at"
      )
    );

  const expiresAt =
    Date.parse(
      normalizeTimestamp(
        receipt.expires_at,
        "receipt.expires_at"
      )
    );

  if (
    consumedAt <
      issuedAt ||
    consumedAt >=
      expiresAt
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_TIME",
      "Execution consumption occurred outside the receipt authorization window."
    );
  }

  const verifiedAt =
    normalizeTimestamp(
      options.checkedAt ??
        new Date().toISOString(),
      "TrustedExecutionAuthorizationV2.verified_at"
    );

  const verifiedAtMs =
    Date.parse(
      verifiedAt
    );

  if (
    verifiedAtMs <
      consumedAt
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "INVALID_TIME",
      "Trusted execution verification cannot occur before receipt consumption."
    );
  }

  if (
    verifiedAtMs >=
      expiresAt
  ) {
    throw new TrustedExecutionAuthorizationErrorV2(
      "AUTHORIZATION_EXPIRED",
      "Execution authorization receipt expired before trusted execution."
    );
  }

  return {
    authorization_version:
      TRUSTED_EXECUTION_AUTHORIZATION_VERSION,

    status:
      "TRUSTED_EXECUTION_AUTHORIZATION_VERIFIED",

    receipt,

    consumption:
      clone(
        consumption
      ),

    verified_at:
      verifiedAt,

    execution_configured:
      false,

    external_action_executed:
      false
  };
}
