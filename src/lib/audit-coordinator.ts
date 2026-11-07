import {
  randomUUID
} from "node:crypto";

import {
  ApprovalStore,
  ApprovalStoreError
} from "./approval-store.js";

import {
  AuditTrail
} from "./audit-trail.js";

import type {
  ApprovalView
} from "./approval-store.js";

import type {
  AuditCheckpoint,
  AuditEvent,
  OrchestrationResult,
  PreExecutionCheck
} from "../types.js";

export interface AssessmentAuditResult {
  assessment_id: string;

  approval?:
    ApprovalView;

  audit_checkpoint:
    AuditCheckpoint;
}

export class AuditCoordinator {
  constructor(
    private readonly approvalStore =
      new ApprovalStore(),

    private readonly auditTrail =
      new AuditTrail()
  ) {}

  completeAssessment(
    result:
      OrchestrationResult,

    assessmentId =
      randomUUID()
  ): AssessmentAuditResult {
    const lockedSha =
      result.target_integrity
        .locked_sha;

    this.auditTrail.append(
      "ASSESSMENT_COMPLETED",
      assessmentId,
      {
        repository:
          result.repository,

        target:
          result.target,

        status:
          result.status,

        worker_decision:
          result.worker.decision,

        guard_verdict:
          result.guard.verdict,

        target_integrity_status:
          result.target_integrity
            .status,

        locked_sha:
          lockedSha ?? null,

        human_approval_required:
          result
            .human_approval_required,

        external_action_executed:
          result
            .external_action_executed
      }
    );

    if (
      !result
        .human_approval_required
    ) {
      return {
        assessment_id:
          assessmentId,

        audit_checkpoint:
          this.auditTrail
            .checkpoint()
      };
    }

    const approval =
      this.approvalStore.create(
        result
      );

    this.auditTrail.append(
      "ACTION_LOCK_CREATED",
      approval.approval_id,
      {
        assessment_id:
          assessmentId,

        fingerprint:
          approval.fingerprint,

        repository:
          approval.intent
            .repository,

        action_type:
          approval.intent
            .action_type,

        locked_sha:
          approval.intent
            .locked_sha,

        assessment_digest:
          approval.intent
            .assessment_digest,

        expires_at:
          approval.expires_at
      }
    );

    return {
      assessment_id:
        assessmentId,

      approval,

      audit_checkpoint:
        this.auditTrail
          .checkpoint()
    };
  }

  approve(
    approvalId: string,
    fingerprint: string
  ): ApprovalView {
    try {
      const approval =
        this.approvalStore
          .approve(
            approvalId,
            fingerprint
          );

      this.auditTrail.append(
        "APPROVAL_GRANTED",
        approval.approval_id,
        {
          fingerprint:
            approval.fingerprint,

          action_type:
            approval.intent
              .action_type,

          locked_sha:
            approval.intent
              .locked_sha,

          approved_at:
            approval.approved_at ??
            null,

          external_action_executed:
            false
        }
      );

      return approval;
    } catch (error) {
      if (
        error instanceof
          ApprovalStoreError
      ) {
        this.auditTrail.append(
          "APPROVAL_REJECTED",
          approvalId,
          {
            code:
              error.code
          }
        );
      }

      throw error;
    }
  }

  preflight(
    approvalId: string,
    fingerprint: string,
    observedTargetSha: string
  ): PreExecutionCheck {
    try {
      const check =
        this.approvalStore
          .preflight(
            approvalId,
            fingerprint,
            observedTargetSha
          );

      this.auditTrail.append(
        "PREFLIGHT_VERIFIED",
        approvalId,
        {
          fingerprint:
            check.fingerprint,

          locked_sha:
            check.locked_sha,

          observed_sha:
            check.observed_sha,

          execution_configured:
            check
              .execution_configured,

          external_action_executed:
            check
              .external_action_executed
        }
      );

      return check;
    } catch (error) {
      if (
        error instanceof
          ApprovalStoreError
      ) {
        this.auditTrail.append(
          "PREFLIGHT_BLOCKED",
          approvalId,
          {
            code:
              error.code
          }
        );
      }

      throw error;
    }
  }

  checkpoint():
    AuditCheckpoint {
    return this.auditTrail
      .checkpoint();
  }

  snapshot():
    AuditEvent[] {
    return this.auditTrail
      .snapshot();
  }

  verify(): boolean {
    return this.auditTrail
      .verify();
  }
}
