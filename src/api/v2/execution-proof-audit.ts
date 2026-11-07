import {
  createExecutionProofV2
} from "./execution-proof.js";

import {
  ExecutionProofStoreV2
} from "./execution-proof-store.js";

import {
  InMemoryAuditSinkV2
} from "../../audit/in-memory.js";

import {
  validateAuditCheckpointV2,
  validateAuditRecordV2,
  validateAuditSinkV2
} from "../../audit/sink.js";

import type {
  ExecutionProofV2
} from "./execution-proof.js";

import type {
  TrustedExecutorResultV2
} from "../../core/trusted-executor.js";

import type {
  AuditCheckpointV2,
  AuditRecordV2,
  AuditSinkV2
} from "../../audit/sink.js";

export type PostExecutionEvidenceErrorCodeV2 =
  | "EXECUTION_PROOF_RECORDING_FAILED"
  | "EXECUTION_AUDIT_RECORDING_FAILED";

export class PostExecutionEvidenceErrorV2
  extends Error {
  public readonly external_action_executed =
    true as const;

  constructor(
    public readonly code:
      PostExecutionEvidenceErrorCodeV2,

    message:
      string,

    public readonly result:
      TrustedExecutorResultV2
  ) {
    super(message);
  }
}

export interface RecordExecutionProofInputV2 {
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

export interface RecordExecutionProofOptionsV2 {
  proofStore?:
    ExecutionProofStoreV2;

  auditSink?:
    AuditSinkV2;

  proofId?:
    string;

  proofCreatedAt?:
    string;

  auditEventId?:
    string;

  auditTimestamp?:
    string;
}

export interface ExecutionProofAuditResultV2 {
  proof:
    ExecutionProofV2;

  audit_record:
    AuditRecordV2;

  audit_checkpoint:
    AuditCheckpointV2;
}

export async function recordExecutionProofAndAuditV2(
  input:
    RecordExecutionProofInputV2,

  options:
    RecordExecutionProofOptionsV2 = {}
): Promise<ExecutionProofAuditResultV2> {
  const proofStore =
    options.proofStore ??
    new ExecutionProofStoreV2();

  let proof:
    ExecutionProofV2;

  try {
    proof =
      createExecutionProofV2(
        input,
        {
          proofId:
            options.proofId,

          createdAt:
            options.proofCreatedAt
        }
      );

    proof =
      proofStore.record(
        proof
      );
  } catch {
    throw new PostExecutionEvidenceErrorV2(
      "EXECUTION_PROOF_RECORDING_FAILED",
      "External action executed, but execution proof recording failed.",
      input.result
    );
  }

  try {
    const auditSink =
      validateAuditSinkV2(
        options.auditSink ??
          new InMemoryAuditSinkV2({
            sinkId:
              "memory.execution"
          })
      );

    const rawRecord =
      await auditSink.append({
        event_type:
          "external_execution_succeeded",

        subject_key:
          `receipt:${proof.receipt_id}`,

        payload: {
          proof_id:
            proof.proof_id,

          proof_digest:
            proof.proof_digest,

          receipt_id:
            proof.receipt_id,

          receipt_digest:
            proof.receipt_digest,

          consumption_id:
            proof.consumption_id,

          consumption_digest:
            proof.consumption_digest,

          lock_id:
            proof.lock_id,

          lock_fingerprint:
            proof.lock_fingerprint,

          action_digest:
            proof.action_digest,

          authorized_snapshot_version:
            proof.authorized_snapshot_version,

          provider:
            proof.provider,

          action:
            proof.action,

          status:
            proof.status,

          external_action_executed:
            true,

          completed_at:
            proof.completed_at,

          provider_result_digest:
            proof.provider_result_digest
        },

        ...(options.auditEventId
          ? {
              event_id:
                options.auditEventId
            }
          : {}),

        timestamp:
          options.auditTimestamp ??
          proof.created_at
      });

    const auditRecord =
      validateAuditRecordV2(
        rawRecord
      );

    const auditCheckpoint =
      validateAuditCheckpointV2(
        await auditSink.checkpoint()
      );

    return {
      proof,

      audit_record:
        auditRecord,

      audit_checkpoint:
        auditCheckpoint
    };
  } catch {
    throw new PostExecutionEvidenceErrorV2(
      "EXECUTION_AUDIT_RECORDING_FAILED",
      "External action executed and proof was created, but audit recording failed.",
      input.result
    );
  }
}
