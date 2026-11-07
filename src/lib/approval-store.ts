import {
  actionLockMatchesResult,
  createActionLock,
  verifyActionLock
} from "./action-integrity.js";

import type {
  ActionIntent,
  ActionLock,
  OrchestrationResult,
  PreExecutionCheck
} from "../types.js";

export type ApprovalStoreErrorCode =
  | "NOT_FOUND"
  | "EXPIRED"
  | "ALREADY_APPROVED"
  | "NOT_APPROVED"
  | "FINGERPRINT_MISMATCH"
  | "INTEGRITY_FAILED"
  | "INVALID_TARGET_SHA"
  | "TARGET_CHANGED"
  | "CAPACITY_REACHED";

export class ApprovalStoreError
  extends Error {
  constructor(
    public readonly code:
      ApprovalStoreErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface ApprovalView {
  approval_id: string;

  fingerprint: string;

  status:
    | "PENDING"
    | "APPROVED";

  intent: ActionIntent;

  created_at: string;
  approved_at?: string;

  expires_at: string;

  external_action_executed:
    false;

  execution_configured:
    false;
}

interface ApprovalRecord {
  lock: ActionLock;

  assessment:
    OrchestrationResult;

  expires_at_ms: number;
}

function clone<T>(
  value: T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

const FULL_GIT_SHA =
  /^[0-9a-f]{40}$/i;

export class ApprovalStore {
  private readonly records =
    new Map<
      string,
      ApprovalRecord
    >();

  constructor(
    private readonly ttlMs =
      15 * 60 * 1000,

    private readonly maxEntries =
      100,

    private readonly now:
      () => number =
      () => Date.now()
  ) {}

  private view(
    record: ApprovalRecord
  ): ApprovalView {
    return {
      approval_id:
        record.lock.approval_id,

      fingerprint:
        record.lock.fingerprint,

      status:
        record.lock.status,

      intent:
        clone(
          record.lock.intent
        ),

      created_at:
        record.lock.created_at,

      ...(record.lock.approved_at
        ? {
            approved_at:
              record.lock.approved_at
          }
        : {}),

      expires_at:
        new Date(
          record.expires_at_ms
        ).toISOString(),

      external_action_executed:
        false,

      execution_configured:
        false
    };
  }

  private purgeExpired(): void {
    const now =
      this.now();

    for (
      const [
        approvalId,
        record
      ] of this.records
    ) {
      if (
        record.expires_at_ms <=
          now
      ) {
        this.records.delete(
          approvalId
        );
      }
    }
  }

  create(
    result:
      OrchestrationResult
  ): ApprovalView {
    this.purgeExpired();

    if (
      this.records.size >=
      this.maxEntries
    ) {
      throw new ApprovalStoreError(
        "CAPACITY_REACHED",
        "Approval store capacity reached."
      );
    }

    const now =
      this.now();

    const createdAt =
      new Date(now)
        .toISOString();

    const lock =
      createActionLock(
        result,
        {
          createdAt
        }
      );

    const record:
      ApprovalRecord = {
      lock:
        clone(lock),

      assessment:
        clone(result),

      expires_at_ms:
        now + this.ttlMs
    };

    this.records.set(
      lock.approval_id,
      record
    );

    return this.view(
      record
    );
  }

  approve(
    approvalId: string,
    fingerprint: string
  ): ApprovalView {
    const record =
      this.records.get(
        approvalId
      );

    if (!record) {
      throw new ApprovalStoreError(
        "NOT_FOUND",
        "Approval was not found."
      );
    }

    const now =
      this.now();

    if (
      record.expires_at_ms <=
      now
    ) {
      this.records.delete(
        approvalId
      );

      throw new ApprovalStoreError(
        "EXPIRED",
        "Approval has expired."
      );
    }

    if (
      record.lock.status !==
      "PENDING"
    ) {
      throw new ApprovalStoreError(
        "ALREADY_APPROVED",
        "Approval has already been completed."
      );
    }

    if (
      fingerprint !==
      record.lock.fingerprint
    ) {
      throw new ApprovalStoreError(
        "FINGERPRINT_MISMATCH",
        "Approval fingerprint does not match the server lock."
      );
    }

    if (
      !verifyActionLock(
        record.lock
      )
    ) {
      throw new ApprovalStoreError(
        "INTEGRITY_FAILED",
        "Stored ActionLock failed fingerprint verification."
      );
    }

    if (
      !actionLockMatchesResult(
        record.lock,
        record.assessment
      )
    ) {
      throw new ApprovalStoreError(
        "INTEGRITY_FAILED",
        "Stored assessment no longer matches the ActionLock."
      );
    }

    record.lock = {
      ...record.lock,

      status:
        "APPROVED",

      approved_at:
        new Date(now)
          .toISOString()
    };

    return this.view(
      record
    );
  }

  preflight(
    approvalId: string,
    fingerprint: string,
    observedTargetSha: string
  ): PreExecutionCheck {
    const record =
      this.records.get(
        approvalId
      );

    if (!record) {
      throw new ApprovalStoreError(
        "NOT_FOUND",
        "Approval was not found."
      );
    }

    const now =
      this.now();

    if (
      record.expires_at_ms <=
      now
    ) {
      this.records.delete(
        approvalId
      );

      throw new ApprovalStoreError(
        "EXPIRED",
        "Approval has expired."
      );
    }

    if (
      record.lock.status !==
      "APPROVED"
    ) {
      throw new ApprovalStoreError(
        "NOT_APPROVED",
        "Action has not received human approval."
      );
    }

    if (
      fingerprint !==
      record.lock.fingerprint
    ) {
      throw new ApprovalStoreError(
        "FINGERPRINT_MISMATCH",
        "Pre-execution fingerprint does not match the approved ActionLock."
      );
    }

    if (
      !verifyActionLock(
        record.lock
      )
    ) {
      throw new ApprovalStoreError(
        "INTEGRITY_FAILED",
        "Approved ActionLock failed fingerprint verification."
      );
    }

    if (
      !actionLockMatchesResult(
        record.lock,
        record.assessment
      )
    ) {
      throw new ApprovalStoreError(
        "INTEGRITY_FAILED",
        "Approved assessment no longer matches the ActionLock."
      );
    }

    const observedSha =
      observedTargetSha
        .trim()
        .toLowerCase();

    if (
      !FULL_GIT_SHA.test(
        observedSha
      )
    ) {
      throw new ApprovalStoreError(
        "INVALID_TARGET_SHA",
        "Observed pre-execution target must be a full 40-character Git SHA."
      );
    }

    const lockedSha =
      record.lock.intent
        .locked_sha
        .toLowerCase();

    if (
      observedSha !==
      lockedSha
    ) {
      throw new ApprovalStoreError(
        "TARGET_CHANGED",
        "Target changed after human approval. Execution is blocked."
      );
    }

    return {
      approval_id:
        record.lock.approval_id,

      fingerprint:
        record.lock.fingerprint,

      status:
        "PRE_EXECUTION_VERIFIED",

      approval_status:
        "APPROVED",

      locked_sha:
        lockedSha,

      observed_sha:
        observedSha,

      action_integrity_verified:
        true,

      target_integrity_verified:
        true,

      execution_permitted_by_policy:
        true,

      execution_configured:
        false,

      external_action_executed:
        false,

      checked_at:
        new Date(now)
          .toISOString()
    };
  }
}
