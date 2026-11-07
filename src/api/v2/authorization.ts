import {
  validateAuthorizationRequest
} from "../../core/contracts.js";

import {
  evaluateAuthorizationDecisionV2
} from "../../core/decision.js";

import {
  createGenericActionLockV2
} from "../../core/action-lock.js";

import type {
  AuthorizationDecisionV2
} from "../../core/decision.js";

import type {
  GenericActionLockV2
} from "../../core/action-lock.js";

export const GENERIC_AUTHORIZATION_API_VERSION =
  "2" as const;

const ALLOWED_REQUEST_FIELDS =
  new Set([
    "request",
    "evidence",
    "worker_assessment",
    "guard_verification"
  ]);

export type GenericAuthorizationNextStepV2 =
  | "STOP"
  | "COLLECT_HUMAN_APPROVAL"
  | "RUN_PREFLIGHT";

export interface GenericAuthorizationApiRequestV2 {
  request:
    unknown;

  evidence:
    unknown;

  worker_assessment:
    unknown;

  guard_verification:
    unknown;
}

export interface GenericAuthorizationApiOptionsV2 {
  intentId?: string;

  lockId?: string;

  lockCreatedAt?: string;
}

export interface GenericAuthorizationApiResponseV2 {
  api_version:
    typeof GENERIC_AUTHORIZATION_API_VERSION;

  request_id:
    string;

  status:
    AuthorizationDecisionV2["status"];

  next_step:
    GenericAuthorizationNextStepV2;

  decision:
    AuthorizationDecisionV2;

  lock?:
    GenericActionLockV2;

  execution_configured:
    false;

  external_action_executed:
    false;
}

export type GenericAuthorizationApiErrorCodeV2 =
  | "INVALID_BODY"
  | "UNSUPPORTED_FIELD";

export class GenericAuthorizationApiErrorV2
  extends Error {
  constructor(
    public readonly code:
      GenericAuthorizationApiErrorCodeV2,

    message: string
  ) {
    super(message);
  }
}

function asObject(
  value: unknown
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new GenericAuthorizationApiErrorV2(
      "INVALID_BODY",
      "Generic authorization API body must be a JSON object."
    );
  }

  return value as
    Record<string, unknown>;
}

function validateApiBody(
  value: unknown
): GenericAuthorizationApiRequestV2 {
  const object =
    asObject(
      value
    );

  for (
    const key
    of Object.keys(object)
  ) {
    if (
      !ALLOWED_REQUEST_FIELDS
        .has(key)
    ) {
      throw new GenericAuthorizationApiErrorV2(
        "UNSUPPORTED_FIELD",
        `Generic authorization API body contains unsupported field: ${key}.`
      );
    }
  }

  for (
    const key
    of ALLOWED_REQUEST_FIELDS
  ) {
    if (
      object[key] ===
        undefined
    ) {
      throw new GenericAuthorizationApiErrorV2(
        "INVALID_BODY",
        `Generic authorization API body is missing required field: ${key}.`
      );
    }
  }

  return {
    request:
      object.request,

    evidence:
      object.evidence,

    worker_assessment:
      object.worker_assessment,

    guard_verification:
      object.guard_verification
  };
}

function nextStep(
  decision:
    AuthorizationDecisionV2
): GenericAuthorizationNextStepV2 {
  if (
    !decision
      .action_lock_eligible
  ) {
    return "STOP";
  }

  if (
    decision.human_approval ===
      "REQUIRED"
  ) {
    return "COLLECT_HUMAN_APPROVAL";
  }

  return "RUN_PREFLIGHT";
}

export function evaluateGenericAuthorizationApiV2(
  bodyValue: unknown,

  options:
    GenericAuthorizationApiOptionsV2 = {}
): GenericAuthorizationApiResponseV2 {
  const body =
    validateApiBody(
      bodyValue
    );

  const request =
    validateAuthorizationRequest(
      body.request
    );

  const decision =
    evaluateAuthorizationDecisionV2(
      request,
      body.evidence,
      body.worker_assessment,
      body.guard_verification
    );

  const step =
    nextStep(
      decision
    );

  if (
    !decision
      .action_lock_eligible
  ) {
    return {
      api_version:
        GENERIC_AUTHORIZATION_API_VERSION,

      request_id:
        request.request_id,

      status:
        decision.status,

      next_step:
        step,

      decision,

      execution_configured:
        false,

      external_action_executed:
        false
    };
  }

  const lock =
    createGenericActionLockV2(
      request,
      body.evidence,
      body.worker_assessment,
      body.guard_verification,
      {
        intentId:
          options.intentId,

        lockId:
          options.lockId,

        createdAt:
          options.lockCreatedAt
      }
    );

  return {
    api_version:
      GENERIC_AUTHORIZATION_API_VERSION,

    request_id:
      request.request_id,

    status:
      decision.status,

    next_step:
      step,

    decision,

    lock,

    execution_configured:
      false,

    external_action_executed:
      false
  };
}
