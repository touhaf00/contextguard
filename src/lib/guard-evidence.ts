import type {
  GuardVerdict,
  WorkerReport
} from "../types.js";

export interface GuardEvidenceValidationOptions {
  requireEvidenceProtocol?: boolean;
}

export interface GuardEvidenceLinkage {
  verified_claims?: string[];
  unverified_claims?: string[];
  contradicted_claims?: string[];
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

export function validateGuardEvidenceLinkage(
  report: Record<string, unknown>,
  workerReport: WorkerReport | undefined,
  verdict: GuardVerdict,
  options: GuardEvidenceValidationOptions = {}
): GuardEvidenceLinkage {
  const keys = [
    "verified_claims",
    "unverified_claims",
    "contradicted_claims"
  ] as const;

  const present =
    keys.filter(
      (key) =>
        report[key] !== undefined
    );

  const strict =
    options.requireEvidenceProtocol ===
      true;

  if (
    !strict &&
    present.length === 0
  ) {
    return {};
  }

  if (!workerReport) {
    throw new Error(
      "Guard Evidence Protocol requires the Worker report."
    );
  }

  if (
    !Array.isArray(
      workerReport.claims
    ) ||
    !Array.isArray(
      workerReport.evidence
    )
  ) {
    throw new Error(
      "Guard Evidence Protocol requires Worker claims and evidence."
    );
  }

  if (
    strict &&
    present.length !==
      keys.length
  ) {
    throw new Error(
      "GuardReport verified_claims, unverified_claims and contradicted_claims are required for runtime verification."
    );
  }

  if (
    present.length > 0 &&
    present.length !==
      keys.length
  ) {
    throw new Error(
      "GuardReport claim classification arrays must be provided together."
    );
  }

  const verifiedClaims =
    idArray(
      report.verified_claims,
      "GuardReport.verified_claims"
    );

  const unverifiedClaims =
    idArray(
      report.unverified_claims,
      "GuardReport.unverified_claims"
    );

  const contradictedClaims =
    idArray(
      report.contradicted_claims,
      "GuardReport.contradicted_claims"
    );

  const workerClaimIds =
    new Set(
      workerReport.claims.map(
        (claim) =>
          claim.claim_id
      )
    );

  const workerEvidenceIds =
    new Set(
      workerReport.evidence.map(
        (evidence) =>
          evidence.evidence_id
      )
    );

  const classifications = [
    {
      name:
        "verified_claims",
      ids:
        verifiedClaims
    },
    {
      name:
        "unverified_claims",
      ids:
        unverifiedClaims
    },
    {
      name:
        "contradicted_claims",
      ids:
        contradictedClaims
    }
  ];

  const classified =
    new Set<string>();

  for (
    const classification
    of classifications
  ) {
    for (
      const claimId
      of classification.ids
    ) {
      if (
        !workerClaimIds.has(
          claimId
        )
      ) {
        throw new Error(
          `GuardReport.${classification.name} references unknown Worker claim_id: ${claimId}.`
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

  if (strict) {
    for (
      const workerClaim
      of workerReport.claims
    ) {
      if (
        !classified.has(
          workerClaim.claim_id
        )
      ) {
        throw new Error(
          `GuardReport did not classify Worker claim_id: ${workerClaim.claim_id}.`
        );
      }
    }
  }

  const findings =
    Array.isArray(
      report.findings
    )
      ? report.findings
      : [];

  findings.forEach(
    (rawFinding, index) => {
      const finding =
        asRecord(
          rawFinding,
          `GuardReport.findings[${index}]`
        );

      const claimId =
        finding.claim_id;

      if (
        claimId !== undefined &&
        claimId !== null
      ) {
        if (
          typeof claimId !==
            "string" ||
          !claimId.trim()
        ) {
          throw new Error(
            `GuardReport.findings[${index}].claim_id must be null or a non-empty string.`
          );
        }

        if (
          !workerClaimIds.has(
            claimId
          )
        ) {
          throw new Error(
            `GuardReport.findings[${index}].claim_id references unknown Worker claim_id: ${claimId}.`
          );
        }
      }

      const verifiedEvidence =
        finding.verified_evidence;

      if (
        verifiedEvidence ===
          undefined
      ) {
        return;
      }

      const evidenceIds =
        idArray(
          verifiedEvidence,
          `GuardReport.findings[${index}].verified_evidence`
        );

      for (
        const evidenceId
        of evidenceIds
      ) {
        if (
          !workerEvidenceIds.has(
            evidenceId
          )
        ) {
          throw new Error(
            `GuardReport.findings[${index}].verified_evidence references unknown Worker evidence_id: ${evidenceId}.`
          );
        }
      }
    }
  );

  /*
   * PASS cannot coexist with a claim that
   * ContextGuard independently contradicted.
   */
  if (
    verdict === "PASS" &&
    contradictedClaims.length > 0
  ) {
    throw new Error(
      "Guard invariant violated: PASS cannot contain contradicted Worker claims."
    );
  }

  /*
   * READY is the strongest positive Worker
   * decision. Every REQUIRED claim supporting it
   * must therefore be independently verified by
   * ContextGuard before PASS.
   */
  if (
    strict &&
    verdict === "PASS" &&
    workerReport.decision ===
      "READY"
  ) {
    const verified =
      new Set(
        verifiedClaims
      );

    for (
      const claim
      of workerReport.claims
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

  return {
    verified_claims:
      verifiedClaims,

    unverified_claims:
      unverifiedClaims,

    contradicted_claims:
      contradictedClaims
  };
}
