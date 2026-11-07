import {
  performResolvedGenericPreflightV2
} from "../../core/resolved-preflight.js";

import type {
  GenericPreflightResultV2
} from "../../core/preflight.js";

import type {
  SnapshotResolverRegistryV2
} from "../../core/snapshot-resolver.js";

import type {
  AuthorizationSessionV2,
  AuthorizationSessionStoreV2
} from "./session-store.js";

import type {
  AuthorizationApprovalStoreV2
} from "./approval-store.js";

export const GENERIC_PREFLIGHT_API_VERSION =
  "2" as const;

const ALLOWED_FIELDS =
  new Set([
    "session_id"
  ]);

export interface GenericPreflightApiRequestV2 {
  session_id:
    string;
}

export interface GenericPreflightApiOptionsV2 {
  checkedAt?:
    string;
}

export interface GenericPreflightContextProviderV2 {
  getCurrentContext(
    session:
      AuthorizationSessionV2
  ): Promise<unknown>;
}

export interface GenericPreflightApiResponseV2 {
  api_version:
    typeof GENERIC_PREFLIGHT_API_VERSION;

  session_id:
    string;

  request_id:
    string;

  status:
    "AUTHORIZED_FOR_EXECUTOR";

  next_step:
    "TRUSTED_EXECUTOR";

  preflight:
    GenericPreflightResultV2;

  execution_configured:
    false;

  external_action_executed:
    false;
}

export type GenericPreflightApiErrorCodeV2 =
  | "INVALID_BODY"
  | "UNSUPPORTED_FIELD"
  | "CURRENT_CONTEXT_UNAVAILABLE";

export class GenericPreflightApiErrorV2
  extends Error {
  constructor(
    public readonly code:
      GenericPreflightApiErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

function validateBody(
  value:
    unknown
): GenericPreflightApiRequestV2 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new GenericPreflightApiErrorV2(
      "INVALID_BODY",
      "Generic preflight API body must be a JSON object."
    );
  }

  const object =
    value as
      Record<string, unknown>;

  for (
    const key
    of Object.keys(object)
  ) {
    if (
      !ALLOWED_FIELDS.has(
        key
      )
    ) {
      throw new GenericPreflightApiErrorV2(
        "UNSUPPORTED_FIELD",
        `Generic preflight API body contains unsupported field: ${key}.`
      );
    }
  }

  if (
    typeof object.session_id !==
      "string" ||
    !object.session_id.trim()
  ) {
    throw new GenericPreflightApiErrorV2(
      "INVALID_BODY",
      "session_id is required."
    );
  }

  return {
    session_id:
      object.session_id.trim()
  };
}

export async function runGenericPreflightApiV2(
  bodyValue:
    unknown,

  sessionStore:
    AuthorizationSessionStoreV2,

  approvalStore:
    AuthorizationApprovalStoreV2,

  resolverRegistry:
    SnapshotResolverRegistryV2,

  currentContextProvider:
    GenericPreflightContextProviderV2,

  options:
    GenericPreflightApiOptionsV2 = {}
): Promise<GenericPreflightApiResponseV2> {
  const body =
    validateBody(
      bodyValue
    );

  const session =
    sessionStore.get(
      body.session_id
    );

  const approvalRequirement =
    session.lock
      .intent
      .request
      .policy
      .human_approval;

  let attestation:
    unknown =
      undefined;

  if (
    approvalRequirement !==
      "NONE" &&
    approvalStore.has(
      session.session_id
    )
  ) {
    attestation =
      approvalStore.get(
        session
      ).attestation;
  }

  let currentContext:
    unknown;

  try {
    currentContext =
      await currentContextProvider
        .getCurrentContext(
          session
        );
  } catch (error) {
    throw new GenericPreflightApiErrorV2(
      "CURRENT_CONTEXT_UNAVAILABLE",
      error instanceof Error
        ? error.message
        : "Current execution context is unavailable."
    );
  }

  const preflight =
    await performResolvedGenericPreflightV2(
      resolverRegistry,
      session.lock,
      attestation,
      currentContext,
      {
        checkedAt:
          options.checkedAt
      }
    );

  return {
    api_version:
      GENERIC_PREFLIGHT_API_VERSION,

    session_id:
      session.session_id,

    request_id:
      session.request_id,

    status:
      "AUTHORIZED_FOR_EXECUTOR",

    next_step:
      "TRUSTED_EXECUTOR",

    preflight,

    execution_configured:
      false,

    external_action_executed:
      false
  };
}
