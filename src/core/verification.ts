import {
  authorizationRequestDigest,
  digestCanonicalJson
} from "./authorization-integrity.js";

import {
  evidenceProtocolDigest,
  validateEvidenceProtocolV2
} from "./evidence.js";

import {
  validateWorkerAssessmentV2,
  workerAssessmentDigest
} from "./assessment.js";

export const GUARD_VERIFICATION_VERSION =
  "2" as const;

export const GENERIC_GUARD_VERDICTS = [
  "PASS",
  "REVIEW",
  "FAIL"
] as const;

export type GenericGuardVerdict =
  (
    typeof GENERIC_GUARD_VERDICTS
  )[number];

export const GENERIC_GUARD_RISK_LEVELS = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL"
] as const;

export type GenericGuardRiskLevel =
  (
    typeof GENERIC_GUARD_RISK_LEVELS
  )[number];

export const GENERIC_FINDING_TYPES = [
  "MISSING_EVIDENCE",
  "UNSUPPORTED_CLAIM",
  "CONTRADICTION",
  "FABRICATED_EVIDENCE",
  "REASONING_ERROR",
  "SUBJECT_MISMATCH",
  "SNAPSHOT_MISMATCH",
  "ACTION_MISMATCH",
  "POLICY_MISMATCH",
  "RUNTIME_MISMATCH",
  "EVIDENCE_INTEGRITY_FAILURE"
] as const;

export type GenericFindingType =
  (
    typeof GENERIC_FINDING_TYPES
  )[number];

export const GENERIC_FINDING_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL"
] as const;

export type GenericFindingSeverity =
  (
    typeof GENERIC_FINDING_SEVERITIES
  )[number];

export interface GenericGuardFinding {
  finding_id: string;

  type:
    GenericFindingType;

  severity:
    GenericFindingSeverity;

  claim_id?: string | null;

  description: string;

  verified_evidence?: string[];

  required_check?: string | null;
}

export interface GenericRequestedCheck {
  finding_id: string;
  check: string;
}

export interface GuardVerificationV2 {
  protocol_version:
    typeof GUARD_VERIFICATION_VERSION;

  request_digest: string;

  evidence_digest: string;

  worker_assessment_digest:
    string;

  verdict:
    GenericGuardVerdict;

  risk:
    GenericGuardRiskLevel;

  verified_claims:
    string[];

  unverified_claims:
    string[];

  contradicted_claims:
    string[];

  findings:
    GenericGuardFinding[];

  requested_checks:
    GenericRequestedCheck[];

  worker_decision_supported:
    boolean;

  retry_recommended:
    boolean;

  summary: string;

  verified_at: string;
}

const SHA256 =
  /^[0-9a-f]{64}$/i;

function asObject(
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

  return value as
    Record<string, unknown>;
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

function requiredBoolean(
  object: Record<string, unknown>,
  key: string,
  label: string
): boolean {
  const value =
    object[key];

  if (
    typeof value !== "boolean"
  ) {
    throw new Error(
      `${label}.${key} must be a boolean.`
    );
  }

  return value;
}

function digestField(
  object: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value =
    requiredString(
      object,
      key,
      label
    ).toLowerCase();

  if (!SHA256.test(value)) {
    throw new Error(
      `${label}.${key} must be a SHA-256 hex digest.`
    );
  }

  return value;
}

function enumValue<
  T extends string
>(
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

function idArray(
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
      `${label} must not contain duplicate IDs.`
    );
  }

  return result;
}

