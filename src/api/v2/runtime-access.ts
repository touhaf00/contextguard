import {
  timingSafeEqual
} from "node:crypto";

export interface GenericRuntimeAccessConfigV2 {
  accessToken:
    string;
}

export type GenericRuntimeAccessErrorCodeV2 =
  | "DISABLED"
  | "UNAUTHORIZED";

export class GenericRuntimeAccessErrorV2
  extends Error {
  constructor(
    public readonly code:
      GenericRuntimeAccessErrorCodeV2,

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

export class GenericRuntimeAccessGateV2 {
  private readonly accessToken:
    string;

  constructor(
    config:
      GenericRuntimeAccessConfigV2
  ) {
    this.accessToken =
      config.accessToken.trim();
  }

  authenticate(
    authorization:
      string | undefined
  ): void {
    if (!this.accessToken) {
      throw new GenericRuntimeAccessErrorV2(
        "DISABLED",
        "Generic trusted runtime access is disabled until server credentials are configured."
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
      throw new GenericRuntimeAccessErrorV2(
        "UNAUTHORIZED",
        "Generic trusted runtime bearer token is required."
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
      throw new GenericRuntimeAccessErrorV2(
        "UNAUTHORIZED",
        "Generic trusted runtime bearer token is invalid."
      );
    }
  }
}
