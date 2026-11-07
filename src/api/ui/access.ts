import {
  timingSafeEqual
} from "node:crypto";

import type {
  HumanApprovalPrincipalV2
} from "../../core/approval-attestation.js";

import type {
  ContextGuardUiSessionManagerV2
} from "./session.js";

export interface ContextGuardUiAccessConfigV2 {
  accessToken:
    string;

  principalId:
    string;

  displayName?:
    string;
}

export type ContextGuardUiAccessErrorCodeV2 =
  | "DISABLED"
  | "UNAUTHORIZED";

export class ContextGuardUiAccessErrorV2
  extends Error {
  constructor(
    public readonly code:
      ContextGuardUiAccessErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

function secureEqual(
  left:
    string,

  right:
    string
): boolean {
  const a =
    Buffer.from(
      left,
      "utf8"
    );

  const b =
    Buffer.from(
      right,
      "utf8"
    );

  if (
    a.length !==
      b.length
  ) {
    return false;
  }

  return timingSafeEqual(
    a,
    b
  );
}

export class ContextGuardUiAccessGateV2 {
  private readonly accessToken:
    string;

  private readonly principalId:
    string;

  private readonly displayName?:
    string;

  constructor(
    config:
      ContextGuardUiAccessConfigV2,

    private readonly sessions?:
      ContextGuardUiSessionManagerV2
  ) {
    this.accessToken =
      config.accessToken.trim();

    this.principalId =
      config.principalId.trim();

    this.displayName =
      config.displayName
        ?.trim() ||
      undefined;
  }

  authenticate(
    authorization:
      string | undefined,

    cookieHeader?:
      string
  ): HumanApprovalPrincipalV2 {
    if (
      this.sessions &&
      cookieHeader
    ) {
      try {
        return this.sessions
          .authenticate(
            cookieHeader
          );
      } catch {
      }
    }

    if (
      !this.accessToken ||
      !this.principalId
    ) {
      throw new ContextGuardUiAccessErrorV2(
        "DISABLED",
        "ContextGuard UI access is disabled until server credentials are configured."
      );
    }

    const prefix =
      "Bearer ";

    if (
      !authorization ||
      !authorization.startsWith(
        prefix
      )
    ) {
      throw new ContextGuardUiAccessErrorV2(
        "UNAUTHORIZED",
        "ContextGuard UI bearer token is required."
      );
    }

    const token =
      authorization
        .slice(
          prefix.length
        )
        .trim();

    if (
      !token ||
      !secureEqual(
        token,
        this.accessToken
      )
    ) {
      throw new ContextGuardUiAccessErrorV2(
        "UNAUTHORIZED",
        "ContextGuard UI bearer token is invalid."
      );
    }

    return {
      principal_type:
        "HUMAN",

      principal_id:
        this.principalId,

      ...(this.displayName
        ? {
            display_name:
              this.displayName
          }
        : {}),

      authentication_method:
        "bearer_token"
    };
  }
}
