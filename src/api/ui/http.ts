import type {
  HumanApprovalPrincipalV2
} from "../../core/approval-attestation.js";

import { GenericPreflightError } from "../../core/preflight.js";

import {
  PostExecutionEvidenceErrorV2
} from "../v2/execution-proof-audit.js";

import type {
  TrustedExecutorResultV2
} from "../../core/trusted-executor.js";

import type {
  ContextGuardUiAccessGateV2
} from "./access.js";

export function contextGuardUiPreflightErrorResponseV2(error: unknown): {
  status: 409;
  body: { error: { code: GenericPreflightError["code"]; message: string } };
} | null {
  if (!(error instanceof GenericPreflightError)) return null;
  return {
    status: 409,
    body: { error: { code: error.code, message: error.message } }
  };
}

export interface ContextGuardUiPostExecutionErrorBodyV2 {
  api_version:
    "2";

  error: {
    code:
      string;

    message:
      string;
  };

  execution_status:
    "EXECUTED_EVIDENCE_INCOMPLETE";

  result:
    TrustedExecutorResultV2;

  execution_configured:
    true;

  external_action_executed:
    true;
}

export function contextGuardUiPostExecutionErrorV2(
  error:
    unknown
): {
  status:
    500;

  body:
    ContextGuardUiPostExecutionErrorBodyV2;
} | null {
  if (
    !(error instanceof
      PostExecutionEvidenceErrorV2)
  ) {
    return null;
  }

  return {
    status:
      500,

    body: {
      api_version:
        "2",

      error: {
        code:
          error.code,

        message:
          error.message
      },

      execution_status:
        "EXECUTED_EVIDENCE_INCOMPLETE",

      result:
        error.result,

      execution_configured:
        true,

      external_action_executed:
        true
    }
  };
}

export type ContextGuardUiHttpErrorCodeV2 =
  | "INVALID_BODY"
  | "UNSUPPORTED_FIELD"
  | "EXECUTION_CONFIRMATION_REQUIRED";

export class ContextGuardUiHttpErrorV2
  extends Error {
  constructor(
    public readonly code:
      ContextGuardUiHttpErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface ContextGuardUiFlowV2 {
  start(
    body:
      unknown
  ): Promise<unknown>;
}

export interface ContextGuardUiAuthorizationServiceV2 {
  approve(
    body:
      unknown,

    principal:
      HumanApprovalPrincipalV2
  ): unknown;

  preflight(
    body:
      unknown
  ): Promise<unknown>;

  issueExecutionReceipt(
    body:
      unknown
  ): Promise<unknown>;

  executeReceipt(
    body:
      unknown
  ): Promise<unknown>;
}

const EXECUTE_FIELDS =
  new Set([
    "receipt_id",
    "receipt_digest",
    "confirmation"
  ]);

function asObject(
  value:
    unknown,

  label:
    string
): Record<string, unknown> {
  if (
    typeof value !==
      "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new ContextGuardUiHttpErrorV2(
      "INVALID_BODY",
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

function requiredString(
  object:
    Record<string, unknown>,

  key:
    string,

  label:
    string
): string {
  const value =
    object[key];

  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new ContextGuardUiHttpErrorV2(
      "INVALID_BODY",
      `${label}.${key} must be a non-empty string.`
    );
  }

  return value.trim();
}

function trustedExecutionBody(
  value:
    unknown
): {
  receipt_id:
    string;

  receipt_digest:
    string;
} {
  const object =
    asObject(
      value,
      "ContextGuardUiExecuteRequest"
    );

  for (
    const key
    of Object.keys(object)
  ) {
    if (
      !EXECUTE_FIELDS.has(
        key
      )
    ) {
      throw new ContextGuardUiHttpErrorV2(
        "UNSUPPORTED_FIELD",
        `ContextGuardUiExecuteRequest contains unsupported field: ${key}.`
      );
    }
  }

  const confirmation =
    requiredString(
      object,
      "confirmation",
      "ContextGuardUiExecuteRequest"
    );

  if (
    confirmation !==
      "EXECUTE"
  ) {
    throw new ContextGuardUiHttpErrorV2(
      "EXECUTION_CONFIRMATION_REQUIRED",
      "Real external execution requires confirmation=EXECUTE."
    );
  }

  return {
    receipt_id:
      requiredString(
        object,
        "receipt_id",
        "ContextGuardUiExecuteRequest"
      ),

    receipt_digest:
      requiredString(
        object,
        "receipt_digest",
        "ContextGuardUiExecuteRequest"
      )
  };
}

export class ContextGuardUiHttpV2 {
  constructor(
    private readonly flow:
      ContextGuardUiFlowV2,

    private readonly service:
      ContextGuardUiAuthorizationServiceV2,

    private readonly access:
      ContextGuardUiAccessGateV2
  ) {}

  async start(
    body:
      unknown,

    authorization:
      string | undefined,

    cookieHeader?:
      string
  ): Promise<unknown> {
    this.access.authenticate(
      authorization,
      cookieHeader
    );

    return this.flow.start(
      body
    );
  }

  approve(
    body:
      unknown,

    authorization:
      string | undefined,

    cookieHeader?:
      string
  ): unknown {
    const principal =
      this.access.authenticate(
        authorization,
        cookieHeader
      );

    return this.service.approve(
      body,
      principal
    );
  }

  async preflight(
    body:
      unknown,

    authorization:
      string | undefined,

    cookieHeader?:
      string
  ): Promise<unknown> {
    this.access.authenticate(
      authorization,
      cookieHeader
    );

    return this.service.preflight(
      body
    );
  }

  async issueReceipt(
    body:
      unknown,

    authorization:
      string | undefined,

    cookieHeader?:
      string
  ): Promise<unknown> {
    this.access.authenticate(
      authorization,
      cookieHeader
    );

    return this.service
      .issueExecutionReceipt(
        body
      );
  }

  async execute(
    body:
      unknown,

    authorization:
      string | undefined,

    cookieHeader?:
      string
  ): Promise<unknown> {
    this.access.authenticate(
      authorization,
      cookieHeader
    );

    const executionBody =
      trustedExecutionBody(
        body
      );

    return this.service
      .executeReceipt(
        executionBody
      );
  }
}
