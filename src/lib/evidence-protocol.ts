import {
  CLAIM_CRITICALITIES,
  CLAIM_STATUSES,
  EVIDENCE_LEVELS,
  EVIDENCE_SOURCE_TYPES
} from "../types.js";

import type {
  ClaimCriticality,
  ClaimStatus,
  EvidenceLevel,
  EvidenceRecord,
  EvidenceSourceType,
  TargetResolution,
  WorkerClaim,
  WorkerDecision
} from "../types.js";

const FULL_GIT_SHA =
  /^[0-9a-f]{40}$/i;

export interface WorkerEvidenceProtocolOptions {
  expectedRepository?: string;
}

function asRecord(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${label} must be a JSON object.`
    );
  }

  return value as Record<string, unknown>;
}

function requiredString(
  object: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value =
    object[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label}.${key} must be a non-empty string.`
    );
  }

  return value.trim();
}

function optionalString(
  object: Record<string, unknown>,
  key: string,
  label: string
): string | undefined {
  const value =
    object[key];

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label}.${key} must be a non-empty string when provided.`
    );
  }

  return value.trim();
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): T {
  if (
    typeof value !== "string" ||
    !allowed.includes(
      value as T
    )
  ) {
    throw new Error(
      `${label} must be one of: ${allowed.join(", ")}.`
    );
  }

  return value as T;
}

function stringArray(
  value: unknown,
  label: string
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${label} must be an array.`
    );
  }

  const result =
    value.map(
      (item, index) => {
        if (
          typeof item !== "string" ||
          !item.trim()
        ) {
          throw new Error(
            `${label}[${index}] must be a non-empty string.`
          );
        }

        return item.trim();
      }
    );

  if (
    new Set(result).size !==
    result.length
  ) {
    throw new Error(
      `${label} must not contain duplicate values.`
    );
  }

  return result;
}

function validateEvidence(
  rawEvidence: unknown,
  targetResolution: TargetResolution,
  expectedRepository?: string
): EvidenceRecord[] {
  if (!Array.isArray(rawEvidence)) {
    throw new Error(
      "WorkerReport.evidence must be an array."
    );
  }

  if (
    targetResolution.status ===
      "UNRESOLVED" &&
    rawEvidence.length > 0
  ) {
    throw new Error(
      "WorkerReport.evidence must be empty when target_resolution is UNRESOLVED."
    );
  }

  const normalizedExpectedRepository =
    expectedRepository
      ?.trim()
      .toLowerCase();

  if (
    expectedRepository !== undefined &&
    !normalizedExpectedRepository
  ) {
    throw new Error(
      "expectedRepository must be a non-empty repository identifier."
    );
  }

  const evidence:
    EvidenceRecord[] = [];

  const ids =
    new Set<string>();

  rawEvidence.forEach(
    (rawItem, index) => {
      const label =
        `WorkerReport.evidence[${index}]`;

      const item =
        asRecord(
          rawItem,
          label
        );

      const evidenceId =
        requiredString(
          item,
          "evidence_id",
          label
        );

      if (ids.has(evidenceId)) {
        throw new Error(
          `WorkerReport.evidence contains duplicate evidence_id: ${evidenceId}.`
        );
      }

      ids.add(evidenceId);

      const sourceType =
        enumValue<EvidenceSourceType>(
          item.source_type,
          EVIDENCE_SOURCE_TYPES,
          `${label}.source_type`
        );

      const repository =
        requiredString(
          item,
          "repository",
          label
        );

      if (
        normalizedExpectedRepository &&
        repository
          .toLowerCase() !==
          normalizedExpectedRepository
      ) {
        throw new Error(
          `${label}.repository must match the assessed repository.`
        );
      }

      const targetSha =
        requiredString(
          item,
          "target_sha",
          label
        ).toLowerCase();

      if (
        !FULL_GIT_SHA.test(
          targetSha
        )
      ) {
        throw new Error(
          `${label}.target_sha must be a full 40-character Git SHA.`
        );
      }

      if (
        targetResolution.status ===
          "RESOLVED" &&
        targetSha !==
          targetResolution.resolved_sha
      ) {
        throw new Error(
          `${label}.target_sha must match WorkerReport.target_resolution.resolved_sha.`
        );
      }

      const locator =
        requiredString(
          item,
          "locator",
          label
        );

      const observation =
        requiredString(
          item,
          "observation",
          label
        );

      const level =
        enumValue<EvidenceLevel>(
          item.level,
          EVIDENCE_LEVELS,
          `${label}.level`
        );

      const contentHash =
        optionalString(
          item,
          "content_hash",
          label
        );

      const observedAt =
        optionalString(
          item,
          "observed_at",
          label
        );

      evidence.push({
        evidence_id:
          evidenceId,

        source_type:
          sourceType,

        repository,
        target_sha:
          targetSha,

        locator,
        observation,
        level,

        ...(contentHash
          ? {
              content_hash:
                contentHash
            }
          : {}),

        ...(observedAt
          ? {
              observed_at:
                observedAt
            }
          : {})
      });
    }
  );

  return evidence;
}

