import {
  validatePolicyDefinition,
  validateProposedAction,
  validateRuntimeIdentity
} from "./contracts.js";

import {
  verifyGenericActionLockV2
} from "./action-lock.js";

import {
  GenericPreflightError,
  performGenericPreflightV2
} from "./preflight.js";

import type {
  PolicyDefinition,
  ProposedAction,
  RuntimeIdentity
} from "./contracts.js";

import type {
  GenericActionLockV2
} from "./action-lock.js";

import type {
  GenericPreflightResultV2
} from "./preflight.js";

import type {
  SnapshotResolverRegistryV2
} from "./snapshot-resolver.js";

export interface CurrentExecutionContextV2 {
  proposed_action:
    ProposedAction;

  policy:
    PolicyDefinition;

  runtime:
    RuntimeIdentity;
}

export interface ResolvedPreflightOptionsV2 {
  checkedAt?: string;
}

function asObject(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new GenericPreflightError(
      "INVALID_OBSERVATION",
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

export function validateCurrentExecutionContextV2(
  value: unknown
): CurrentExecutionContextV2 {
  const object =
    asObject(
      value,
      "CurrentExecutionContextV2"
    );

  try {
    return {
      proposed_action:
        validateProposedAction(
          object.proposed_action,
          "CurrentExecutionContextV2.proposed_action"
        ),

      policy:
        validatePolicyDefinition(
          object.policy,
          "CurrentExecutionContextV2.policy"
        ),

      runtime:
        validateRuntimeIdentity(
          object.runtime,
          "CurrentExecutionContextV2.runtime"
        )
    };
  } catch (error) {
    throw new GenericPreflightError(
      "INVALID_OBSERVATION",
      error instanceof Error
        ? error.message
        : "Current execution context is invalid."
    );
  }
}

export async function performResolvedGenericPreflightV2(
  registry:
    SnapshotResolverRegistryV2,

  lock:
    GenericActionLockV2,

  attestationValue:
    unknown,

  currentContextValue:
    unknown,

  options:
    ResolvedPreflightOptionsV2 = {}
): Promise<GenericPreflightResultV2> {
  if (
    !verifyGenericActionLockV2(
      lock
    )
  ) {
    throw new GenericPreflightError(
      "INVALID_LOCK",
      "GenericActionLockV2 failed integrity verification before snapshot resolution."
    );
  }

  const currentContext =
    validateCurrentExecutionContextV2(
      currentContextValue
    );

  const currentSnapshot =
    await registry.resolve(
      lock.intent
        .request
        .subject
    );

  const checkedAt =
    options.checkedAt ??
    new Date().toISOString();

  return performGenericPreflightV2(
    lock,
    attestationValue,
    {
      snapshot:
        currentSnapshot,

      proposed_action:
        currentContext
          .proposed_action,

      policy:
        currentContext.policy,

      runtime:
        currentContext.runtime
    },
    {
      checkedAt
    }
  );
}
