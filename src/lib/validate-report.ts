import {
  validateTargetResolution
} from "./target-integrity.js";

import {
  FINDING_TYPES
} from "../types.js";

import type {
  GuardReport,
  GuardVerdict,
  RiskLevel,
  WorkerDecision,
  WorkerReport
} from "../types.js";

const WORKER_DECISIONS: readonly WorkerDecision[] = [
  "READY",
  "NOT_READY",
  "UNKNOWN"
];

const GUARD_VERDICTS: readonly GuardVerdict[] = [
  "PASS",
  "REVIEW",
  "FAIL"
];

const RISK_LEVELS: readonly RiskLevel[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL"
];

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

function stringField(
  object: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value = object[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label}.${key} must be a non-empty string.`
    );
  }

  return value;
}

function booleanField(
  object: Record<string, unknown>,
  key: string,
  label: string
): boolean {
  const value = object[key];

  if (typeof value !== "boolean") {
    throw new Error(
      `${label}.${key} must be a boolean.`
    );
  }

  return value;
}

function scoreField(
  object: Record<string, unknown>,
  key: string,
  label: string
): number {
  const value = object[key];

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(
      `${label}.${key} must be between 0 and 1.`
    );
  }

  return value;
}

function enumField<T extends string>(
  object: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  label: string
): T {
  const value = object[key];

  if (
    typeof value !== "string" ||
    !allowed.includes(value as T)
  ) {
    throw new Error(
      `${label}.${key} must be one of: ${allowed.join(", ")}.`
    );
  }

  return value as T;
}

function validateRequestedChecks(
  report: Record<string, unknown>
): void {
  const value =
    report.requested_checks;

  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw new Error(
      "GuardReport.requested_checks must be an array."
    );
  }

  value.forEach((rawItem, index) => {
    const item =
      asRecord(
        rawItem,
        `GuardReport.requested_checks[${index}]`
      );

    stringField(
      item,
      "finding_id",
      `GuardReport.requested_checks[${index}]`
    );

    stringField(
      item,
      "check",
      `GuardReport.requested_checks[${index}]`
    );
  });
}

function validateFindings(
  report: Record<string, unknown>
): void {
  const value =
    report.findings;

  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw new Error(
      "GuardReport.findings must be an array."
    );
  }

  value.forEach((rawFinding, index) => {
    const label =
      `GuardReport.findings[${index}]`;

    const finding =
      asRecord(
        rawFinding,
        label
      );

    const findingId =
      stringField(
        finding,
        "id",
        label
      );

    const duplicateIds =
      value
        .slice(0, index)
        .some((previous) =>
          typeof previous === "object" &&
          previous !== null &&
          (
            previous as Record<string, unknown>
          ).id === findingId
        );

    if (duplicateIds) {
      throw new Error(
        `GuardReport.findings contains duplicate id: ${findingId}.`
      );
    }

    enumField(
      finding,
      "type",
      FINDING_TYPES,
      label
    );

    enumField(
      finding,
      "severity",
      RISK_LEVELS,
      label
    );

    stringField(
      finding,
      "description",
      label
    );

    const claimId =
      finding.claim_id;

    if (
      claimId !== undefined &&
      claimId !== null &&
      (
        typeof claimId !== "string" ||
        !claimId.trim()
      )
    ) {
      throw new Error(
        `${label}.claim_id must be null or a non-empty string.`
      );
    }

    const verifiedEvidence =
      finding.verified_evidence;

    if (
      verifiedEvidence !== undefined &&
      !Array.isArray(verifiedEvidence)
    ) {
      throw new Error(
        `${label}.verified_evidence must be an array.`
      );
    }

    const requiredCheck =
      finding.required_check;

    if (
      requiredCheck !== undefined &&
      requiredCheck !== null &&
      (
        typeof requiredCheck !== "string" ||
        !requiredCheck.trim()
      )
    ) {
      throw new Error(
        `${label}.required_check must be null or a non-empty string.`
      );
    }
  });
}

function validateFindingRelationships(
  report: Record<string, unknown>,
  verdict: GuardVerdict,
  retryRecommended: boolean
): void {
  const findings =
    Array.isArray(report.findings)
      ? report.findings
      : [];

  const requestedChecks =
    Array.isArray(report.requested_checks)
      ? report.requested_checks
      : [];

  const findingIds =
    new Set(
      findings.map((rawFinding) =>
        (
          rawFinding as Record<string, unknown>
        ).id as string
      )
    );

  for (
    let index = 0;
    index < requestedChecks.length;
    index++
  ) {
    const check =
      requestedChecks[index] as
        Record<string, unknown>;

    const findingId =
      check.finding_id as string;

    if (
      !findingIds.has(
        findingId
      )
    ) {
      throw new Error(
        `GuardReport.requested_checks[${index}].finding_id does not reference an existing finding.`
      );
    }
  }

  /*
   * PASS means the assessment is sufficiently
   * trustworthy. Non-blocking observations belong
   * in summary, not in findings.
   */
  if (
    verdict === "PASS" &&
    findings.length > 0
  ) {
    throw new Error(
      "Guard invariant violated: PASS must not contain findings."
    );
  }

  if (
    verdict === "REVIEW" &&
    findings.length === 0
  ) {
    throw new Error(
      "Guard invariant violated: REVIEW requires at least one finding."
    );
  }

  if (
    verdict === "REVIEW" &&
    findings.some((rawFinding) =>
      (
        rawFinding as Record<string, unknown>
      ).severity === "LOW"
    )
  ) {
    throw new Error(
      "Guard invariant violated: REVIEW cannot contain LOW findings; non-decision-critical observations belong in summary."
    );
  }

  const hasCorrectableAssessmentFinding =
    findings.some((rawFinding) => {
      const type =
        (
          rawFinding as Record<string, unknown>
        ).type;

      return (
        type === "REASONING_ERROR" ||
        type === "UNSUPPORTED_CLAIM"
      );
    });

  if (
    verdict === "REVIEW" &&
    hasCorrectableAssessmentFinding &&
    !retryRecommended
  ) {
    throw new Error(
      "Guard invariant violated: a REVIEW caused by a correctable Worker assessment problem requires a retry."
    );
  }

  if (
    verdict === "FAIL" &&
    findings.length === 0
  ) {
    throw new Error(
      "Guard invariant violated: FAIL requires at least one finding."
    );
  }

  if (
    !retryRecommended &&
    requestedChecks.length > 0
  ) {
    throw new Error(
      "Guard invariant violated: requested_checks must be empty when retry_recommended is false."
    );
  }

  const requestedFindingIds =
    new Set(
      requestedChecks.map((rawCheck) =>
        (
          rawCheck as Record<string, unknown>
        ).finding_id as string
      )
    );

  for (const rawFinding of findings) {
    const finding =
      rawFinding as
        Record<string, unknown>;

    const findingId =
      finding.id as string;

    const requiredCheck =
      finding.required_check;

    if (
      !retryRecommended &&
      typeof requiredCheck === "string" &&
      requiredCheck.trim()
    ) {
      throw new Error(
        `Guard invariant violated: finding ${findingId} cannot require another check when retry_recommended is false.`
      );
    }

    if (
      retryRecommended &&
      typeof requiredCheck === "string" &&
      requiredCheck.trim() &&
      !requestedFindingIds.has(
        findingId
      )
    ) {
      throw new Error(
        `Guard invariant violated: finding ${findingId} has a required_check but no matching requested_check.`
      );
    }
  }

  if (verdict === "FAIL") {
    const failCapableTypes =
      new Set([
        "CONTRADICTION",
        "FABRICATED_EVIDENCE",
        "REASONING_ERROR",
        "TARGET_MISMATCH"
      ]);

    const hasMaterialFailure =
      findings.some((rawFinding) => {
        const finding =
          rawFinding as
            Record<string, unknown>;

        return (
          failCapableTypes.has(
            String(
              finding.type
            )
          ) &&
          (
            finding.severity ===
              "HIGH" ||
            finding.severity ===
              "CRITICAL"
          )
        );
      });

    if (!hasMaterialFailure) {
      throw new Error(
        "Guard invariant violated: FAIL requires a HIGH or CRITICAL integrity finding."
      );
    }
  }
}

function hasRetryCheck(
  report: Record<string, unknown>
): boolean {
  const requested =
    report.requested_checks;

  if (Array.isArray(requested)) {
    for (const item of requested) {
      if (
        typeof item === "object" &&
        item !== null &&
        typeof (
          item as Record<string, unknown>
        ).check === "string" &&
        String(
          (
            item as Record<string, unknown>
          ).check
        ).trim()
      ) {
        return true;
      }
    }
  }

  const findings =
    report.findings;

  if (Array.isArray(findings)) {
    for (const finding of findings) {
      if (
        typeof finding === "object" &&
        finding !== null &&
        typeof (
          finding as Record<string, unknown>
        ).required_check === "string" &&
        String(
          (
            finding as Record<string, unknown>
          ).required_check
        ).trim()
      ) {
        return true;
      }
    }
  }

  return false;
}

export function validateWorkerReport(
  value: unknown
): WorkerReport {
  const report =
    asRecord(
      value,
      "WorkerReport"
    );

  const decision =
    enumField(
      report,
      "decision",
      WORKER_DECISIONS,
      "WorkerReport"
    );

  const confidence =
    scoreField(
      report,
      "confidence",
      "WorkerReport"
    );

  const summary =
    stringField(
      report,
      "summary",
      "WorkerReport"
    );

  const targetResolution =
    validateTargetResolution(
      report.target_resolution,
      "WorkerReport.target_resolution"
    );

  return {
    ...report,
    decision,
    confidence,
    summary,
    target_resolution:
      targetResolution
  } as WorkerReport;
}

export function validateGuardReport(
  value: unknown
): GuardReport {
  const report =
    asRecord(
      value,
      "GuardReport"
    );

  const verdict =
    enumField(
      report,
      "verdict",
      GUARD_VERDICTS,
      "GuardReport"
    );

  const evidenceCoverage =
    scoreField(
      report,
      "evidence_coverage",
      "GuardReport"
    );

  const claimAccuracy =
    scoreField(
      report,
      "claim_accuracy",
      "GuardReport"
    );

  const risk =
    enumField(
      report,
      "risk",
      RISK_LEVELS,
      "GuardReport"
    );

  const workerDecisionSupported =
    booleanField(
      report,
      "worker_decision_supported",
      "GuardReport"
    );

  const allowedToAct =
    booleanField(
      report,
      "allowed_to_act",
      "GuardReport"
    );

  const retryRecommended =
    booleanField(
      report,
      "retry_recommended",
      "GuardReport"
    );

  const summary =
    stringField(
      report,
      "summary",
      "GuardReport"
    );

  const targetResolution =
    validateTargetResolution(
      report.target_resolution,
      "GuardReport.target_resolution"
    );

  validateRequestedChecks(report);
  validateFindings(report);

  /*
   * Safety invariants.
   *
   * The LLM may propose these fields,
   * but application code decides whether
   * the combination is acceptable.
   */

  if (
    verdict === "PASS" &&
    !workerDecisionSupported
  ) {
    throw new Error(
      "Guard invariant violated: PASS requires worker_decision_supported=true."
    );
  }

  if (
    verdict !== "PASS" &&
    workerDecisionSupported
  ) {
    throw new Error(
      "Guard invariant violated: REVIEW or FAIL requires worker_decision_supported=false."
    );
  }

  if (
    verdict !== "PASS" &&
    allowedToAct
  ) {
    throw new Error(
      "Guard invariant violated: REVIEW or FAIL cannot allow action."
    );
  }

  if (
    verdict !== "REVIEW" &&
    retryRecommended
  ) {
    throw new Error(
      "Guard invariant violated: only REVIEW may recommend a retry."
    );
  }

  if (
    verdict === "REVIEW" &&
    retryRecommended &&
    !hasRetryCheck(report)
  ) {
    throw new Error(
      "Guard invariant violated: a recommended retry requires an actionable check."
    );
  }

  validateFindingRelationships(
    report,
    verdict,
    retryRecommended
  );

  return {
    ...report,
    verdict,
    evidence_coverage:
      evidenceCoverage,
    claim_accuracy:
      claimAccuracy,
    risk,
    worker_decision_supported:
      workerDecisionSupported,
    allowed_to_act:
      allowedToAct,
    retry_recommended:
      retryRecommended,
    summary,
    target_resolution:
      targetResolution
  } as GuardReport;
}