function validateClaims(
  rawClaims: unknown,
  evidence: EvidenceRecord[]
): WorkerClaim[] {
  if (!Array.isArray(rawClaims)) {
    throw new Error(
      "WorkerReport.claims must be an array."
    );
  }

  if (rawClaims.length === 0) {
    throw new Error(
      "WorkerReport.claims must contain at least one claim when Evidence Protocol is used."
    );
  }

  const evidenceIds =
    new Set(
      evidence.map(
        (item) =>
          item.evidence_id
      )
    );

  const claimIds =
    new Set<string>();

  return rawClaims.map(
    (rawClaim, index) => {
      const label =
        `WorkerReport.claims[${index}]`;

      const claim =
        asRecord(
          rawClaim,
          label
        );

      const claimId =
        requiredString(
          claim,
          "claim_id",
          label
        );

      if (
        claimIds.has(
          claimId
        )
      ) {
        throw new Error(
          `WorkerReport.claims contains duplicate claim_id: ${claimId}.`
        );
      }

      claimIds.add(
        claimId
      );

      const statement =
        requiredString(
          claim,
          "statement",
          label
        );

      const criticality =
        enumValue<ClaimCriticality>(
          claim.criticality,
          CLAIM_CRITICALITIES,
          `${label}.criticality`
        );

      const status =
        enumValue<ClaimStatus>(
          claim.status,
          CLAIM_STATUSES,
          `${label}.status`
        );

      const evidenceRefs =
        stringArray(
          claim.evidence_refs,
          `${label}.evidence_refs`
        );

      for (
        const evidenceRef
        of evidenceRefs
      ) {
        if (
          !evidenceIds.has(
            evidenceRef
          )
        ) {
          throw new Error(
            `${label}.evidence_refs references unknown evidence_id: ${evidenceRef}.`
          );
        }
      }

      if (
        (
          status === "SUPPORTED" ||
          status === "CONTRADICTED"
        ) &&
        evidenceRefs.length === 0
      ) {
        throw new Error(
          `${label} with status ${status} requires at least one evidence reference.`
        );
      }

      return {
        claim_id:
          claimId,

        statement,
        criticality,
        status,

        evidence_refs:
          evidenceRefs
      };
    }
  );
}

export function validateWorkerEvidenceProtocol(
  report: Record<string, unknown>,
  targetResolution: TargetResolution,
  decision: WorkerDecision,
  options: WorkerEvidenceProtocolOptions = {}
): {
  claims?: WorkerClaim[];
  evidence?: EvidenceRecord[];
} {
  const hasClaims =
    report.claims !== undefined;

  const hasEvidence =
    report.evidence !== undefined;

  /*
   * Compatibility mode during migration.
   *
   * Once Worker and Guard prompts have been
   * migrated, this can become mandatory.
   */
  if (
    !hasClaims &&
    !hasEvidence
  ) {
    return {};
  }

  if (
    hasClaims !== hasEvidence
  ) {
    throw new Error(
      "WorkerReport.claims and WorkerReport.evidence must be provided together."
    );
  }

  const evidence =
    validateEvidence(
      report.evidence,
      targetResolution,
      options.expectedRepository
    );

  const claims =
    validateClaims(
      report.claims,
      evidence
    );

  /*
   * READY must never coexist with a required
   * claim that the Worker itself admits is
   * unresolved or contradicted.
   */
  if (
    decision === "READY" &&
    claims.some(
      (claim) =>
        claim.criticality ===
          "REQUIRED" &&
        claim.status !==
          "SUPPORTED"
    )
  ) {
    throw new Error(
      "Worker invariant violated: READY requires every REQUIRED claim to be SUPPORTED."
    );
  }

  return {
    claims,
    evidence
  };
}
