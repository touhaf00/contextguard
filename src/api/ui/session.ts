import {
  randomUUID
} from "node:crypto";

import type {
  HumanApprovalPrincipalV2
} from "../../core/approval-attestation.js";

export const CONTEXTGUARD_UI_SESSION_VERSION =
  "1" as const;

export const CONTEXTGUARD_UI_SESSION_COOKIE =
  "contextguard_ui_session";

const DEFAULT_TTL_MS =
  8 * 60 * 60 * 1000;

const DEFAULT_CAPACITY =
  100;

export type ContextGuardUiSessionErrorCodeV2 =
  | "DISABLED"
  | "REMOTE_NOT_ALLOWED"
  | "UNAUTHORIZED"
  | "EXPIRED"
  | "CAPACITY_EXCEEDED";

export class ContextGuardUiSessionErrorV2
  extends Error {
  constructor(
    public readonly code:
      ContextGuardUiSessionErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface ContextGuardUiSessionV2 {
  session_version:
    typeof CONTEXTGUARD_UI_SESSION_VERSION;

  session_id:
    string;

  principal:
    HumanApprovalPrincipalV2;

  created_at:
    string;

  expires_at:
    string;
}

export interface ContextGuardUiSessionConfigV2 {
  localSessionEnabled:
    boolean;

  principalId:
    string;

  displayName?:
    string;

  ttlMs?:
    number;

  capacity?:
    number;

  now?:
    () => Date;

  sessionId?:
    () => string;
}

function clone<T>(
  value:
    T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function normalizeAddress(
  value:
    string | undefined
): string {
  return (
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}

export function isLoopbackAddressV2(
  value:
    string | undefined
): boolean {
  const address =
    normalizeAddress(
      value
    );

  return (
    address ===
      "127.0.0.1" ||
    address ===
      "::1" ||
    address ===
      "::ffff:127.0.0.1"
  );
}

function parseCookie(
  cookieHeader:
    string | undefined,

  name:
    string
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (
    const part
    of cookieHeader.split(";")
  ) {
    const separator =
      part.indexOf("=");

    if (
      separator === -1
    ) {
      continue;
    }

    const key =
      part
        .slice(
          0,
          separator
        )
        .trim();

    if (
      key !== name
    ) {
      continue;
    }

    try {
      return decodeURIComponent(
        part
          .slice(
            separator + 1
          )
          .trim()
      );
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export class ContextGuardUiSessionManagerV2 {
  private readonly sessions =
    new Map<
      string,
      ContextGuardUiSessionV2
    >();

  private readonly enabled:
    boolean;

  private readonly principal:
    HumanApprovalPrincipalV2;

  private readonly ttlMs:
    number;

  private readonly capacity:
    number;

  private readonly now:
    () => Date;

  private readonly sessionId:
    () => string;

  constructor(
    config:
      ContextGuardUiSessionConfigV2
  ) {
    this.enabled =
      config.localSessionEnabled;

    const principalId =
      config.principalId
        .trim();

    if (!principalId) {
      throw new Error(
        "ContextGuard UI session principalId is required."
      );
    }

    const displayName =
      config.displayName
        ?.trim();

    this.principal = {
      principal_type:
        "HUMAN",

      principal_id:
        principalId,

      ...(displayName
        ? {
            display_name:
              displayName
          }
        : {}),

      authentication_method:
        "local_session"
    };

    this.ttlMs =
      config.ttlMs ??
      DEFAULT_TTL_MS;

    if (
      !Number.isInteger(
        this.ttlMs
      ) ||
      this.ttlMs <= 0
    ) {
      throw new Error(
        "ContextGuard UI session ttlMs must be a positive integer."
      );
    }

    this.capacity =
      config.capacity ??
      DEFAULT_CAPACITY;

    if (
      !Number.isInteger(
        this.capacity
      ) ||
      this.capacity <= 0
    ) {
      throw new Error(
        "ContextGuard UI session capacity must be a positive integer."
      );
    }

    this.now =
      config.now ??
      (() => new Date());

    this.sessionId =
      config.sessionId ??
      randomUUID;
  }

  createLocalSession(
    remoteAddress:
      string | undefined
  ): ContextGuardUiSessionV2 {
    if (!this.enabled) {
      throw new ContextGuardUiSessionErrorV2(
        "DISABLED",
        "Local ContextGuard UI sessions are disabled."
      );
    }

    if (
      !isLoopbackAddressV2(
        remoteAddress
      )
    ) {
      throw new ContextGuardUiSessionErrorV2(
        "REMOTE_NOT_ALLOWED",
        "Automatic local UI sessions are allowed only from the loopback interface."
      );
    }

    this.pruneExpired();

    if (
      this.sessions.size >=
      this.capacity
    ) {
      throw new ContextGuardUiSessionErrorV2(
        "CAPACITY_EXCEEDED",
        "ContextGuard UI session capacity has been reached."
      );
    }

    const createdAt =
      this.now();

    const expiresAt =
      new Date(
        createdAt.getTime() +
        this.ttlMs
      );

    const session:
      ContextGuardUiSessionV2 = {
        session_version:
          CONTEXTGUARD_UI_SESSION_VERSION,

        session_id:
          this.sessionId(),

        principal:
          clone(
            this.principal
          ),

        created_at:
          createdAt
            .toISOString(),

        expires_at:
          expiresAt
            .toISOString()
      };

    this.sessions.set(
      session.session_id,
      clone(session)
    );

    return clone(
      session
    );
  }

  createAuthenticatedSession(
    principal:
      HumanApprovalPrincipalV2
  ): ContextGuardUiSessionV2 {
    if (
      principal.principal_type !==
        "HUMAN" ||
      !principal.principal_id
        .trim() ||
      typeof principal
        .authentication_method !==
        "string" ||
      !principal
        .authentication_method
        .trim()
    ) {
      throw new ContextGuardUiSessionErrorV2(
        "UNAUTHORIZED",
        "Authenticated ContextGuard UI principal is invalid."
      );
    }

    this.pruneExpired();

    if (
      this.sessions.size >=
      this.capacity
    ) {
      throw new ContextGuardUiSessionErrorV2(
        "CAPACITY_EXCEEDED",
        "ContextGuard UI session capacity has been reached."
      );
    }

    const createdAt =
      this.now();

    const expiresAt =
      new Date(
        createdAt.getTime() +
        this.ttlMs
      );

    const session:
      ContextGuardUiSessionV2 = {
        session_version:
          CONTEXTGUARD_UI_SESSION_VERSION,

        session_id:
          this.sessionId(),

        principal:
          clone(
            principal
          ),

        created_at:
          createdAt
            .toISOString(),

        expires_at:
          expiresAt
            .toISOString()
      };

    this.sessions.set(
      session.session_id,
      clone(session)
    );

    return clone(
      session
    );
  }


  getSession(
    cookieHeader:
      string | undefined
  ): ContextGuardUiSessionV2 {
    const sessionId =
      parseCookie(
        cookieHeader,
        CONTEXTGUARD_UI_SESSION_COOKIE
      );

    if (!sessionId) {
      throw new ContextGuardUiSessionErrorV2(
        "UNAUTHORIZED",
        "ContextGuard UI session is required."
      );
    }

    const session =
      this.sessions.get(
        sessionId
      );

    if (!session) {
      throw new ContextGuardUiSessionErrorV2(
        "UNAUTHORIZED",
        "ContextGuard UI session is unknown."
      );
    }

    if (
      Date.parse(
        session.expires_at
      ) <=
      this.now().getTime()
    ) {
      this.sessions.delete(
        sessionId
      );

      throw new ContextGuardUiSessionErrorV2(
        "EXPIRED",
        "ContextGuard UI session has expired."
      );
    }

    return clone(
      session
    );
  }

  authenticate(
    cookieHeader:
      string | undefined
  ): HumanApprovalPrincipalV2 {
    return clone(
      this.getSession(
        cookieHeader
      ).principal
    );
  }

  revoke(
    cookieHeader:
      string | undefined
  ): void {
    const sessionId =
      parseCookie(
        cookieHeader,
        CONTEXTGUARD_UI_SESSION_COOKIE
      );

    if (sessionId) {
      this.sessions.delete(
        sessionId
      );
    }
  }

  cookieHeader(
    session:
      ContextGuardUiSessionV2
  ): string {
    const ttlSeconds =
      Math.max(
        1,
        Math.floor(
          (
            Date.parse(
              session.expires_at
            ) -
            Date.parse(
              session.created_at
            )
          ) /
          1000
        )
      );

    return [
      `${CONTEXTGUARD_UI_SESSION_COOKIE}=${encodeURIComponent(session.session_id)}`,
      "HttpOnly",
      "SameSite=Strict",
      "Path=/",
      `Max-Age=${ttlSeconds}`
    ].join("; ");
  }

  clearCookieHeader():
    string {
    return [
      `${CONTEXTGUARD_UI_SESSION_COOKIE}=`,
      "HttpOnly",
      "SameSite=Strict",
      "Path=/",
      "Max-Age=0"
    ].join("; ");
  }

  private pruneExpired():
    void {
    const now =
      this.now()
        .getTime();

    for (
      const [
        sessionId,
        session
      ]
      of this.sessions
    ) {
      if (
        Date.parse(
          session.expires_at
        ) <= now
      ) {
        this.sessions.delete(
          sessionId
        );
      }
    }
  }
}
