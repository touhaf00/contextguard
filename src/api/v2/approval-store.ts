import {
  digestCanonicalJson
} from "../../core/authorization-integrity.js";

import {
  validateApprovalAttestationV2
} from "../../core/approval-attestation.js";

import type {
  ApprovalAttestationV2
} from "../../core/approval-attestation.js";

import type {
  AuthorizationSessionV2
} from "./session-store.js";

export const AUTHORIZATION_APPROVAL_RECORD_VERSION =
  "2" as const;

export interface AuthorizationApprovalRecordV2 {
  record_version:
    typeof AUTHORIZATION_APPROVAL_RECORD_VERSION;

  session_id:
    string;

  lock_id:
    string;

  lock_fingerprint:
    string;

  attestation:
    ApprovalAttestationV2;

  record_digest:
    string;
}

export type AuthorizationApprovalStoreErrorCodeV2 =
  | "INVALID_RECORD"
  | "ALREADY_DECIDED"
  | "NOT_FOUND";

export class AuthorizationApprovalStoreErrorV2
  extends Error {
  constructor(
    public readonly code:
      AuthorizationApprovalStoreErrorCodeV2,

    message: string
  ) {
    super(message);
  }
}

function clone<T>(
  value: T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function recordDigest(
  value: Omit<
    AuthorizationApprovalRecordV2,
    "record_digest"
  >
): string {
  return digestCanonicalJson({
    record_version:
      value.record_version,

    session_id:
      value.session_id,

    lock_id:
      value.lock_id,

    lock_fingerprint:
      value.lock_fingerprint,

    attestation_digest:
      value.attestation
        .attestation_digest
  });
}

export function validateAuthorizationApprovalRecordV2(
  value:
    AuthorizationApprovalRecordV2,

  session:
    AuthorizationSessionV2
): AuthorizationApprovalRecordV2 {
  if (
    value.record_version !==
      AUTHORIZATION_APPROVAL_RECORD_VERSION
  ) {
    throw new AuthorizationApprovalStoreErrorV2(
      "INVALID_RECORD",
      "Authorization approval record version is invalid."
    );
  }

  if (
    value.session_id !==
      session.session_id
  ) {
    throw new AuthorizationApprovalStoreErrorV2(
      "INVALID_RECORD",
      "Authorization approval record belongs to another session."
    );
  }

  if (
    value.lock_id !==
      session.lock_id ||
    value.lock_fingerprint !==
      session.lock_fingerprint
  ) {
    throw new AuthorizationApprovalStoreErrorV2(
      "INVALID_RECORD",
      "Authorization approval record is bound to another ActionLock."
    );
  }

  let attestation:
    ApprovalAttestationV2;

  try {
    attestation =
      validateApprovalAttestationV2(
        value.attestation,
        session.lock
      );
  } catch (error) {
    throw new AuthorizationApprovalStoreErrorV2(
      "INVALID_RECORD",
      error instanceof Error
        ? error.message
        : "Approval attestation is invalid."
    );
  }

  const base = {
    record_version:
      AUTHORIZATION_APPROVAL_RECORD_VERSION,

    session_id:
      session.session_id,

    lock_id:
      session.lock_id,

    lock_fingerprint:
      session.lock_fingerprint,

    attestation
  } as const;

  if (
    value.record_digest !==
      recordDigest(base)
  ) {
    throw new AuthorizationApprovalStoreErrorV2(
      "INVALID_RECORD",
      "Authorization approval record digest verification failed."
    );
  }

  return {
    ...base,

    record_digest:
      value.record_digest
  };
}

export class AuthorizationApprovalStoreV2 {
  private readonly records =
    new Map<
      string,
      AuthorizationApprovalRecordV2
    >();

  record(
    session:
      AuthorizationSessionV2,

    attestationValue:
      unknown
  ): AuthorizationApprovalRecordV2 {
    if (
      this.records.has(
        session.session_id
      )
    ) {
      throw new AuthorizationApprovalStoreErrorV2(
        "ALREADY_DECIDED",
        "This authorization session already has a human decision."
      );
    }

    let attestation:
      ApprovalAttestationV2;

    try {
      attestation =
        validateApprovalAttestationV2(
          attestationValue,
          session.lock
        );
    } catch (error) {
      throw new AuthorizationApprovalStoreErrorV2(
        "INVALID_RECORD",
        error instanceof Error
          ? error.message
          : "Approval attestation is invalid."
      );
    }

    const base = {
      record_version:
        AUTHORIZATION_APPROVAL_RECORD_VERSION,

      session_id:
        session.session_id,

      lock_id:
        session.lock_id,

      lock_fingerprint:
        session.lock_fingerprint,

      attestation
    } as const;

    const record:
      AuthorizationApprovalRecordV2 = {
      ...base,

      record_digest:
        recordDigest(
          base
        )
    };

    this.records.set(
      session.session_id,
      clone(record)
    );

    return clone(
      record
    );
  }

  get(
    session:
      AuthorizationSessionV2
  ): AuthorizationApprovalRecordV2 {
    const record =
      this.records.get(
        session.session_id
      );

    if (!record) {
      throw new AuthorizationApprovalStoreErrorV2(
        "NOT_FOUND",
        "No human decision exists for this authorization session."
      );
    }

    return clone(
      validateAuthorizationApprovalRecordV2(
        record,
        session
      )
    );
  }

  has(
    sessionId:
      string
  ): boolean {
    return this.records.has(
      sessionId
    );
  }
}
