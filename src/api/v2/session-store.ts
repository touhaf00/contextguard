import {
  randomUUID
} from "node:crypto";

import {
  digestCanonicalJson
} from "../../core/authorization-integrity.js";

import {
  verifyGenericActionLockV2
} from "../../core/action-lock.js";

import type {
  GenericActionLockV2
} from "../../core/action-lock.js";

import type {
  GenericAuthorizationApiResponseV2
} from "./authorization.js";

export const AUTHORIZATION_SESSION_VERSION =
  "2" as const;

export const AUTHORIZATION_SESSION_STATES = [
  "AWAITING_HUMAN_APPROVAL",
  "READY_FOR_PREFLIGHT"
] as const;

export type AuthorizationSessionStateV2 =
  (
    typeof AUTHORIZATION_SESSION_STATES
  )[number];

export interface AuthorizationSessionV2 {
  session_version:
    typeof AUTHORIZATION_SESSION_VERSION;

  session_id:
    string;

  request_id:
    string;

  session_state:
    AuthorizationSessionStateV2;

  lock_id:
    string;

  lock_fingerprint:
    string;

  lock:
    GenericActionLockV2;

  created_at:
    string;

  expires_at:
    string;

  session_digest:
    string;
}

export interface AuthorizationSessionDescriptorV2 {
  session_version:
    typeof AUTHORIZATION_SESSION_VERSION;

  session_id:
    string;

  request_id:
    string;

  session_state:
    AuthorizationSessionStateV2;

  lock_id:
    string;

  lock_fingerprint:
    string;

  expires_at:
    string;
}

export interface CreateAuthorizationSessionOptionsV2 {
  sessionId?: string;

  createdAt?: string;

  ttlMs?: number;
}

export interface AuthorizationSessionStoreOptionsV2 {
  ttlMs?: number;

  capacity?: number;

  now?: () => Date;
}

export type AuthorizationSessionStoreErrorCodeV2 =
  | "INVALID_RESPONSE"
  | "INVALID_SESSION"
  | "INVALID_TIME"
  | "INVALID_TTL"
  | "NOT_FOUND"
  | "EXPIRED"
  | "DUPLICATE_SESSION"
  | "DUPLICATE_LOCK"
  | "CAPACITY_REACHED";

export class AuthorizationSessionStoreErrorV2
  extends Error {
  constructor(
    public readonly code:
      AuthorizationSessionStoreErrorCodeV2,

    message: string
  ) {
    super(message);
  }
}

const SHA256 =
  /^[0-9a-f]{64}$/i;

const DEFAULT_TTL_MS =
  15 * 60 * 1000;

const DEFAULT_CAPACITY =
  100;

const ALLOWED_SESSION_FIELDS =
  new Set([
    "session_version",
    "session_id",
    "request_id",
    "session_state",
    "lock_id",
    "lock_fingerprint",
    "lock",
    "created_at",
    "expires_at",
    "session_digest"
  ]);

function clone<T>(
  value: T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
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
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

function requiredString(
  object:
    Record<string, unknown>,
  key: string,
  label: string
): string {
  const value =
    object[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      `${label}.${key} must be a non-empty string.`
    );
  }

  return value.trim();
}

function normalizeTimestamp(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_TIME",
      `${label} must be a valid timestamp.`
    );
  }

  const parsed =
    Date.parse(value);

  if (
    !Number.isFinite(parsed)
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_TIME",
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function validTtl(
  value: number
): number {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_TTL",
      "Authorization session TTL must be a positive integer."
    );
  }

  return value;
}

function expectedSessionState(
  lock:
    GenericActionLockV2
): AuthorizationSessionStateV2 {
  return (
    lock.intent
      .request
      .policy
      .human_approval ===
      "REQUIRED"
      ? "AWAITING_HUMAN_APPROVAL"
      : "READY_FOR_PREFLIGHT"
  );
}

function sessionDigestMaterial(
  value: Omit<
    AuthorizationSessionV2,
    "session_digest" |
    "lock"
  >
) {
  return value;
}

