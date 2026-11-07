import {
  evaluateGenericAuthorizationApiV2
} from "./authorization.js";

import {
  applyGenericApprovalApiV2
} from "./approval.js";

import {
  runGenericPreflightApiV2
} from "./preflight.js";

import {
  AuthorizationSessionStoreV2,
  authorizationSessionDescriptorV2
} from "./session-store.js";

import {
  AuthorizationApprovalStoreV2
} from "./approval-store.js";

import {
  ExecutionAuthorizationReceiptStoreV2
} from "./execution-receipt-store.js";

import {
  issueExecutionAuthorizationApiV2,
  consumeExecutionAuthorizationApiV2
} from "./execution-receipt-api.js";

import {
  executeExecutionAuthorizationApiV2
} from "./execution-api.js";

import {
  ExecutionProofStoreV2
} from "./execution-proof-store.js";

import {
  InMemoryAuditSinkV2
} from "../../audit/in-memory.js";

import {
  validateAuditSinkV2
} from "../../audit/sink.js";

import type {
  GenericAuthorizationApiOptionsV2,
  GenericAuthorizationApiResponseV2
} from "./authorization.js";

import type {
  GenericApprovalApiOptionsV2,
  GenericApprovalApiResponseV2
} from "./approval.js";

import type {
  AuthorizationSessionDescriptorV2,
  AuthorizationSessionStoreOptionsV2
} from "./session-store.js";

import type {
  AuthorizationApprovalRecordV2
} from "./approval-store.js";

import type {
  GenericPreflightApiOptionsV2,
  GenericPreflightApiResponseV2,
  GenericPreflightContextProviderV2
} from "./preflight.js";

import type {
  SnapshotResolverRegistryV2
} from "../../core/snapshot-resolver.js";

import type {
  ExecutionReceiptStoreOptionsV2,
  ConsumeExecutionReceiptOptionsV2
} from "./execution-receipt-store.js";

import type {
  CreateExecutionAuthorizationReceiptOptionsV2
} from "./execution-receipt.js";

import type {
  ExecutionReceiptIssueApiResponseV2,
  ExecutionReceiptConsumeApiResponseV2
} from "./execution-receipt-api.js";

import type {
  GenericExecutionApiOptionsV2,
  GenericExecutionApiResponseV2
} from "./execution-api.js";

import type {
  TrustedExecutorV2
} from "../../core/trusted-executor.js";

import type {
  ExecutionProofStoreOptionsV2
} from "./execution-proof-store.js";

import type {
  AuditSinkV2
} from "../../audit/sink.js";

export const GENERIC_AUTHORIZATION_SERVICE_VERSION =
  "2" as const;

export interface GenericAuthorizationServiceOptionsV2 {
  sessionStore?:
    AuthorizationSessionStoreV2;

  approvalStore?:
    AuthorizationApprovalStoreV2;

  sessionStoreOptions?:
    AuthorizationSessionStoreOptionsV2;

  preflightResolverRegistry?:
    SnapshotResolverRegistryV2;

  preflightContextProvider?:
    GenericPreflightContextProviderV2;

  executionReceiptStore?:
    ExecutionAuthorizationReceiptStoreV2;

  executionReceiptStoreOptions?:
    ExecutionReceiptStoreOptionsV2;

  trustedExecutor?:
    TrustedExecutorV2;

  executionProofStore?:
    ExecutionProofStoreV2;

  executionProofStoreOptions?:
    ExecutionProofStoreOptionsV2;

  executionAuditSink?:
    AuditSinkV2;
}

export type GenericAuthorizationServiceErrorCodeV2 =
  | "PREFLIGHT_NOT_CONFIGURED"
  | "EXECUTOR_NOT_CONFIGURED";

