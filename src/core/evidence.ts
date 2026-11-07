import {
  authorizationRequestDigest,
  digestCanonicalJson
} from "./authorization-integrity.js";

import {
  validateAuthorizationRequest,
  validateResourceSnapshot
} from "./contracts.js";

import type {
  AuthorizationRequest,
  ResourceSnapshot
} from "./contracts.js";

export const EVIDENCE_PROTOCOL_VERSION =
  "2" as const;

export const GENERIC_EVIDENCE_LEVELS = [
  "CONFIGURED",
  "EXECUTED",
  "SUCCESS",
  "OUTPUT_OBSERVED",
  "SEMANTIC_EFFECT"
] as const;

export type GenericEvidenceLevel =
  (
    typeof GENERIC_EVIDENCE_LEVELS
  )[number];

export const GENERIC_CLAIM_CRITICALITIES = [
  "REQUIRED",
  "SUPPORTING"
] as const;

export type GenericClaimCriticality =
  (
    typeof GENERIC_CLAIM_CRITICALITIES
  )[number];

export const GENERIC_CLAIM_STATUSES = [
  "SUPPORTED",
  "UNSUPPORTED",
  "CONTRADICTED",
  "UNKNOWN"
] as const;

export type GenericClaimStatus =
  (
    typeof GENERIC_CLAIM_STATUSES
  )[number];

export interface GenericEvidenceRecord {
  evidence_id: string;

  source_snapshot:
    ResourceSnapshot;

  locator: string;
  observation: string;

  level:
    GenericEvidenceLevel;

  content_hash?: string;
}

export interface GenericClaim {
  claim_id: string;

  statement: string;

  criticality:
    GenericClaimCriticality;

  status:
    GenericClaimStatus;

  evidence_refs: string[];
}

export interface EvidenceProtocolV2 {
  protocol_version:
    typeof EVIDENCE_PROTOCOL_VERSION;

  request_digest: string;

  assembled_at: string;

  claims:
    GenericClaim[];

