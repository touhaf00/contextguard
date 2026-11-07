import {
  GenericAuthorizationApiErrorV2,
  evaluateGenericAuthorizationApiV2
} from "./authorization.js";

import type {
  GenericAuthorizationApiOptionsV2,
  GenericAuthorizationApiResponseV2
} from "./authorization.js";

export const GENERIC_AUTHORIZATION_HTTP_VERSION =
  "2" as const;

export type GenericAuthorizationHttpErrorCodeV2 =
  | "INVALID_BODY"
  | "UNSUPPORTED_FIELD"
  | "INVALID_AUTHORIZATION_PIPELINE";

export interface GenericAuthorizationHttpErrorBodyV2 {
  api_version:
    typeof GENERIC_AUTHORIZATION_HTTP_VERSION;

  error: {
    code:
      GenericAuthorizationHttpErrorCodeV2;

    message:
      string;
  };

  execution_configured:
    false;

  external_action_executed:
    false;
}

export type GenericAuthorizationHttpResultV2 =
  | {
      status:
        200;

      body:
        GenericAuthorizationApiResponseV2;
    }
  | {
      status:
        400;

      body:
        GenericAuthorizationHttpErrorBodyV2;
    };

export function handleGenericAuthorizationHttpV2(
  bodyValue:
    unknown,

  options:
    GenericAuthorizationApiOptionsV2 = {}
): GenericAuthorizationHttpResultV2 {
  try {
    return {
      status:
        200,

      body:
        evaluateGenericAuthorizationApiV2(
          bodyValue,
          options
        )
    };
  } catch (error) {
    const code:
      GenericAuthorizationHttpErrorCodeV2 =
      error instanceof
        GenericAuthorizationApiErrorV2
        ? error.code
        : "INVALID_AUTHORIZATION_PIPELINE";

    return {
      status:
        400,

      body: {
        api_version:
          GENERIC_AUTHORIZATION_HTTP_VERSION,

        error: {
          code,

          message:
            error instanceof Error
              ? error.message
              : "Invalid authorization pipeline."
        },

        execution_configured:
          false,

        external_action_executed:
          false
      }
    };
  }
}
