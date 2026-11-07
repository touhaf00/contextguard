import {
  authorizationRequestDigest,
  digestCanonicalJson
} from "./authorization-integrity.js";

import {
  evidenceProtocolDigest,
  validateEvidenceProtocolV2
} from "./evidence.js";

export const WORKER_ASSESSMENT_VERSION =
  "2" as const;

export const GENERIC_WORKER_DECISIONS = [
  "READY",
  "NOT_READY",
  "UNKNOWN"
] as const;

export type GenericWorkerDecision =
  (
    typeof GENERIC_WORKER_DECISIONS
  )[number];

export interface WorkerAssessmentV2 {
  protocol_version:
    typeof WORKER_ASSESSMENT_VERSION;

  request_digest: string;

  evidence_digest: string;

  decision:
    GenericWorkerDecision;

  confidence: number;

  summary: string;

  assessed_at: string;
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

function unsupportedRequiredClaimsNote(
  claims: ReadonlyArray<{ claim_id: string; criticality: string; status: string }>
): string {
  const blocking = claims
    .filter((claim) => claim.criticality === "REQUIRED" && claim.status !== "SUPPORTED")
    .map((claim) => `${String(claim.claim_id).replace(/[^A-Za-z0-9_.-]/g, "?").slice(0, 40)}=${claim.status}`);
  if (blocking.length === 0) return "";
  return `Required claims not SUPPORTED: ${blocking.slice(0, 8).join(", ")}${blocking.length > 8 ? ", ..." : ""}.`;
}

export function validateWorkerAssessmentV2(
  value: unknown,
  evidenceValue: unknown,
  requestValue: unknown
): WorkerAssessmentV2 {
  const evidence =
    validateEvidenceProtocolV2(
      evidenceValue,
      requestValue
    );

  const object =
    asObject(
      value,
      "WorkerAssessmentV2"
    );

  if (
    object.protocol_version !==
      WORKER_ASSESSMENT_VERSION
  ) {
    throw new Error(
      `WorkerAssessmentV2.protocol_version must be ${WORKER_ASSESSMENT_VERSION}.`
    );
  }

  const requestDigest =
    digestField(
      object,
      "request_digest",
      "WorkerAssessmentV2"
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
      "WorkerAssessmentV2 is bound to a different AuthorizationRequest."
    );
  }

  const evidenceDigest =
    digestField(
      object,
      "evidence_digest",
      "WorkerAssessmentV2"
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
      "WorkerAssessmentV2 is bound to a different EvidenceProtocolV2 bundle."
    );
  }

  if (
    typeof object.decision !==
      "string" ||
    !GENERIC_WORKER_DECISIONS.includes(
      object.decision as
        GenericWorkerDecision
    )
  ) {
    throw new Error(
      "WorkerAssessmentV2.decision is invalid."
    );
  }

  const decision =
    object.decision as
      GenericWorkerDecision;

  if (
    typeof object.confidence !==
      "number" ||
    !Number.isFinite(
      object.confidence
    ) ||
    object.confidence < 0 ||
    object.confidence > 1
  ) {
    throw new Error(
      "WorkerAssessmentV2.confidence must be between 0 and 1."
    );
  }

  const summary =
    requiredString(
      object,
      "summary",
      "WorkerAssessmentV2"
    );

  const assessedAt =
    timestamp(
      object.assessed_at,
      "WorkerAssessmentV2.assessed_at"
    );

  if (
    Date.parse(assessedAt) <
    Date.parse(
      evidence.assembled_at
    )
  ) {
    throw new Error(
      "WorkerAssessmentV2 cannot be assessed before its evidence bundle was assembled."
    );
  }

  if (
    decision === "READY" &&
    evidence.claims.some(
      (claim) =>
        claim.criticality ===
          "REQUIRED" &&
        claim.status !==
          "SUPPORTED"
    )
  ) {
    throw new Error(
      "WorkerAssessmentV2 invariant violated: READY requires every REQUIRED claim to be SUPPORTED. " +
        unsupportedRequiredClaimsNote(evidence.claims)
    );
  }

  return {
    protocol_version:
      WORKER_ASSESSMENT_VERSION,

    request_digest:
      requestDigest,

    evidence_digest:
      evidenceDigest,

    decision,

    confidence:
      object.confidence,

    summary,

    assessed_at:
      assessedAt
  };
}

export function workerAssessmentDigest(
  value: unknown,
  evidenceValue: unknown,
  requestValue: unknown
): string {
  return digestCanonicalJson(
    validateWorkerAssessmentV2(
      value,
      evidenceValue,
      requestValue
    )
  );
}
