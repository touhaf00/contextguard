import {
  APPROVAL_DECISIONS,
  validateHumanApprovalPrincipalV2
} from "../core/approval-attestation.js";

import {
  verifyGenericActionLockV2
} from "../core/action-lock.js";

import type {
  ApprovalDecisionV2,
  HumanApprovalPrincipalV2
} from "../core/approval-attestation.js";

import type {
  GenericActionLockV2
} from "../core/action-lock.js";

import type {
  ApprovalChallengeV2,
  ApprovalProviderDecisionV2,
  ApprovalProviderV2
} from "./provider.js";

interface PendingDecisionV2 {
  principal:
    HumanApprovalPrincipalV2;

  decision:
    ApprovalDecisionV2;
}

export interface InMemoryApprovalProviderOptionsV2 {
  providerId?: string;

  now?: () => Date;
}

function pendingKey(
  lockId: string,
  fingerprint: string
): string {
  return (
    `${lockId}:${fingerprint}`
  );
}

export class InMemoryApprovalProviderV2
  implements ApprovalProviderV2 {
  readonly provider_version =
    "2" as const;

  readonly provider_id:
    string;

  private readonly now:
    () => Date;

  private readonly pending =
    new Map<
      string,
      PendingDecisionV2
    >();

  constructor(
    options:
      InMemoryApprovalProviderOptionsV2 = {}
  ) {
    this.provider_id =
      options.providerId ??
      "memory.approval";

    this.now =
      options.now ??
      (() => new Date());
  }

  submitDecision(
    lock:
      GenericActionLockV2,
    principalValue: unknown,
    decision:
      ApprovalDecisionV2
  ): void {
    if (
      !verifyGenericActionLockV2(
        lock
      )
    ) {
      throw new Error(
        "Cannot queue approval for an invalid ActionLock."
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
        "This ActionLock policy does not permit human approval."
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

    if (
      !principal
        .authentication_method
    ) {
      throw new Error(
        "In-memory approval requires an authenticated human principal."
      );
    }

    const key =
      pendingKey(
        lock.lock_id,
        lock.fingerprint
      );

    if (
      this.pending.has(
        key
      )
    ) {
      throw new Error(
        "A pending human decision already exists for this ActionLock."
      );
    }

    this.pending.set(
      key,
      {
        principal,
        decision
      }
    );
  }

  hasPendingDecision(
    lock:
      GenericActionLockV2
  ): boolean {
    return this.pending.has(
      pendingKey(
        lock.lock_id,
        lock.fingerprint
      )
    );
  }

  async requestDecision(
    challenge:
      ApprovalChallengeV2
  ): Promise<
    ApprovalProviderDecisionV2
  > {
    if (
      challenge.provider_id !==
        this.provider_id
    ) {
      throw new Error(
        "Approval challenge targets another provider."
      );
    }

    const key =
      pendingKey(
        challenge.lock_id,
        challenge
          .lock_fingerprint
      );

    const pending =
      this.pending.get(
        key
      );

    if (!pending) {
      throw new Error(
        "No pending human decision exists for this ActionLock."
      );
    }

    this.pending.delete(
      key
    );

    return {
      decision_version:
        "2",

      provider_id:
        this.provider_id,

      lock_id:
        challenge.lock_id,

      lock_fingerprint:
        challenge
          .lock_fingerprint,

      principal:
        pending.principal,

      decision:
        pending.decision,

      decided_at:
        this.now()
          .toISOString()
    };
  }
}
