import {
  validateCurrentExecutionContextV2
} from "../../core/resolved-preflight.js";

import type {
  CurrentExecutionContextV2
} from "../../core/resolved-preflight.js";

import type {
  AuthorizationSessionV2
} from "./session-store.js";

import type {
  GenericPreflightContextProviderV2
} from "./preflight.js";

const SHA256 =
  /^[0-9a-f]{64}$/i;

function clone<T>(
  value:
    T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

export type TrustedExecutionContextStoreErrorCodeV2 =
  | "INVALID_BINDING"
  | "INVALID_CONTEXT"
  | "MISSING_CONTEXT"
  | "LOCK_MISMATCH";

export class TrustedExecutionContextStoreErrorV2
  extends Error {
  constructor(
    public readonly code:
      TrustedExecutionContextStoreErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

interface StoredExecutionContextV2 {
  session_id:
    string;

  lock_fingerprint:
    string;

  context:
    CurrentExecutionContextV2;
}

export class TrustedExecutionContextStoreV2
  implements GenericPreflightContextProviderV2 {
  private readonly contexts =
    new Map<
      string,
      StoredExecutionContextV2
    >();

  set(
    sessionIdValue:
      string,

    lockFingerprintValue:
      string,

    contextValue:
      unknown
  ): void {
    const sessionId =
      sessionIdValue.trim();

    const lockFingerprint =
      lockFingerprintValue
        .trim()
        .toLowerCase();

    if (
      !sessionId ||
      !SHA256.test(
        lockFingerprint
      )
    ) {
      throw new TrustedExecutionContextStoreErrorV2(
        "INVALID_BINDING",
        "Trusted execution context requires a valid session id and lock fingerprint."
      );
    }

    let context:
      CurrentExecutionContextV2;

    try {
      context =
        validateCurrentExecutionContextV2(
          contextValue
        );
    } catch (error) {
      throw new TrustedExecutionContextStoreErrorV2(
        "INVALID_CONTEXT",
        error instanceof Error
          ? error.message
          : "Trusted execution context is invalid."
      );
    }

    this.contexts.set(
      sessionId,
      {
        session_id:
          sessionId,

        lock_fingerprint:
          lockFingerprint,

        context:
          clone(context)
      }
    );
  }

  has(
    sessionId:
      string
  ): boolean {
    return this.contexts.has(
      sessionId.trim()
    );
  }

  delete(
    sessionId:
      string
  ): boolean {
    return this.contexts.delete(
      sessionId.trim()
    );
  }

  async getCurrentContext(
    session:
      AuthorizationSessionV2
  ): Promise<CurrentExecutionContextV2> {
    const stored =
      this.contexts.get(
        session.session_id
      );

    if (!stored) {
      throw new TrustedExecutionContextStoreErrorV2(
        "MISSING_CONTEXT",
        "Trusted execution context is unavailable for this authorization session."
      );
    }

    if (
      stored.lock_fingerprint !==
      session.lock_fingerprint
        .toLowerCase()
    ) {
      throw new TrustedExecutionContextStoreErrorV2(
        "LOCK_MISMATCH",
        "Trusted execution context is bound to another ActionLock fingerprint."
      );
    }

    return clone(
      stored.context
    );
  }
}