function sessionDigest(
  value: Omit<
    AuthorizationSessionV2,
    "session_digest"
  >
): string {
  return digestCanonicalJson(
    sessionDigestMaterial({
      session_version:
        value.session_version,

      session_id:
        value.session_id,

      request_id:
        value.request_id,

      session_state:
        value.session_state,

      lock_id:
        value.lock_id,

      lock_fingerprint:
        value.lock_fingerprint,

      created_at:
        value.created_at,

      expires_at:
        value.expires_at
    })
  );
}

function validateAuthorizationResponse(
  response:
    GenericAuthorizationApiResponseV2
): GenericActionLockV2 {
  if (
    response.api_version !==
      "2" ||
    response.execution_configured !==
      false ||
    response.external_action_executed !==
      false
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_RESPONSE",
      "Authorization response is not safe for session creation."
    );
  }

  if (
    !response.lock ||
    !verifyGenericActionLockV2(
      response.lock
    )
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_RESPONSE",
      "Authorization session requires a valid ActionLock."
    );
  }

  const lock =
    response.lock;

  if (
    response.request_id !==
      lock.intent
        .request
        .request_id
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_RESPONSE",
      "Authorization response request_id does not match its ActionLock."
    );
  }

  if (
    response.status !==
      lock.intent
        .authorization_decision
        .status
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_RESPONSE",
      "Authorization response status does not match its ActionLock."
    );
  }

  if (
    digestCanonicalJson(
      response.decision
    ) !==
      lock.intent
        .authorization_decision_digest
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_RESPONSE",
      "Authorization response decision does not match its ActionLock."
    );
  }

  const expectedStep =
    lock.intent
      .request
      .policy
      .human_approval ===
      "REQUIRED"
      ? "COLLECT_HUMAN_APPROVAL"
      : "RUN_PREFLIGHT";

  if (
    response.next_step !==
      expectedStep
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_RESPONSE",
      "Authorization response next_step does not match its locked policy."
    );
  }

  return lock;
}

