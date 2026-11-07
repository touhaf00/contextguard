import {
  timingSafeEqual
} from "node:crypto";

import type {
  HumanApprovalPrincipalV2
} from "../../core/approval-attestation.js";

export interface GenericApprovalAccessConfigV2 {
  accessToken:
    string;

  principalId:
    string;

  displayName?:
    string;
}

export type GenericApprovalAccessErrorCodeV2 =
  | "DISABLED"
  | "UNAUTHORIZED";

export class GenericApprovalAccessErrorV2
  extends Error {
  constructor(
    public readonly code:
      GenericApprovalAccessErrorCodeV2,

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

export class GenericApprovalAccessGateV2 {
  private readonly accessToken:
    string;

  private readonly principalId:
    string;

  private readonly displayName?:
    string;

  constructor(
    config:
      GenericApprovalAccessConfigV2
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
      string | undefined
  ): HumanApprovalPrincipalV2 {
    if (
      !this.accessToken ||
      !this.principalId
    ) {
      throw new GenericApprovalAccessErrorV2(
        "DISABLED",
        "Generic approval access is disabled until server credentials are configured."
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
      throw new GenericApprovalAccessErrorV2(
        "UNAUTHORIZED",
        "Generic approval bearer token is required."
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
      throw new GenericApprovalAccessErrorV2(
        "UNAUTHORIZED",
        "Generic approval bearer token is invalid."
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
