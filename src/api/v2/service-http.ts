import {
  GenericAuthorizationApiErrorV2
} from "./authorization.js";

import {
  GenericApprovalApiErrorV2
} from "./approval.js";

import {
  GenericPreflightApiErrorV2
} from "./preflight.js";

import {
  TrustedExecutionContextApiErrorV2
} from "./execution-context.js";

import {
  ExecutionReceiptApiErrorV2
} from "./execution-receipt-api.js";

import {
  ExecutionReceiptStoreErrorV2
} from "./execution-receipt-store.js";

import {
  ExecutionAuthorizationReceiptErrorV2
} from "./execution-receipt.js";

import {
  GenericExecutionApiErrorV2
} from "./execution-api.js";

import {
  PostExecutionEvidenceErrorV2
} from "./execution-proof-audit.js";

import {
  GenericExecutorAccessErrorV2
} from "./executor-access.js";

import {
  TrustedExecutionAuthorizationErrorV2,
  TrustedExecutorStateErrorV2
} from "../../core/trusted-executor.js";

import type {
  TrustedExecutionContextApiResponseV2
} from "./execution-context.js";

import {
  AuthorizationSessionStoreErrorV2
} from "./session-store.js";

import {
  GenericApprovalAccessErrorV2
} from "./approval-access.js";

import {
  GenericRuntimeAccessErrorV2
} from "./runtime-access.js";

import {
  GenericAuthorizationServiceErrorV2
} from "./service.js";

import {
  GenericPreflightError
} from "../../core/preflight.js";

import {
  SnapshotResolverError
} from "../../core/snapshot-resolver.js";

import type {
  HumanApprovalPrincipalV2
} from "../../core/approval-attestation.js";

import type {
  GenericAuthorizationServiceResponseV2
} from "./service.js";

import type {
  GenericApprovalApiResponseV2
} from "./approval.js";

import type {
  GenericPreflightApiResponseV2
} from "./preflight.js";

import type {
  ExecutionReceiptIssueApiResponseV2,
  ExecutionReceiptConsumeApiResponseV2
} from "./execution-receipt-api.js";

import type {
  GenericExecutionApiResponseV2
} from "./execution-api.js";

import type {
  TrustedExecutorResultV2
} from "../../core/trusted-executor.js";

export interface GenericAuthorizationServiceLikeV2 {
  authorize(
    body:
      unknown
  ):
    GenericAuthorizationServiceResponseV2;

  approve(
    body:
      unknown,

    principal:
      unknown
  ):
    GenericApprovalApiResponseV2;

  preflight(
    body:
      unknown
  ):
    Promise<
      GenericPreflightApiResponseV2
    >;

  issueExecutionReceipt(
    body:
      unknown
  ):
    Promise<
      ExecutionReceiptIssueApiResponseV2
    >;

  consumeExecutionReceipt(
    body:
      unknown
  ):
    ExecutionReceiptConsumeApiResponseV2;

  executeReceipt(
    body:
      unknown
  ):
    Promise<
      GenericExecutionApiResponseV2
    >;
}

export interface GenericApprovalAccessLikeV2 {
  authenticate(
    authorization:
      string | undefined
  ):
    HumanApprovalPrincipalV2;
}

export interface GenericRuntimeAccessLikeV2 {
  authenticate(
    authorization:
      string | undefined
  ):
    void;
}

export interface GenericExecutorAccessLikeV2 {
  authenticate(
    authorization:
      string | undefined
  ):
    void;
}

export interface GenericExecutionContextApiLikeV2 {
  update(
    body:
      unknown
  ):
    TrustedExecutionContextApiResponseV2;
}

export interface GenericServiceHttpErrorBodyV2 {
  api_version:
    "2";

  error: {
    code:
      string;

    message:
      string;
  };

  execution_configured:
    false;

  external_action_executed:
    false;
}

