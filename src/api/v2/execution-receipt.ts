import {
  randomUUID
} from "node:crypto";

import {
  digestCanonicalJson
} from "../../core/authorization-integrity.js";

import {
  verifyGenericActionLockV2
} from "../../core/action-lock.js";

import {
  validateAuthorizationApprovalRecordV2
} from "./approval-store.js";

import type {
  SubjectRef,
  ProposedAction
} from "../../core/contracts.js";

import type {
  AuthorizationSessionV2
} from "./session-store.js";

import type {
  AuthorizationApprovalRecordV2
} from "./approval-store.js";

import type {
  GenericPreflightApiResponseV2
} from "./preflight.js";

export const EXECUTION_AUTHORIZATION_RECEIPT_VERSION =
  "2" as const;

const SHA256 =
  /^[0-9a-f]{64}$/i;

const DEFAULT_RECEIPT_TTL_MS =
  5 * 60 * 1000;

export type ExecutionAuthorizationReceiptErrorCodeV2 =
  | "INVALID_SESSION"
  | "INVALID_PREFLIGHT"
  | "INVALID_APPROVAL"
  | "INVALID_TIME"
  | "INVALID_TTL"
  | "AUTHORIZATION_EXPIRED";

export class ExecutionAuthorizationReceiptErrorV2
  extends Error {
  constructor(
    public readonly code:
      ExecutionAuthorizationReceiptErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface ExecutionAuthorizationReceiptV2 {
  receipt_version:
    typeof EXECUTION_AUTHORIZATION_RECEIPT_VERSION;

  receipt_id:
    string;

  session_id:
    string;

  request_id:
    string;

  lock_id:
    string;

  lock_fingerprint:
    string;

  status:
    "AUTHORIZED_FOR_EXECUTOR";

  subject:
    SubjectRef;

  snapshot_id:
    string;

  authorized_snapshot_version:
    string;

  proposed_action:
    ProposedAction;

  action_digest:
    string;

  policy_digest:
    string;

  runtime_digest:
    string;

  approval_requirement:
    "REQUIRED" |
    "OPTIONAL" |
    "NONE";

  approval_id?:
    string;

  approval_principal_id?:
    string;

  approval_record_digest?:
    string;

  approval_attestation_digest?:
    string;

  preflight_checked_at:
    string;

  preflight_response_digest:
    string;

  issued_at:
    string;

  expires_at:
    string;

  execution_configured:
    false;

  external_action_executed:
    false;

  receipt_digest:
    string;
}

export interface CreateExecutionAuthorizationReceiptOptionsV2 {
  receiptId?:
    string;

  issuedAt?:
    string;

  ttlMs?:
    number;
}

function clone<T>(
  value:
    T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
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
    throw new ExecutionAuthorizationReceiptErrorV2(
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
    throw new ExecutionAuthorizationReceiptErrorV2(
      "INVALID_TIME",
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function validTtl(
  value:
    number
): number {
  if (
    !Number.isInteger(
      value
    ) ||
    value <= 0
  ) {
    throw new ExecutionAuthorizationReceiptErrorV2(
      "INVALID_TTL",
      "Execution authorization receipt TTL must be a positive integer."
    );
  }

  return value;
}

function validateSessionBinding(
  session:
    AuthorizationSessionV2
): void {
  if (
    !verifyGenericActionLockV2(
      session.lock
    )
  ) {
    throw new ExecutionAuthorizationReceiptErrorV2(
      "INVALID_SESSION",
      "Execution receipt requires a valid ActionLock."
    );
  }

  if (
    session.lock_id !==
      session.lock.lock_id ||
    session.lock_fingerprint !==
      session.lock.fingerprint ||
    session.request_id !==
      session.lock
        .intent
        .request
        .request_id
  ) {
    throw new ExecutionAuthorizationReceiptErrorV2(
      "INVALID_SESSION",
      "Authorization session is not bound to its ActionLock."
    );
  }
}

function validatePreflightBinding(
  session:
    AuthorizationSessionV2,

  response:
    GenericPreflightApiResponseV2
): void {
  const preflight =
    response.preflight;

  const request =
    session.lock
      .intent
      .request;

  if (
    response.api_version !==
      "2" ||
    response.session_id !==
      session.session_id ||
    response.request_id !==
      session.request_id ||
    response.status !==
      "AUTHORIZED_FOR_EXECUTOR" ||
    response.next_step !==
      "TRUSTED_EXECUTOR" ||
    response.execution_configured !==
      false ||
    response.external_action_executed !==
      false
  ) {
    throw new ExecutionAuthorizationReceiptErrorV2(
      "INVALID_PREFLIGHT",
      "Preflight API response is not eligible for executor authorization."
    );
  }

  if (
    preflight.status !==
      "PRE_EXECUTION_VERIFIED" ||
    preflight.lock_id !==
      session.lock_id ||
    preflight.lock_fingerprint !==
      session.lock_fingerprint ||
    preflight.approval_requirement !==
      request.policy
        .human_approval ||
    preflight.observed_snapshot_version !==
      request.snapshot.version ||
    preflight.subject_integrity_verified !==
      true ||
    preflight.snapshot_integrity_verified !==
      true ||
    preflight.action_integrity_verified !==
      true ||
    preflight.policy_integrity_verified !==
      true ||
    preflight.runtime_integrity_verified !==
      true ||
    preflight.execution_permitted_by_policy !==
      true ||
    preflight.execution_configured !==
      false ||
    preflight.external_action_executed !==
      false
  ) {
    throw new ExecutionAuthorizationReceiptErrorV2(
      "INVALID_PREFLIGHT",
      "Preflight result is not bound to the exact authorized state."
    );
  }
}

export function createExecutionAuthorizationReceiptV2(
  session:
    AuthorizationSessionV2,

  preflightResponse:
    GenericPreflightApiResponseV2,

  approvalRecordValue:
    AuthorizationApprovalRecordV2 |
    undefined,

  options:
    CreateExecutionAuthorizationReceiptOptionsV2 = {}
): ExecutionAuthorizationReceiptV2 {
  validateSessionBinding(
    session
  );

  validatePreflightBinding(
    session,
    preflightResponse
  );

  const request =
    session.lock
      .intent
      .request;

  const requirement =
    request.policy
      .human_approval;

  let approvalRecord:
    AuthorizationApprovalRecordV2 |
    undefined;

  if (
    approvalRecordValue
  ) {
    try {
      approvalRecord =
        validateAuthorizationApprovalRecordV2(
          approvalRecordValue,
          session
        );
    } catch (error) {
      throw new ExecutionAuthorizationReceiptErrorV2(
        "INVALID_APPROVAL",
        error instanceof Error
          ? error.message
          : "Approval record is invalid."
      );
    }

    if (
      approvalRecord
        .attestation
        .decision !==
          "APPROVED"
    ) {
      throw new ExecutionAuthorizationReceiptErrorV2(
        "INVALID_APPROVAL",
        "Execution receipt requires an approved human attestation."
      );
    }
  }

  if (
    requirement ===
      "NONE"
  ) {
    if (
      approvalRecord ||
      preflightResponse
        .preflight
        .approval_verified ||
      preflightResponse
        .preflight
        .approval_id
    ) {
      throw new ExecutionAuthorizationReceiptErrorV2(
        "INVALID_APPROVAL",
        "Policy NONE must not produce an approval-bound execution receipt."
      );
    }
  } else if (
    preflightResponse
      .preflight
      .approval_verified
  ) {
    if (
      !approvalRecord
    ) {
      throw new ExecutionAuthorizationReceiptErrorV2(
        "INVALID_APPROVAL",
        "Verified preflight approval requires its trusted approval record."
      );
    }

    if (
      preflightResponse
        .preflight
        .approval_id !==
      approvalRecord
        .attestation
        .approval_id
    ) {
      throw new ExecutionAuthorizationReceiptErrorV2(
        "INVALID_APPROVAL",
        "Preflight approval does not match the trusted approval record."
      );
    }
  } else {
    if (
      requirement ===
        "REQUIRED"
    ) {
      throw new ExecutionAuthorizationReceiptErrorV2(
        "INVALID_APPROVAL",
        "Required human approval was not verified."
      );
    }

    if (
      approvalRecord
    ) {
      throw new ExecutionAuthorizationReceiptErrorV2(
        "INVALID_APPROVAL",
        "Unused approval record cannot be attached to this receipt."
      );
    }
  }

  const preflightCheckedAt =
    normalizeTimestamp(
      preflightResponse
        .preflight
        .checked_at,
      "ExecutionAuthorizationReceiptV2.preflight_checked_at"
    );

  const issuedAt =
    normalizeTimestamp(
      options.issuedAt ??
        preflightCheckedAt,
      "ExecutionAuthorizationReceiptV2.issued_at"
    );

  if (
    Date.parse(
      issuedAt
    ) <
    Date.parse(
      preflightCheckedAt
    )
  ) {
    throw new ExecutionAuthorizationReceiptErrorV2(
      "INVALID_TIME",
      "Execution receipt cannot be issued before preflight verification."
    );
  }

  const ttlMs =
    validTtl(
      options.ttlMs ??
        DEFAULT_RECEIPT_TTL_MS
    );

  const expiryLimits = [
    Date.parse(
      issuedAt
    ) + ttlMs,

    Date.parse(
      normalizeTimestamp(
        session.expires_at,
        "AuthorizationSessionV2.expires_at"
      )
    )
  ];

  if (
    approvalRecord
      ?.attestation
      .approval_expires_at
  ) {
    expiryLimits.push(
      Date.parse(
        normalizeTimestamp(
          approvalRecord
            .attestation
            .approval_expires_at,
          "ApprovalAttestationV2.approval_expires_at"
        )
      )
    );
  }

  const expiresAtMs =
    Math.min(
      ...expiryLimits
    );

  if (
    expiresAtMs <=
    Date.parse(
      issuedAt
    )
  ) {
    throw new ExecutionAuthorizationReceiptErrorV2(
      "AUTHORIZATION_EXPIRED",
      "Authorization expired before an execution receipt could be issued."
    );
  }

  const base:
    Omit<
      ExecutionAuthorizationReceiptV2,
      "receipt_digest"
    > = {
    receipt_version:
      EXECUTION_AUTHORIZATION_RECEIPT_VERSION,

    receipt_id:
      options.receiptId ??
      randomUUID(),

    session_id:
      session.session_id,

    request_id:
      session.request_id,

    lock_id:
      session.lock_id,

    lock_fingerprint:
      session.lock_fingerprint,

    status:
      "AUTHORIZED_FOR_EXECUTOR",

    subject:
      clone(
        request.subject
      ),

    snapshot_id:
      request.snapshot
        .snapshot_id,

    authorized_snapshot_version:
      preflightResponse
        .preflight
        .observed_snapshot_version,

    proposed_action:
      clone(
        request.proposed_action
      ),

    action_digest:
      digestCanonicalJson(
        request.proposed_action
      ),

    policy_digest:
      digestCanonicalJson(
        request.policy
      ),

    runtime_digest:
      digestCanonicalJson(
        request.runtime
      ),

    approval_requirement:
      requirement,

    ...(approvalRecord
      ? {
          approval_id:
            approvalRecord
              .attestation
              .approval_id,

          approval_principal_id:
            approvalRecord
              .attestation
              .principal
              .principal_id,

          approval_record_digest:
            approvalRecord
              .record_digest,

          approval_attestation_digest:
            approvalRecord
              .attestation
              .attestation_digest
        }
      : {}),

    preflight_checked_at:
      preflightCheckedAt,

    preflight_response_digest:
      digestCanonicalJson(
        preflightResponse
      ),

    issued_at:
      issuedAt,

    expires_at:
      new Date(
        expiresAtMs
      ).toISOString(),

    execution_configured:
      false,

    external_action_executed:
      false
  };

  return {
    ...base,

    receipt_digest:
      digestCanonicalJson(
        base
      )
  };
}

export function verifyExecutionAuthorizationReceiptIntegrityV2(
  value:
    unknown
): boolean {
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

  if (
    object.receipt_version !==
      EXECUTION_AUTHORIZATION_RECEIPT_VERSION ||
    object.status !==
      "AUTHORIZED_FOR_EXECUTOR" ||
    object.execution_configured !==
      false ||
    object.external_action_executed !==
      false ||
    typeof object.receipt_digest !==
      "string" ||
    !SHA256.test(
      object.receipt_digest
    )
  ) {
    return false;
  }

  const material = {
    ...object
  };

  delete material
    .receipt_digest;

  return (
    object.receipt_digest
      .toLowerCase() ===
    digestCanonicalJson(
      material
    )
  );
}