export class GenericAuthorizationServiceErrorV2
  extends Error {
  constructor(
    public readonly code:
      GenericAuthorizationServiceErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface GenericAuthorizationServiceAuthorizeOptionsV2
  extends GenericAuthorizationApiOptionsV2 {
  sessionId?: string;

  sessionCreatedAt?: string;

  sessionTtlMs?: number;
}

export interface GenericAuthorizationServiceResponseV2
  extends GenericAuthorizationApiResponseV2 {
  session?:
    AuthorizationSessionDescriptorV2;
}

export interface GenericAuthorizationServiceIssueReceiptOptionsV2 {
  preflight?:
    GenericPreflightApiOptionsV2;

  receipt?:
    CreateExecutionAuthorizationReceiptOptionsV2;

  storedAt?:
    string;
}

export class GenericAuthorizationServiceV2 {
  public readonly sessions:
    AuthorizationSessionStoreV2;

  public readonly approvals:
    AuthorizationApprovalStoreV2;

  private readonly preflightResolverRegistry?:
    SnapshotResolverRegistryV2;

  private readonly preflightContextProvider?:
    GenericPreflightContextProviderV2;

  #executionReceipts:
    ExecutionAuthorizationReceiptStoreV2;

  private readonly trustedExecutor?:
    TrustedExecutorV2;

  public readonly executionProofs:
    ExecutionProofStoreV2;

  public readonly executionAudit:
    AuditSinkV2;

  constructor(
    options:
      GenericAuthorizationServiceOptionsV2 = {}
  ) {
    this.sessions =
      options.sessionStore ??
      new AuthorizationSessionStoreV2(
        options.sessionStoreOptions
      );

    this.approvals =
      options.approvalStore ??
      new AuthorizationApprovalStoreV2();

    this.preflightResolverRegistry =
      options.preflightResolverRegistry;

    this.preflightContextProvider =
      options.preflightContextProvider;

    this.#executionReceipts =
      options.executionReceiptStore ??
      new ExecutionAuthorizationReceiptStoreV2(
        options.executionReceiptStoreOptions
      );

    this.trustedExecutor =
      options.trustedExecutor;

    this.executionProofs =
      options.executionProofStore ??
      new ExecutionProofStoreV2(
        options.executionProofStoreOptions
      );

    this.executionAudit =
      validateAuditSinkV2(
        options.executionAuditSink ??
          new InMemoryAuditSinkV2({
            sinkId:
              "memory.execution"
          })
      );
  }

  authorize(
    bodyValue:
      unknown,

    options:
      GenericAuthorizationServiceAuthorizeOptionsV2 = {}
  ): GenericAuthorizationServiceResponseV2 {
    const authorization =
      evaluateGenericAuthorizationApiV2(
        bodyValue,
        {
          intentId:
            options.intentId,

          lockId:
            options.lockId,

          lockCreatedAt:
            options.lockCreatedAt
        }
      );

    if (
      !authorization.lock
    ) {
      return authorization;
    }

    const session =
      this.sessions.create(
        authorization,
        {
          sessionId:
            options.sessionId,

          createdAt:
            options.sessionCreatedAt,

          ttlMs:
            options.sessionTtlMs
        }
      );

    return {
      ...authorization,

      session:
        authorizationSessionDescriptorV2(
          session
        )
    };
  }

  approve(
    bodyValue:
      unknown,

    trustedPrincipalValue:
      unknown,

    options:
      GenericApprovalApiOptionsV2 = {}
  ): GenericApprovalApiResponseV2 {
    return applyGenericApprovalApiV2(
      bodyValue,
      trustedPrincipalValue,
      this.sessions,
      this.approvals,
      options
    );
  }

  async preflight(
    bodyValue:
      unknown,

    options:
      GenericPreflightApiOptionsV2 = {}
  ): Promise<GenericPreflightApiResponseV2> {
    if (
      !this.preflightResolverRegistry ||
      !this.preflightContextProvider
    ) {
      throw new GenericAuthorizationServiceErrorV2(
        "PREFLIGHT_NOT_CONFIGURED",
        "Generic preflight service is not configured."
      );
    }

    return runGenericPreflightApiV2(
      bodyValue,
      this.sessions,
      this.approvals,
      this.preflightResolverRegistry,
      this.preflightContextProvider,
      options
    );
  }

  async issueExecutionReceipt(
    bodyValue:
      unknown,

    options:
      GenericAuthorizationServiceIssueReceiptOptionsV2 = {}
  ): Promise<ExecutionReceiptIssueApiResponseV2> {
    if (
      !this.preflightResolverRegistry ||
      !this.preflightContextProvider
    ) {
      throw new GenericAuthorizationServiceErrorV2(
        "PREFLIGHT_NOT_CONFIGURED",
        "Generic preflight service is not configured."
      );
    }

    return issueExecutionAuthorizationApiV2(
      bodyValue,
      this.sessions,
      this.approvals,
      this.#executionReceipts,
      (
        preflightBody
      ) =>
        this.preflight(
          preflightBody,
          options.preflight
        ),
      {
        receipt:
          options.receipt,

        storedAt:
          options.storedAt
      }
    );
  }

  consumeExecutionReceipt(
    bodyValue:
      unknown,

    options:
      ConsumeExecutionReceiptOptionsV2 = {}
  ): ExecutionReceiptConsumeApiResponseV2 {
    return consumeExecutionAuthorizationApiV2(
      bodyValue,
      this.#executionReceipts,
      options
    );
  }

  async executeReceipt(
    bodyValue:
      unknown,

    options:
      GenericExecutionApiOptionsV2 = {}
  ): Promise<GenericExecutionApiResponseV2> {
    if (
      !this.trustedExecutor
    ) {
      throw new GenericAuthorizationServiceErrorV2(
        "EXECUTOR_NOT_CONFIGURED",
        "Trusted executor is not configured."
      );
    }

    return executeExecutionAuthorizationApiV2(
      bodyValue,
      this.#executionReceipts,
      this.trustedExecutor,
      options,
      {
        proofStore:
          this.executionProofs,

        auditSink:
          this.executionAudit
      }
    );
  }

  session(
    sessionId:
      string
  ): AuthorizationSessionDescriptorV2 {
    return authorizationSessionDescriptorV2(
      this.sessions.get(
        sessionId
      )
    );
  }

  approval(
    sessionId:
      string
  ): AuthorizationApprovalRecordV2 {
    const session =
      this.sessions.get(
        sessionId
      );

    return this.approvals.get(
      session
    );
  }
}
