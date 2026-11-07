import type {
  AuthorizationSessionStoreV2
} from "./session-store.js";

import type {
  TrustedExecutionContextStoreV2
} from "./execution-context-store.js";

export const TRUSTED_EXECUTION_CONTEXT_API_VERSION =
  "2" as const;

const ALLOWED_FIELDS =
  new Set([
    "session_id",
    "proposed_action",
    "policy",
    "runtime"
  ]);

export type TrustedExecutionContextApiErrorCodeV2 =
  | "INVALID_BODY"
  | "UNSUPPORTED_FIELD";

export class TrustedExecutionContextApiErrorV2
  extends Error {
  constructor(
    public readonly code:
      TrustedExecutionContextApiErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface TrustedExecutionContextApiResponseV2 {
  api_version:
    typeof TRUSTED_EXECUTION_CONTEXT_API_VERSION;

  session_id:
    string;

  request_id:
    string;

  status:
    "TRUSTED_EXECUTION_CONTEXT_UPDATED";

  execution_configured:
    false;

  external_action_executed:
    false;
}

function asObject(
  value:
    unknown
): Record<string, unknown> {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    throw new TrustedExecutionContextApiErrorV2(
      "INVALID_BODY",
      "Trusted execution context request must be a JSON object."
    );
  }

  return value as
    Record<string, unknown>;
}

export function applyTrustedExecutionContextApiV2(
  bodyValue:
    unknown,

  sessions:
    AuthorizationSessionStoreV2,

  contexts:
    TrustedExecutionContextStoreV2
): TrustedExecutionContextApiResponseV2 {
  const body =
    asObject(
      bodyValue
    );

  for (
    const key
    of Object.keys(
      body
    )
  ) {
    if (
      !ALLOWED_FIELDS.has(
        key
      )
    ) {
      throw new TrustedExecutionContextApiErrorV2(
        "UNSUPPORTED_FIELD",
        `Trusted execution context request contains unsupported field: ${key}.`
      );
    }
  }

  if (
    typeof body.session_id !==
      "string" ||
    !body.session_id.trim()
  ) {
    throw new TrustedExecutionContextApiErrorV2(
      "INVALID_BODY",
      "session_id must be a non-empty string."
    );
  }

  if (
    body.proposed_action ===
      undefined ||
    body.policy ===
      undefined ||
    body.runtime ===
      undefined
  ) {
    throw new TrustedExecutionContextApiErrorV2(
      "INVALID_BODY",
      "proposed_action, policy and runtime are required."
    );
  }

  const session =
    sessions.get(
      body.session_id.trim()
    );

  contexts.set(
    session.session_id,
    session.lock_fingerprint,
    {
      proposed_action:
        body.proposed_action,

      policy:
        body.policy,

      runtime:
        body.runtime
    }
  );

  return {
    api_version:
      TRUSTED_EXECUTION_CONTEXT_API_VERSION,

    session_id:
      session.session_id,

    request_id:
      session.request_id,

    status:
      "TRUSTED_EXECUTION_CONTEXT_UPDATED",

    execution_configured:
      false,

    external_action_executed:
      false
  };
}
