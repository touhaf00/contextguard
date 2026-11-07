import {
  timingSafeEqual
} from "node:crypto";

export interface GenericExecutorAccessConfigV2 {
  accessToken:
    string;
}

export type GenericExecutorAccessErrorCodeV2 =
  | "DISABLED"
  | "UNAUTHORIZED";

export class GenericExecutorAccessErrorV2
  extends Error {
  constructor(
    public readonly code:
      GenericExecutorAccessErrorCodeV2,

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

export class GenericExecutorAccessGateV2 {
  private readonly accessToken:
    string;

  constructor(
    config:
      GenericExecutorAccessConfigV2
  ) {
    this.accessToken =
      config.accessToken.trim();
  }

  authenticate(
    authorization:
      string | undefined
  ): void {
    if (
      !this.accessToken
    ) {
      throw new GenericExecutorAccessErrorV2(
        "DISABLED",
        "Trusted executor access is disabled until server credentials are configured."
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
      throw new GenericExecutorAccessErrorV2(
        "UNAUTHORIZED",
        "Trusted executor bearer token is required."
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
      throw new GenericExecutorAccessErrorV2(
        "UNAUTHORIZED",
        "Trusted executor bearer token is invalid."
      );
    }
  }
}