export function validateAuthorizationSessionV2(
  value: unknown
): AuthorizationSessionV2 {
  const object =
    asObject(
      value,
      "AuthorizationSessionV2"
    );

  for (
    const key
    of Object.keys(object)
  ) {
    if (
      !ALLOWED_SESSION_FIELDS
        .has(key)
    ) {
      throw new AuthorizationSessionStoreErrorV2(
        "INVALID_SESSION",
        `AuthorizationSessionV2 contains unsupported field: ${key}.`
      );
    }
  }

  if (
    object.session_version !==
      AUTHORIZATION_SESSION_VERSION
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      `AuthorizationSessionV2.session_version must be ${AUTHORIZATION_SESSION_VERSION}.`
    );
  }

  const sessionId =
    requiredString(
      object,
      "session_id",
      "AuthorizationSessionV2"
    );

  const requestId =
    requiredString(
      object,
      "request_id",
      "AuthorizationSessionV2"
    );

  if (
    typeof object.session_state !==
      "string" ||
    !AUTHORIZATION_SESSION_STATES.includes(
      object.session_state as
        AuthorizationSessionStateV2
    )
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      "AuthorizationSessionV2.session_state is invalid."
    );
  }

  const state =
    object.session_state as
      AuthorizationSessionStateV2;

  const lock =
    object.lock as
      GenericActionLockV2;

  if (
    !verifyGenericActionLockV2(
      lock
    )
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      "AuthorizationSessionV2 contains an invalid ActionLock."
    );
  }

  const lockId =
    requiredString(
      object,
      "lock_id",
      "AuthorizationSessionV2"
    );

  if (
    lockId !==
      lock.lock_id
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      "AuthorizationSessionV2 lock_id does not match its ActionLock."
    );
  }

  const lockFingerprint =
    requiredString(
      object,
      "lock_fingerprint",
      "AuthorizationSessionV2"
    ).toLowerCase();

  if (
    !SHA256.test(
      lockFingerprint
    ) ||
    lockFingerprint !==
      lock.fingerprint
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      "AuthorizationSessionV2 lock_fingerprint does not match its ActionLock."
    );
  }

  if (
    requestId !==
      lock.intent
        .request
        .request_id
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      "AuthorizationSessionV2 request_id does not match its ActionLock."
    );
  }

  if (
    state !==
      expectedSessionState(
        lock
      )
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      "AuthorizationSessionV2 state does not match its locked policy."
    );
  }

  const createdAt =
    normalizeTimestamp(
      object.created_at,
      "AuthorizationSessionV2.created_at"
    );

  const expiresAt =
    normalizeTimestamp(
      object.expires_at,
      "AuthorizationSessionV2.expires_at"
    );

  if (
    Date.parse(createdAt) <
    Date.parse(
      lock.created_at
    )
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_TIME",
      "Authorization session cannot predate its ActionLock."
    );
  }

  if (
    Date.parse(expiresAt) <=
    Date.parse(createdAt)
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_TIME",
      "Authorization session must expire after creation."
    );
  }

  const digest =
    requiredString(
      object,
      "session_digest",
      "AuthorizationSessionV2"
    ).toLowerCase();

  if (
    !SHA256.test(
      digest
    )
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      "AuthorizationSessionV2.session_digest must be a SHA-256 digest."
    );
  }

  const base:
    Omit<
      AuthorizationSessionV2,
      "session_digest"
    > = {
    session_version:
      AUTHORIZATION_SESSION_VERSION,

    session_id:
      sessionId,

    request_id:
      requestId,

    session_state:
      state,

    lock_id:
      lockId,

    lock_fingerprint:
      lockFingerprint,

    lock:
      clone(lock),

    created_at:
      createdAt,

    expires_at:
      expiresAt
  };

  if (
    digest !==
      sessionDigest(
        base
      )
  ) {
    throw new AuthorizationSessionStoreErrorV2(
      "INVALID_SESSION",
      "AuthorizationSessionV2 digest verification failed."
    );
  }

  return {
    ...base,

    session_digest:
      digest
  };
}

export function authorizationSessionDescriptorV2(
  value:
    AuthorizationSessionV2
): AuthorizationSessionDescriptorV2 {
  const session =
    validateAuthorizationSessionV2(
      value
    );

  return {
    session_version:
      session.session_version,

    session_id:
      session.session_id,

    request_id:
      session.request_id,

    session_state:
      session.session_state,

    lock_id:
      session.lock_id,

    lock_fingerprint:
      session.lock_fingerprint,

    expires_at:
      session.expires_at
  };
}

export class AuthorizationSessionStoreV2 {
  private readonly sessions =
    new Map<
      string,
      AuthorizationSessionV2
    >();

  private readonly ttlMs:
    number;

  private readonly capacity:
    number;

  private readonly now:
    () => Date;

  constructor(
    options:
      AuthorizationSessionStoreOptionsV2 = {}
  ) {
    this.ttlMs =
      validTtl(
        options.ttlMs ??
          DEFAULT_TTL_MS
      );

    this.capacity =
      options.capacity ??
      DEFAULT_CAPACITY;

    if (
      !Number.isInteger(
        this.capacity
      ) ||
      this.capacity <= 0
    ) {
      throw new AuthorizationSessionStoreErrorV2(
        "CAPACITY_REACHED",
        "Authorization session capacity must be a positive integer."
      );
    }

    this.now =
      options.now ??
      (() => new Date());
  }

  private pruneExpired(
    nowMs:
      number
  ): void {
    for (
      const [
        sessionId,
        session
      ]
      of this.sessions
    ) {
      if (
        nowMs >=
        Date.parse(
          session.expires_at
        )
      ) {
        this.sessions.delete(
          sessionId
        );
      }
    }
  }