function timestamp(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label} must be a non-empty timestamp.`
    );
  }

  const parsed =
    Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function validateFindings(
  value: unknown,
  workerClaimIds: Set<string>,
  workerEvidenceIds: Set<string>
): GenericGuardFinding[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "GuardVerificationV2.findings must be an array."
    );
  }

  const ids =
    new Set<string>();

  return value.map(
    (rawFinding, index) => {
      const label =
        `GuardVerificationV2.findings[${index}]`;

      const finding =
        asObject(
          rawFinding,
          label
        );

      const findingId =
        requiredString(
          finding,
          "finding_id",
          label
        );

      if (ids.has(findingId)) {
        throw new Error(
          `Duplicate finding_id: ${findingId}.`
        );
      }

      ids.add(findingId);

      const type =
        enumValue<
          GenericFindingType
        >(
          finding.type,
          GENERIC_FINDING_TYPES,
          `${label}.type`
        );

      const severity =
        enumValue<
          GenericFindingSeverity
        >(
          finding.severity,
          GENERIC_FINDING_SEVERITIES,
          `${label}.severity`
        );

      let claimId:
        string | null | undefined;

      if (
        finding.claim_id === null
      ) {
        claimId = null;
      } else if (
        finding.claim_id !==
          undefined
      ) {
        claimId =
          requiredString(
            finding,
            "claim_id",
            label
          );

        if (
          !workerClaimIds.has(
            claimId
          )
        ) {
          throw new Error(
            `${label}.claim_id references unknown Worker claim_id: ${claimId}.`
          );
        }
      }

      const description =
        requiredString(
          finding,
          "description",
          label
        );

      let verifiedEvidence:
        string[] | undefined;

      if (
        finding.verified_evidence !==
          undefined
      ) {
        verifiedEvidence =
          idArray(
            finding.verified_evidence,
            `${label}.verified_evidence`
          );

        for (
          const evidenceId
          of verifiedEvidence
        ) {
          if (
            !workerEvidenceIds.has(
              evidenceId
            )
          ) {
            throw new Error(
              `${label}.verified_evidence references unknown Worker evidence_id: ${evidenceId}.`
            );
          }
        }
      }

      let requiredCheck:
        string | null | undefined;

      if (
        finding.required_check ===
          null
      ) {
        requiredCheck = null;
      } else if (
        finding.required_check !==
          undefined
      ) {
        requiredCheck =
          requiredString(
            finding,
            "required_check",
            label
          );
      }

      return {
        finding_id:
          findingId,

        type,
        severity,

        ...(claimId !== undefined
          ? {
              claim_id:
                claimId
            }
          : {}),

        description,

        ...(verifiedEvidence
          ? {
              verified_evidence:
                verifiedEvidence
            }
          : {}),

        ...(requiredCheck !== undefined
          ? {
              required_check:
                requiredCheck
            }
          : {})
      };
    }
  );
}

function validateRequestedChecks(
  value: unknown,
  findings:
    GenericGuardFinding[]
): GenericRequestedCheck[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "GuardVerificationV2.requested_checks must be an array."
    );
  }

  const findingsById =
    new Map(
      findings.map(
        (finding) => [
          finding.finding_id,
          finding
        ])
    );

  const usedFindingIds =
    new Set<string>();

  return value.map(
    (rawCheck, index) => {
      const label =
        `GuardVerificationV2.requested_checks[${index}]`;

      const check =
        asObject(
          rawCheck,
          label
        );

      const findingId =
        requiredString(
          check,
          "finding_id",
          label
        );

      if (
        usedFindingIds.has(
          findingId
        )
      ) {
        throw new Error(
          `${label}.finding_id duplicates an existing requested check.`
        );
      }

      usedFindingIds.add(
        findingId
      );

      const finding =
        findingsById.get(
          findingId
        );

      if (!finding) {
        throw new Error(
          `${label}.finding_id references unknown finding: ${findingId}.`
        );
      }

      const text =
        requiredString(
          check,
          "check",
          label
        );

      if (
        !finding.required_check ||
        finding.required_check !==
          text
      ) {
        throw new Error(
          `${label}.check must exactly match the finding required_check.`
        );
      }

      return {
        finding_id:
          findingId,

        check:
          text
      };
    }
  );
}

export function validateGuardVerificationV2(
  value: unknown,
  workerAssessmentValue: unknown,
  evidenceValue: unknown,
  requestValue: unknown
): GuardVerificationV2 {
  const evidence =
    validateEvidenceProtocolV2(
      evidenceValue,
      requestValue
    );

  const workerAssessment =
    validateWorkerAssessmentV2(
      workerAssessmentValue,
      evidence,
      requestValue
    );

  const object =
    asObject(
      value,
      "GuardVerificationV2"
    );

  if (
    object.protocol_version !==
      GUARD_VERIFICATION_VERSION
  ) {
    throw new Error(
      `GuardVerificationV2.protocol_version must be ${GUARD_VERIFICATION_VERSION}.`
    );
  }

  const requestDigest =
    digestField(
      object,
      "request_digest",
      "GuardVerificationV2"
    );

  const expectedRequestDigest =
    authorizationRequestDigest(
      requestValue
    );

  if (
    requestDigest !==
      expectedRequestDigest
  ) {
    throw new Error(
      "GuardVerificationV2 is bound to a different AuthorizationRequest."
    );
  }

  const evidenceDigest =
    digestField(
      object,
      "evidence_digest",
      "GuardVerificationV2"
    );

  const expectedEvidenceDigest =
    evidenceProtocolDigest(
      evidence,
      requestValue
    );

  if (
    evidenceDigest !==
      expectedEvidenceDigest
  ) {
    throw new Error(
      "GuardVerificationV2 is bound to a different EvidenceProtocolV2 bundle."
    );
  }

  const workerDigest =
    digestField(
      object,
      "worker_assessment_digest",
      "GuardVerificationV2"
    );

  const expectedWorkerDigest =
    workerAssessmentDigest(
      workerAssessment,
      evidence,
      requestValue
    );

  if (
    workerDigest !==
      expectedWorkerDigest
  ) {
    throw new Error(
      "GuardVerificationV2 is bound to a different WorkerAssessmentV2."
    );
  }

  const verdict =
    enumValue<
      GenericGuardVerdict
    >(
      object.verdict,
      GENERIC_GUARD_VERDICTS,
      "GuardVerificationV2.verdict"
    );

  const risk =
    enumValue<
      GenericGuardRiskLevel
    >(
      object.risk,
      GENERIC_GUARD_RISK_LEVELS,
      "GuardVerificationV2.risk"
    );

  const verifiedClaims =
    idArray(
      object.verified_claims,
      "GuardVerificationV2.verified_claims"
    );

  const unverifiedClaims =
    idArray(
      object.unverified_claims,
      "GuardVerificationV2.unverified_claims"
    );

  const contradictedClaims =
    idArray(
      object.contradicted_claims,
      "GuardVerificationV2.contradicted_claims"
    );

  const workerClaimIds =
    new Set(
      evidence.claims.map(
        (claim) =>
          claim.claim_id
      )
    );

  const workerEvidenceIds =
    new Set(
      evidence.evidence.map(
        (item) =>
          item.evidence_id
      )
    );

  const classified =
    new Set<string>();

  const classifications = [
    {
      name:
        "verified_claims",
      values:
        verifiedClaims
    },
    {
      name:
        "unverified_claims",
      values:
        unverifiedClaims
    },
    {
      name:
        "contradicted_claims",
      values:
        contradictedClaims
    }
  ];

  for (
    const classification
    of classifications
  ) {
    for (
      const claimId
      of classification.values
    ) {
      if (
        !workerClaimIds.has(
          claimId
        )
      ) {
        throw new Error(
          `GuardVerificationV2.${classification.name} references unknown Worker claim_id: ${claimId}.`
        );
      }

      if (
        classified.has(
          claimId
        )
      ) {
        throw new Error(
          `Worker claim ${claimId} appears in more than one Guard classification.`
        );
      }

      classified.add(
        claimId
      );
    }
  }

  for (
    const claimId
    of workerClaimIds
  ) {
    if (
      !classified.has(
        claimId
      )
    ) {
      throw new Error(
        `GuardVerificationV2 did not classify Worker claim_id: ${claimId}.`
      );
    }
  }

  const findings =
    validateFindings(
      object.findings,
      workerClaimIds,
      workerEvidenceIds
    );

  const requestedChecks =
    validateRequestedChecks(
      object.requested_checks,
      findings
    );

  const workerDecisionSupported =
    requiredBoolean(
      object,
      "worker_decision_supported",
      "GuardVerificationV2"
    );

  const retryRecommended =
    requiredBoolean(
      object,
      "retry_recommended",
      "GuardVerificationV2"
    );

  const summary =
    requiredString(
      object,
      "summary",
      "GuardVerificationV2"
    );

  const verifiedAt =
    timestamp(
      object.verified_at,
      "GuardVerificationV2.verified_at"
    );

  if (
    Date.parse(verifiedAt) <
    Date.parse(
      workerAssessment.assessed_at
    )
  ) {
    throw new Error(
      "GuardVerificationV2 cannot be verified before the Worker assessment."
    );
  }

  if (
    verdict === "PASS"
  ) {
    if (
      !workerDecisionSupported
    ) {
      throw new Error(
        "Guard invariant violated: PASS requires worker_decision_supported=true."
      );
    }

    if (
      contradictedClaims.length >
        0
    ) {
      throw new Error(
        "Guard invariant violated: PASS cannot contain contradicted Worker claims."
      );
    }

    if (
      findings.length > 0
    ) {
      throw new Error(
        "Guard invariant violated: PASS cannot contain findings."
      );
    }

    if (
      retryRecommended ||
      requestedChecks.length > 0
    ) {
      throw new Error(
        "Guard invariant violated: PASS cannot request retry."
      );
    }

    if (
      workerAssessment.decision ===
        "READY"
    ) {
      const verified =
        new Set(
          verifiedClaims
        );

      for (
        const claim
        of evidence.claims
      ) {
        if (
          claim.criticality ===
            "REQUIRED" &&
          !verified.has(
            claim.claim_id
          )
        ) {
          throw new Error(
            `Guard invariant violated: READY + PASS requires REQUIRED Worker claim ${claim.claim_id} to be independently verified.`
          );
        }
      }
    }
  }

  if (
    verdict === "REVIEW"
  ) {
    if (
      workerDecisionSupported
    ) {
      throw new Error(
        "Guard invariant violated: REVIEW cannot claim the Worker decision is supported."
      );
    }

    if (
      findings.length === 0
    ) {
      throw new Error(
        "Guard invariant violated: REVIEW requires at least one finding."
      );
    }

    if (
      findings.every(
        (finding) =>
          finding.severity ===
            "LOW"
      )
    ) {
      throw new Error(
        "Guard invariant violated: REVIEW cannot be based on LOW-only findings."
      );
    }

    if (
      retryRecommended &&
      requestedChecks.length === 0
    ) {
      throw new Error(
        "Guard invariant violated: REVIEW retry requires at least one requested check."
      );
    }

    if (
      !retryRecommended &&
      requestedChecks.length > 0
    ) {
      throw new Error(
        "Guard invariant violated: terminal REVIEW cannot contain requested checks."
      );
    }
  }

  if (
    verdict === "FAIL"
  ) {
    if (
      workerDecisionSupported
    ) {
      throw new Error(
        "Guard invariant violated: FAIL cannot claim the Worker decision is supported."
      );
    }

    if (
      retryRecommended ||
      requestedChecks.length > 0
    ) {
      throw new Error(
        "Guard invariant violated: FAIL cannot request retry."
      );
    }

    if (
      !findings.some(
        (finding) =>
          finding.severity ===
            "HIGH" ||
          finding.severity ===
            "CRITICAL"
      )
    ) {
      throw new Error(
        "Guard invariant violated: FAIL requires at least one HIGH or CRITICAL finding."
      );
    }
  }

  return {
    protocol_version:
      GUARD_VERIFICATION_VERSION,

    request_digest:
      requestDigest,

    evidence_digest:
      evidenceDigest,

    worker_assessment_digest:
      workerDigest,

    verdict,
    risk,

    verified_claims:
      verifiedClaims,

    unverified_claims:
      unverifiedClaims,

    contradicted_claims:
      contradictedClaims,

    findings,
    requested_checks:
      requestedChecks,

    worker_decision_supported:
      workerDecisionSupported,

    retry_recommended:
      retryRecommended,

    summary,

    verified_at:
      verifiedAt
  };
}

export function guardVerificationDigest(
  value: unknown,
  workerAssessmentValue: unknown,
  evidenceValue: unknown,
  requestValue: unknown
): string {
  return digestCanonicalJson(
    validateGuardVerificationV2(
      value,
      workerAssessmentValue,
      evidenceValue,
      requestValue
    )
  );
}