  evidence:
    GenericEvidenceRecord[];
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

function stringArray(
  value: unknown,
  label: string
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${label} must be an array.`
    );
  }

  const values =
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
    new Set(values).size !==
    values.length
  ) {
    throw new Error(
      `${label} must not contain duplicates.`
    );
  }

  return values;
}

function normalizeTimestamp(
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

  if (
    !Number.isFinite(parsed)
  ) {
    throw new Error(
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function validateEvidenceRecords(
  value: unknown,
  assembledAtMs: number
): GenericEvidenceRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "EvidenceProtocolV2.evidence must be an array."
    );
  }

  const ids =
    new Set<string>();

  return value.map(
    (rawItem, index) => {
      const label =
        `EvidenceProtocolV2.evidence[${index}]`;

      const item =
        asObject(
          rawItem,
          label
        );

      const evidenceId =
        requiredString(
          item,
          "evidence_id",
          label
        );

      if (
        ids.has(evidenceId)
      ) {
        throw new Error(
          `Duplicate evidence_id: ${evidenceId}.`
        );
      }

      ids.add(evidenceId);

      const sourceSnapshot =
        validateResourceSnapshot(
          item.source_snapshot,
          `${label}.source_snapshot`
        );

      const observedAtMs =
        Date.parse(
          sourceSnapshot
            .observed_at
        );

      if (
        observedAtMs >
        assembledAtMs
      ) {
        throw new Error(
          `${label}.source_snapshot cannot be observed after bundle assembly.`
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
        enumValue<
          GenericEvidenceLevel
        >(
          item.level,
          GENERIC_EVIDENCE_LEVELS,
          `${label}.level`
        );

      let contentHash:
        string | undefined;

      if (
        item.content_hash !==
          undefined
      ) {
        contentHash =
          requiredString(
            item,
            "content_hash",
            label
          ).toLowerCase();

        if (
          !SHA256.test(
            contentHash
          )
        ) {
          throw new Error(
            `${label}.content_hash must be a SHA-256 hex digest.`
          );
        }
      }

      return {
        evidence_id:
          evidenceId,

        source_snapshot:
          sourceSnapshot,

        locator,
        observation,
        level,

        ...(contentHash
          ? {
              content_hash:
                contentHash
            }
          : {})
      };
    }
  );
}

function validateClaims(
  value: unknown,
  evidence:
    GenericEvidenceRecord[],
  request:
    AuthorizationRequest,
  assembledAtMs: number
): GenericClaim[] {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    throw new Error(
      "EvidenceProtocolV2.claims must contain at least one claim."
    );
  }

  const evidenceById =
    new Map(
      evidence.map(
        (item) => [
          item.evidence_id,
          item
        ])
    );

  const claimIds =
    new Set<string>();

  return value.map(
    (rawClaim, index) => {
      const label =
        `EvidenceProtocolV2.claims[${index}]`;

      const claim =
        asObject(
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
          `Duplicate claim_id: ${claimId}.`
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
        enumValue<
          GenericClaimCriticality
        >(
          claim.criticality,
          GENERIC_CLAIM_CRITICALITIES,
          `${label}.criticality`
        );

      const status =
        enumValue<
          GenericClaimStatus
        >(
          claim.status,
          GENERIC_CLAIM_STATUSES,
          `${label}.status`
        );

      const evidenceRefs =
        stringArray(
          claim.evidence_refs,
          `${label}.evidence_refs`
        );

      for (
        const ref
        of evidenceRefs
      ) {
        if (
          !evidenceById.has(ref)
        ) {
          throw new Error(
            `${label}.evidence_refs references unknown evidence_id: ${ref}.`
          );
        }
      }

      if (
        (
          status ===
            "SUPPORTED" ||
          status ===
            "CONTRADICTED"
        ) &&
        evidenceRefs.length === 0
      ) {
        throw new Error(
          `${label} with status ${status} requires evidence.`
        );
      }

      const maxAge =
        request.policy
          .freshness
          ?.max_age_seconds;

      if (
        maxAge !== undefined &&
        criticality ===
          "REQUIRED" &&
        (
          status ===
            "SUPPORTED" ||
          status ===
            "CONTRADICTED"
        )
      ) {
        for (
          const ref
          of evidenceRefs
        ) {
          const evidenceItem =
            evidenceById.get(
              ref
            );

          if (!evidenceItem) {
            continue;
          }

          const observedAtMs =
            Date.parse(
              evidenceItem
                .source_snapshot
                .observed_at
            );

          const ageSeconds =
            (
              assembledAtMs -
              observedAtMs
            ) / 1000;

          if (
            ageSeconds >
            maxAge
          ) {
            throw new Error(
              `${label} references stale decision-critical evidence: ${ref}.`
            );
          }
        }
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

export function validateEvidenceProtocolV2(
  value: unknown,
  requestValue: unknown
): EvidenceProtocolV2 {
  const request =
    validateAuthorizationRequest(
      requestValue
    );

  const object =
    asObject(
      value,
      "EvidenceProtocolV2"
    );

  if (
    object.protocol_version !==
      EVIDENCE_PROTOCOL_VERSION
  ) {
    throw new Error(
      `EvidenceProtocolV2.protocol_version must be ${EVIDENCE_PROTOCOL_VERSION}.`
    );
  }

  const requestDigest =
    requiredString(
      object,
      "request_digest",
      "EvidenceProtocolV2"
    ).toLowerCase();

  if (
    !SHA256.test(
      requestDigest
    )
  ) {
    throw new Error(
      "EvidenceProtocolV2.request_digest must be a SHA-256 hex digest."
    );
  }

  const expectedRequestDigest =
    authorizationRequestDigest(
      request
    );

  if (
    requestDigest !==
      expectedRequestDigest
  ) {
    throw new Error(
      "EvidenceProtocolV2 is bound to a different AuthorizationRequest."
    );
  }

  const assembledAt =
    normalizeTimestamp(
      object.assembled_at,
      "EvidenceProtocolV2.assembled_at"
    );

  const assembledAtMs =
    Date.parse(
      assembledAt
    );

  const evidence =
    validateEvidenceRecords(
      object.evidence,
      assembledAtMs
    );

  const claims =
    validateClaims(
      object.claims,
      evidence,
      request,
      assembledAtMs
    );

  return {
    protocol_version:
      EVIDENCE_PROTOCOL_VERSION,

    request_digest:
      requestDigest,

    assembled_at:
      assembledAt,

    claims,
    evidence
  };
}

export function evidenceProtocolDigest(
  value: unknown,
  requestValue: unknown
): string {
  return digestCanonicalJson(
    validateEvidenceProtocolV2(
      value,
      requestValue
    )
  );
}
