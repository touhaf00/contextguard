import {
  APPROVAL_DECISIONS,
  createApprovalAttestationV2,
  validateHumanApprovalPrincipalV2
} from "../../core/approval-attestation.js";

import type {
  ApprovalDecisionV2,
  HumanApprovalPrincipalV2
} from "../../core/approval-attestation.js";

import {
  AuthorizationApprovalStoreErrorV2
} from "./approval-store.js";

import type {
  AuthorizationApprovalStoreV2
} from "./approval-store.js";

import {
  AuthorizationSessionStoreErrorV2
} from "./session-store.js";

import type {
  AuthorizationSessionStoreV2
} from "./session-store.js";

export const GENERIC_APPROVAL_API_VERSION =
  "2" as const;

const ALLOWED_FIELDS =
  new Set([
    "session_id",
    "decision"
  ]);

export interface GenericApprovalApiRequestV2 {
  session_id:
    string;

  decision:
    ApprovalDecisionV2;
}

export interface GenericApprovalApiOptionsV2 {
  approvalId?: string;

  decidedAt?: string;

  ttlMs?: number;
}

export interface GenericApprovalApiResponseV2 {
  api_version:
    typeof GENERIC_APPROVAL_API_VERSION;

  session_id:
    string;

  request_id:
    string;

  status:
    "READY_FOR_PREFLIGHT" |
    "REJECTED_BY_HUMAN";

  next_step:
    "RUN_PREFLIGHT" |
    "STOP";

  approval: {
    approval_id:
      string;

    decision:
      ApprovalDecisionV2;

    decided_at:
      string;

    approval_expires_at?:
      string;
  };

  execution_configured:
    false;

  external_action_executed:
    false;
}

export type GenericApprovalApiErrorCodeV2 =
  | "INVALID_BODY"
  | "UNSUPPORTED_FIELD"
  | "UNAUTHENTICATED_PRINCIPAL"
  | "INVALID_SESSION_STATE"
  | "ALREADY_DECIDED";

export class GenericApprovalApiErrorV2
  extends Error {
  constructor(
    public readonly code:
      GenericApprovalApiErrorCodeV2,

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
    throw new GenericApprovalApiErrorV2(
      "INVALID_BODY",
      "Generic approval API body must be a JSON object."
    );
  }

  return value as
    Record<string, unknown>;
}

function validateBody(
  value: unknown
): GenericApprovalApiRequestV2 {
  const object =
    asObject(
      value
    );

  for (
    const key
    of Object.keys(object)
  ) {
    if (
      !ALLOWED_FIELDS.has(
        key
      )
    ) {
      throw new GenericApprovalApiErrorV2(
        "UNSUPPORTED_FIELD",
        `Generic approval API body contains unsupported field: ${key}.`
      );
    }
  }

  if (
    typeof object.session_id !==
      "string" ||
    !object.session_id.trim()
  ) {
    throw new GenericApprovalApiErrorV2(
      "INVALID_BODY",
      "session_id is required."
    );
  }

  if (
    typeof object.decision !==
      "string" ||
    !APPROVAL_DECISIONS.includes(
      object.decision as
        ApprovalDecisionV2
    )
  ) {
    throw new GenericApprovalApiErrorV2(
      "INVALID_BODY",
      "decision must be APPROVED or REJECTED."
    );
  }

  return {
    session_id:
      object.session_id.trim(),

    decision:
      object.decision as
        ApprovalDecisionV2
  };
}

function trustedPrincipal(
  value: unknown
): HumanApprovalPrincipalV2 {
  let principal:
    HumanApprovalPrincipalV2;

  try {
    principal =
      validateHumanApprovalPrincipalV2(
        value
      );
  } catch (error) {
    throw new GenericApprovalApiErrorV2(
      "UNAUTHENTICATED_PRINCIPAL",
      error instanceof Error
        ? error.message
        : "Human principal is invalid."
    );
  }

  if (
    !principal
      .authentication_method
  ) {
    throw new GenericApprovalApiErrorV2(
      "UNAUTHENTICATED_PRINCIPAL",
      "Server-trusted human principal must include authentication_method."
    );
  }

  return principal;
}

export function applyGenericApprovalApiV2(
  bodyValue:
    unknown,

  trustedPrincipalValue:
    unknown,

  sessionStore:
    AuthorizationSessionStoreV2,

  approvalStore:
    AuthorizationApprovalStoreV2,

  options:
    GenericApprovalApiOptionsV2 = {}
): GenericApprovalApiResponseV2 {
  const body =
    validateBody(
      bodyValue
    );

  const principal =
    trustedPrincipal(
      trustedPrincipalValue
    );

  const session =
    sessionStore.get(
      body.session_id
    );

  if (
    session.session_state !==
      "AWAITING_HUMAN_APPROVAL"
  ) {
    throw new GenericApprovalApiErrorV2(
      "INVALID_SESSION_STATE",
      "This authorization session is not waiting for mandatory human approval."
    );
  }

  if (
    approvalStore.has(
      session.session_id
    )
  ) {
    throw new GenericApprovalApiErrorV2(
      "ALREADY_DECIDED",
      "This authorization session already has a human decision."
    );
  }

  const attestation =
    createApprovalAttestationV2(
      session.lock,
      principal,
      body.decision,
      {
        approvalId:
          options.approvalId,

        decidedAt:
          options.decidedAt,

        ttlMs:
          options.ttlMs
      }
    );

  if (
    Date.parse(
      attestation.decided_at
    ) >=
    Date.parse(
      session.expires_at
    )
  ) {
    throw new GenericApprovalApiErrorV2(
      "INVALID_SESSION_STATE",
      "Human decision cannot occur after the authorization session expires."
    );
  }

  try {
    approvalStore.record(
      session,
      attestation
    );
  } catch (error) {
    if (
      error instanceof
        AuthorizationApprovalStoreErrorV2 &&
      error.code ===
        "ALREADY_DECIDED"
    ) {
      throw new GenericApprovalApiErrorV2(
        "ALREADY_DECIDED",
        error.message
      );
    }

    throw error;
  }

  const approved =
    attestation.decision ===
      "APPROVED";

  return {
    api_version:
      GENERIC_APPROVAL_API_VERSION,

    session_id:
      session.session_id,

    request_id:
      session.request_id,

    status:
      approved
        ? "READY_FOR_PREFLIGHT"
        : "REJECTED_BY_HUMAN",

    next_step:
      approved
        ? "RUN_PREFLIGHT"
        : "STOP",

    approval: {
      approval_id:
        attestation.approval_id,

      decision:
        attestation.decision,

      decided_at:
        attestation.decided_at,

      ...(attestation
        .approval_expires_at
        ? {
            approval_expires_at:
              attestation
                .approval_expires_at
          }
        : {})
    },

    execution_configured:
      false,

    external_action_executed:
      false
  };
}

export {
  AuthorizationSessionStoreErrorV2
};
