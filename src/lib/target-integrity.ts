import {
  TARGET_TYPES
} from "../types.js";

import type {
  Mission,
  TargetIntegrity,
  TargetIntegrityStatus,
  TargetResolution,
  TargetResolutionStatus,
  TargetType
} from "../types.js";

const FULL_GIT_SHA =
  /^[0-9a-f]{40}$/i;

const RESOLUTION_STATUSES:
  readonly TargetResolutionStatus[] = [
    "RESOLVED",
    "UNRESOLVED"
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

function validateTargetType(
  value: unknown,
  label: string
): TargetType {
  if (
    typeof value !== "string" ||
    !TARGET_TYPES.includes(
      value as TargetType
    )
  ) {
    throw new Error(
      `${label}.requested_type is invalid.`
    );
  }

  return value as TargetType;
}

function validateResolutionStatus(
  value: unknown,
  label: string
): TargetResolutionStatus {
  if (
    typeof value !== "string" ||
    !RESOLUTION_STATUSES.includes(
      value as TargetResolutionStatus
    )
  ) {
    throw new Error(
      `${label}.status must be RESOLVED or UNRESOLVED.`
    );
  }

  return value as TargetResolutionStatus;
}

export function validateTargetResolution(
  value: unknown,
  label = "TargetResolution"
): TargetResolution {
  const object =
    asRecord(
      value,
      label
    );

  const status =
    validateResolutionStatus(
      object.status,
      label
    );

  const requestedType =
    validateTargetType(
      object.requested_type,
      label
    );

  const requestedReference =
    optionalString(
      object,
      "requested_reference",
      label
    );

  /*
   * current_state deliberately has no
   * caller-supplied reference.
   */
  if (
    requestedType === "current_state" &&
    requestedReference !== undefined
  ) {
    throw new Error(
      `${label}.requested_reference must be absent for current_state.`
    );
  }

  if (
    requestedType !== "current_state" &&
    requestedReference === undefined
  ) {
    throw new Error(
      `${label}.requested_reference is required for ${requestedType}.`
    );
  }

  if (status === "RESOLVED") {
    const resolvedSha =
      requiredString(
        object,
        "resolved_sha",
        label
      ).toLowerCase();

    if (
      !FULL_GIT_SHA.test(
        resolvedSha
      )
    ) {
      throw new Error(
        `${label}.resolved_sha must be a full 40-character Git SHA.`
      );
    }

    return {
      status,
      requested_type:
        requestedType,

      ...(requestedReference
        ? {
            requested_reference:
              requestedReference
          }
        : {}),

      resolved_sha:
        resolvedSha
    };
  }

  if (
    object.resolved_sha !== undefined &&
    object.resolved_sha !== null
  ) {
    throw new Error(
      `${label}.resolved_sha must be absent when status is UNRESOLVED.`
    );
  }

  const reason =
    requiredString(
      object,
      "reason",
      label
    );

  return {
    status,
    requested_type:
      requestedType,

    ...(requestedReference
      ? {
          requested_reference:
            requestedReference
        }
      : {}),

    reason
  };
}

function expectedReference(
  input: Mission
): string | undefined {
  const reference =
    input.target.reference;

  if (
    typeof reference !== "string"
  ) {
    return undefined;
  }

  const trimmed =
    reference.trim();

  return trimmed || undefined;
}

function resolutionMatchesRequest(
  input: Mission,
  resolution: TargetResolution
): boolean {
  if (
    resolution.requested_type !==
    input.target.type
  ) {
    return false;
  }

  return (
    resolution.requested_reference ===
    expectedReference(input)
  );
}

export interface LockedResolutionCheck {
  status: TargetIntegrityStatus;
  resolution: TargetResolution;
  locked_sha: string;
  reason?: string;
}

export function evaluateLockedResolution(
  input: Mission,
  value: unknown,
  expectedLockedSha: string,
  label = "LockedTargetResolution"
): LockedResolutionCheck {
  const resolution =
    validateTargetResolution(
      value,
      label
    );

  const lockedSha =
    expectedLockedSha
      .trim()
      .toLowerCase();

  if (
    !FULL_GIT_SHA.test(
      lockedSha
    )
  ) {
    throw new Error(
      "expectedLockedSha must be a full 40-character Git SHA."
    );
  }

  if (
    !resolutionMatchesRequest(
      input,
      resolution
    )
  ) {
    return {
      status:
        "REQUEST_MISMATCH",

      resolution,

      locked_sha:
        lockedSha,

      reason:
        "The agent returned a target identity different from the application request."
    };
  }

  /*
   * Once the application has already established
   * the immutable target lock, UNRESOLVED means
   * this particular verifier could not re-verify it.
   *
   * It does NOT erase the existing application lock.
   */
  if (
    resolution.status ===
      "UNRESOLVED"
  ) {
    return {
      status:
        "UNRESOLVED",

      resolution,

      locked_sha:
        lockedSha,

      reason:
        resolution.reason ??
        "The locked target could not be re-verified."
    };
  }

  if (
    resolution.resolved_sha !==
      lockedSha
  ) {
    return {
      status:
        "SHA_MISMATCH",

      resolution,

      locked_sha:
        lockedSha,

      reason:
        "The agent attempted to move away from the application-locked immutable SHA."
    };
  }

  return {
    status:
      "VERIFIED",

    resolution,

    locked_sha:
      lockedSha
  };
}

export function evaluateTargetIntegrity(
  input: Mission,
  workerValue: unknown,
  guardValue: unknown,
  expectedLockedSha?: string
): TargetIntegrity {
  const worker =
    validateTargetResolution(
      workerValue,
      "WorkerTargetResolution"
    );

  const guard =
    validateTargetResolution(
      guardValue,
      "GuardTargetResolution"
    );

  if (
    !resolutionMatchesRequest(
      input,
      worker
    ) ||
    !resolutionMatchesRequest(
      input,
      guard
    )
  ) {
    return {
      status:
        "REQUEST_MISMATCH",

      worker,
      guard,

      reason:
        "At least one agent resolved a target different from the target requested by the application."
    };
  }

  if (
    worker.status ===
      "UNRESOLVED" ||
    guard.status ===
      "UNRESOLVED"
  ) {
    return {
      status:
        "UNRESOLVED",

      worker,
      guard,

      reason:
        "The exact immutable target could not be independently resolved by both agents."
    };
  }

  if (
    worker.resolved_sha !==
    guard.resolved_sha
  ) {
    return {
      status:
        "SHA_MISMATCH",

      worker,
      guard,

      reason:
        "Worker and ContextGuard resolved the requested target to different commit SHAs."
    };
  }

  if (
    expectedLockedSha !== undefined
  ) {
    const normalizedLockedSha =
      expectedLockedSha
        .trim()
        .toLowerCase();

    if (
      !FULL_GIT_SHA.test(
        normalizedLockedSha
      )
    ) {
      throw new Error(
        "expectedLockedSha must be a full 40-character Git SHA."
      );
    }

    if (
      worker.resolved_sha !==
      normalizedLockedSha
    ) {
      return {
        status:
          "SHA_MISMATCH",

        worker,
        guard,

        reason:
          "The target resolution changed after the application locked the immutable target snapshot."
      };
    }
  }

  return {
    status:
      "VERIFIED",

    worker,
    guard,

    locked_sha:
      worker.resolved_sha
  };
}