export interface GenericServiceHttpPostExecutionErrorBodyV2 {
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

export type GenericServiceHttpResultV2 =
  | {
      status:
        200;

      body:
        GenericAuthorizationServiceResponseV2 |
        GenericApprovalApiResponseV2 |
        GenericPreflightApiResponseV2 |
        TrustedExecutionContextApiResponseV2 |
        ExecutionReceiptIssueApiResponseV2 |
        ExecutionReceiptConsumeApiResponseV2 |
        GenericExecutionApiResponseV2;
    }
  | {
      status:
        number;

      body:
        GenericServiceHttpErrorBodyV2 |
        GenericServiceHttpPostExecutionErrorBodyV2;
    };

function postExecutionEvidenceErrorResult(
  error:
    PostExecutionEvidenceErrorV2
): GenericServiceHttpResultV2 {
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

function errorResult(
  status:
    number,

  code:
    string,

  message:
    string
): GenericServiceHttpResultV2 {
  return {
    status,

    body: {
      api_version:
        "2",

      error: {
        code,
        message
      },

      execution_configured:
        false,

      external_action_executed:
        false
    }
  };
}

function runtimeAccessError(
  error:
    unknown
): GenericServiceHttpResultV2 {
  if (
    error instanceof
      GenericRuntimeAccessErrorV2
  ) {
    return errorResult(
      error.code ===
        "DISABLED"
        ? 503
        : 401,
      error.code,
      error.message
    );
  }

  return errorResult(
    401,
    "UNAUTHORIZED",
    "Trusted runtime authentication failed."
  );
}

function executorAccessError(
  error:
    unknown
): GenericServiceHttpResultV2 {
  if (
    error instanceof
      GenericExecutorAccessErrorV2
  ) {
    return errorResult(
      error.code ===
        "DISABLED"
        ? 503
        : 401,
      error.code,
      error.message
    );
  }

  return errorResult(
    401,
    "UNAUTHORIZED",
    "Trusted executor authentication failed."
  );
}

function sessionError(
  error:
    AuthorizationSessionStoreErrorV2
): GenericServiceHttpResultV2 {
  const status =
    error.code ===
      "NOT_FOUND"
      ? 404
      : error.code ===
          "EXPIRED"
        ? 410
        : 409;

  return errorResult(
    status,
    error.code,
    error.message
  );
}

function executionReceiptStoreError(
  error:
    ExecutionReceiptStoreErrorV2
): GenericServiceHttpResultV2 {
  const status =
    error.code ===
      "NOT_FOUND"
      ? 404
      : error.code ===
          "EXPIRED"
        ? 410
        : error.code ===
            "CAPACITY_REACHED"
          ? 503
          : error.code ===
              "DUPLICATE_RECEIPT" ||
            error.code ===
              "DUPLICATE_LOCK" ||
            error.code ===
              "ALREADY_CONSUMED" ||
            error.code ===
              "DIGEST_MISMATCH"
            ? 409
            : 409;

  return errorResult(
    status,
    error.code,
    error.message
  );
}

export class GenericAuthorizationServiceHttpV2 {
  constructor(
    private readonly service:
      GenericAuthorizationServiceLikeV2,

    private readonly approvalAccess:
      GenericApprovalAccessLikeV2,

    private readonly runtimeAccess:
      GenericRuntimeAccessLikeV2,

    private readonly executionContextApi?:
      GenericExecutionContextApiLikeV2,

    private readonly executorAccess?:
      GenericExecutorAccessLikeV2
  ) {}

  authorize(
    body:
      unknown,

    authorization:
      string | undefined
  ): GenericServiceHttpResultV2 {
    try {
      this.runtimeAccess
        .authenticate(
          authorization
        );
    } catch (error) {
      return runtimeAccessError(
        error
      );
    }

    try {
      return {
        status:
          200,

        body:
          this.service.authorize(
            body
          )
      };
    } catch (error) {
      if (
        error instanceof
          GenericAuthorizationApiErrorV2
      ) {
        return errorResult(
          400,
          error.code,
          error.message
        );
      }

      return errorResult(
        400,
        "INVALID_AUTHORIZATION_PIPELINE",
        error instanceof Error
          ? error.message
          : "Invalid authorization pipeline."
      );
    }
  }

  executionContext(
    body:
      unknown,

    authorization:
      string | undefined
  ): GenericServiceHttpResultV2 {
    try {
      this.runtimeAccess
        .authenticate(
          authorization
        );
    } catch (error) {
      return runtimeAccessError(
        error
      );
    }

    if (
      !this.executionContextApi
    ) {
      return errorResult(
        503,
        "EXECUTION_CONTEXT_NOT_CONFIGURED",
        "Trusted execution context API is not configured."
      );
    }

    try {
      return {
        status:
          200,

        body:
          this.executionContextApi
            .update(
              body
            )
      };
    } catch (error) {
      if (
        error instanceof
          TrustedExecutionContextApiErrorV2
      ) {
        return errorResult(
          400,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          AuthorizationSessionStoreErrorV2
      ) {
        return sessionError(
          error
        );
      }

      return errorResult(
        400,
        "INVALID_EXECUTION_CONTEXT",
        error instanceof Error
          ? error.message
          : "Trusted execution context update failed."
      );
    }
  }

  approve(
    body:
      unknown,

    authorization:
      string | undefined
  ): GenericServiceHttpResultV2 {
    let principal:
      HumanApprovalPrincipalV2;

    try {
      principal =
        this.approvalAccess
          .authenticate(
            authorization
          );
    } catch (error) {
      if (
        error instanceof
          GenericApprovalAccessErrorV2
      ) {
        return errorResult(
          error.code ===
            "DISABLED"
            ? 503
            : 401,
          error.code,
          error.message
        );
      }

      return errorResult(
        401,
        "UNAUTHORIZED",
        "Approval authentication failed."
      );
    }

    try {
      return {
        status:
          200,

        body:
          this.service.approve(
            body,
            principal
          )
      };
    } catch (error) {
      if (
        error instanceof
          GenericApprovalApiErrorV2
      ) {
        const status =
          error.code ===
            "UNAUTHENTICATED_PRINCIPAL"
            ? 401
            : error.code ===
                "ALREADY_DECIDED" ||
              error.code ===
                "INVALID_SESSION_STATE"
              ? 409
              : 400;

        return errorResult(
          status,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          AuthorizationSessionStoreErrorV2
      ) {
        return sessionError(
          error
        );
      }

      return errorResult(
        400,
        "INVALID_APPROVAL",
        error instanceof Error
          ? error.message
          : "Approval failed."
      );
    }
  }

  async issueExecutionReceipt(
    body:
      unknown,

    authorization:
      string | undefined
  ): Promise<GenericServiceHttpResultV2> {
    try {
      this.runtimeAccess
        .authenticate(
          authorization
        );
    } catch (error) {
      return runtimeAccessError(
        error
      );
    }

    try {
      return {
        status:
          200,

        body:
          await this.service
            .issueExecutionReceipt(
              body
            )
      };
    } catch (error) {
      if (
        error instanceof
          ExecutionReceiptApiErrorV2
      ) {
        return errorResult(
          400,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          AuthorizationSessionStoreErrorV2
      ) {
        return sessionError(
          error
        );
      }

      if (
        error instanceof
          GenericAuthorizationServiceErrorV2
      ) {
        return errorResult(
          503,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          GenericPreflightApiErrorV2
      ) {
        return errorResult(
          error.code ===
            "CURRENT_CONTEXT_UNAVAILABLE"
            ? 503
            : 400,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          SnapshotResolverError
      ) {
        const unavailable =
          error.code ===
            "RESOLVER_NOT_FOUND" ||
          error.code ===
            "RESOLUTION_FAILED";

        return errorResult(
          unavailable
            ? 503
            : 409,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          GenericPreflightError
      ) {
        return errorResult(
          409,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          ExecutionAuthorizationReceiptErrorV2
      ) {
        return errorResult(
          error.code ===
            "AUTHORIZATION_EXPIRED"
            ? 410
            : 409,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          ExecutionReceiptStoreErrorV2
      ) {
        return executionReceiptStoreError(
          error
        );
      }

      return errorResult(
        400,
        "INVALID_EXECUTION_RECEIPT",
        error instanceof Error
          ? error.message
          : "Execution receipt issuance failed."
      );
    }
  }

  consumeExecutionReceipt(
    body:
      unknown,

    authorization:
      string | undefined
  ): GenericServiceHttpResultV2 {
    try {
      this.runtimeAccess
        .authenticate(
          authorization
        );
    } catch (error) {
      return runtimeAccessError(
        error
      );
    }

    try {
      return {
        status:
          200,

        body:
          this.service
            .consumeExecutionReceipt(
              body
            )
      };
    } catch (error) {
      if (
        error instanceof
          ExecutionReceiptApiErrorV2
      ) {
        return errorResult(
          400,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          ExecutionReceiptStoreErrorV2
      ) {
        return executionReceiptStoreError(
          error
        );
      }

      return errorResult(
        400,
        "INVALID_EXECUTION_RECEIPT_CONSUMPTION",
        error instanceof Error
          ? error.message
          : "Execution receipt consumption failed."
      );
    }
  }

  async executeReceipt(
    body:
      unknown,

    authorization:
      string | undefined
  ): Promise<GenericServiceHttpResultV2> {
    if (
      !this.executorAccess
    ) {
      return errorResult(
        503,
        "EXECUTOR_ACCESS_NOT_CONFIGURED",
        "Trusted executor access is not configured."
      );
    }

    try {
      this.executorAccess
        .authenticate(
          authorization
        );
    } catch (error) {
      return executorAccessError(
        error
      );
    }

    try {
      return {
        status:
          200,

        body:
          await this.service
            .executeReceipt(
              body
            )
      };
    } catch (error) {
      if (
        error instanceof
          PostExecutionEvidenceErrorV2
      ) {
        return postExecutionEvidenceErrorResult(
          error
        );
      }

      if (
        error instanceof
          GenericExecutionApiErrorV2
      ) {
        const providerResultError =
          error.code ===
            "INVALID_EXECUTOR_RESULT" ||
          error.code ===
            "EXECUTOR_RESULT_MISMATCH";

        return errorResult(
          providerResultError
            ? 502
            : 400,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          ExecutionReceiptStoreErrorV2
      ) {
        return executionReceiptStoreError(
          error
        );
      }

      if (
        error instanceof
          GenericAuthorizationServiceErrorV2
      ) {
        return errorResult(
          503,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          TrustedExecutionAuthorizationErrorV2
      ) {
        return errorResult(
          error.code ===
            "AUTHORIZATION_EXPIRED"
            ? 410
            : 409,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          TrustedExecutorStateErrorV2
      ) {
        return errorResult(
          error.code ===
            "STATE_UNAVAILABLE"
            ? 503
            : 409,
          error.code,
          error.message
        );
      }

      return errorResult(
        502,
        "EXECUTION_FAILED",
        "Trusted executor failed."
      );
    }
  }

  async preflight(
    body:
      unknown,

    authorization:
      string | undefined
  ): Promise<GenericServiceHttpResultV2> {
    try {
      this.runtimeAccess
        .authenticate(
          authorization
        );
    } catch (error) {
      return runtimeAccessError(
        error
      );
    }

    try {
      return {
        status:
          200,

        body:
          await this.service
            .preflight(
              body
            )
      };
    } catch (error) {
      if (
        error instanceof
          GenericPreflightApiErrorV2
      ) {
        return errorResult(
          error.code ===
            "CURRENT_CONTEXT_UNAVAILABLE"
            ? 503
            : 400,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          GenericAuthorizationServiceErrorV2
      ) {
        return errorResult(
          503,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          AuthorizationSessionStoreErrorV2
      ) {
        return sessionError(
          error
        );
      }

      if (
        error instanceof
          SnapshotResolverError
      ) {
        const unavailable =
          error.code ===
            "RESOLVER_NOT_FOUND" ||
          error.code ===
            "RESOLUTION_FAILED";

        return errorResult(
          unavailable
            ? 503
            : 409,
          error.code,
          error.message
        );
      }

      if (
        error instanceof
          GenericPreflightError
      ) {
        return errorResult(
          409,
          error.code,
          error.message
        );
      }

      return errorResult(
        400,
        "INVALID_PREFLIGHT",
        error instanceof Error
          ? error.message
          : "Preflight failed."
      );
    }
  }
}