  create(
    response:
      GenericAuthorizationApiResponseV2,

    options:
      CreateAuthorizationSessionOptionsV2 = {}
  ): AuthorizationSessionV2 {
    const lock =
      validateAuthorizationResponse(
        response
      );

    const createdAt =
      normalizeTimestamp(
        options.createdAt ??
          this.now()
            .toISOString(),
        "AuthorizationSessionV2.created_at"
      );

    if (
      Date.parse(createdAt) <
      Date.parse(
        lock.created_at
      )
    ) {
      throw new AuthorizationSessionStoreErrorV2(
        "INVALID_TIME",
        "Authorization session cannot predate its ActionLock."
      );
    }

    const ttlMs =
      validTtl(
        options.ttlMs ??
          this.ttlMs
      );

    const expiresAt =
      new Date(
        Date.parse(
          createdAt
        ) + ttlMs
      ).toISOString();

    const nowMs =
      this.now()
        .getTime();

    this.pruneExpired(
      nowMs
    );

    if (
      this.sessions.size >=
        this.capacity
    ) {
      throw new AuthorizationSessionStoreErrorV2(
        "CAPACITY_REACHED",
        "Authorization session store capacity has been reached."
      );
    }

    const sessionId =
      (
        options.sessionId ??
        randomUUID()
      ).trim();

    if (!sessionId) {
      throw new AuthorizationSessionStoreErrorV2(
        "INVALID_SESSION",
        "Authorization session_id must be non-empty."
      );
    }

    if (
      this.sessions.has(
        sessionId
      )
    ) {
      throw new AuthorizationSessionStoreErrorV2(
        "DUPLICATE_SESSION",
        "Authorization session_id already exists."
      );
    }

    for (
      const session
      of this.sessions.values()
    ) {
      if (
        session.lock_fingerprint ===
          lock.fingerprint
      ) {
        throw new AuthorizationSessionStoreErrorV2(
          "DUPLICATE_LOCK",
          "An active authorization session already exists for this ActionLock."
        );
      }
    }

    const base:
      Omit<
        AuthorizationSessionV2,
        "session_digest"
      > = {
      session_version:
        AUTHORIZATION_SESSION_VERSION,

      session_id:
        sessionId,

      request_id:
        response.request_id,

      session_state:
        expectedSessionState(
          lock
        ),

      lock_id:
        lock.lock_id,

      lock_fingerprint:
        lock.fingerprint,

      lock:
        clone(lock),

      created_at:
        createdAt,

      expires_at:
        expiresAt
    };

    const session:
      AuthorizationSessionV2 = {
      ...base,

      session_digest:
        sessionDigest(
          base
        )
    };

    validateAuthorizationSessionV2(
      session
    );

    this.sessions.set(
      sessionId,
      clone(session)
    );

    return clone(
      session
    );
  }

  get(
    sessionIdValue:
      string
  ): AuthorizationSessionV2 {
    const sessionId =
      sessionIdValue.trim();

    const session =
      this.sessions.get(
        sessionId
      );

    if (!session) {
      throw new AuthorizationSessionStoreErrorV2(
        "NOT_FOUND",
        "Authorization session was not found."
      );
    }

    if (
      this.now()
        .getTime() >=
      Date.parse(
        session.expires_at
      )
    ) {
      this.sessions.delete(
        sessionId
      );

      throw new AuthorizationSessionStoreErrorV2(
        "EXPIRED",
        "Authorization session has expired."
      );
    }

    try {
      return clone(
        validateAuthorizationSessionV2(
          session
        )
      );
    } catch (error) {
      throw new AuthorizationSessionStoreErrorV2(
        "INVALID_SESSION",
        error instanceof Error
          ? error.message
          : "Stored authorization session is invalid."
      );
    }
  }

  has(
    sessionId:
      string
  ): boolean {
    try {
      this.get(
        sessionId
      );

      return true;
    } catch {
      return false;
    }
  }

  size(): number {
    this.pruneExpired(
      this.now()
        .getTime()
    );

    return this.sessions.size;
  }
}
