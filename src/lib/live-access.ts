import {
  timingSafeEqual
} from "node:crypto";

export type LiveAccessErrorCode =
  | "DISABLED"
  | "UNAUTHORIZED"
  | "REPOSITORY_NOT_ALLOWED"
  | "BUSY"
  | "RATE_LIMITED";

export class LiveAccessError
  extends Error {
  constructor(
    public readonly code:
      LiveAccessErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "LiveAccessError";
  }
}

export interface LiveAccessGateOptions {
  accessToken: string;
  allowedRepositories:
    readonly string[];
  maxRequests?: number;
  windowMs?: number;
}

function normalizedRepository(
  repository: string
): string {
  return repository
    .trim()
    .toLowerCase();
}

function secureEqual(
  left: string,
  right: string
): boolean {
  const leftBuffer =
    Buffer.from(
      left,
      "utf8"
    );

  const rightBuffer =
    Buffer.from(
      right,
      "utf8"
    );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    leftBuffer,
    rightBuffer
  );
}

export class LiveAccessGate {
  private readonly accessToken:
    string;

  private readonly allowedRepositories:
    Set<string>;

  private readonly maxRequests:
    number;

  private readonly windowMs:
    number;

  private requestTimes:
    number[] = [];

  private inProgress =
    false;

  constructor(
    options:
      LiveAccessGateOptions
  ) {
    this.accessToken =
      options.accessToken.trim();

    this.allowedRepositories =
      new Set(
        options
          .allowedRepositories
          .map(
            normalizedRepository
          )
          .filter(Boolean)
      );

    this.maxRequests =
      options.maxRequests ?? 3;

    this.windowMs =
      options.windowMs ??
      600_000;

    if (
      !Number.isInteger(
        this.maxRequests
      ) ||
      this.maxRequests <= 0
    ) {
      throw new Error(
        "maxRequests must be a positive integer."
      );
    }

    if (
      !Number.isInteger(
        this.windowMs
      ) ||
      this.windowMs <= 0
    ) {
      throw new Error(
        "windowMs must be a positive integer."
      );
    }
  }

  private requireEnabled():
    void {
    if (
      !this.accessToken ||
      this.allowedRepositories
        .size === 0
    ) {
      throw new LiveAccessError(
        "DISABLED",
        "Live assessments are disabled until server access controls are configured."
      );
    }
  }

  authenticate(
    authorization:
      string | undefined
  ): void {
    this.requireEnabled();

    const prefix =
      "Bearer ";

    if (
      !authorization ||
      !authorization
        .startsWith(prefix)
    ) {
      throw new LiveAccessError(
        "UNAUTHORIZED",
        "Live access token is required."
      );
    }

    const token =
      authorization
        .slice(prefix.length)
        .trim();

    if (
      !token ||
      !secureEqual(
        token,
        this.accessToken
      )
    ) {
      throw new LiveAccessError(
        "UNAUTHORIZED",
        "Live access token is invalid."
      );
    }
  }

  assertRepositoryAllowed(
    repository: string
  ): void {
    this.requireEnabled();

    if (
      !this.allowedRepositories
        .has(
          normalizedRepository(
            repository
          )
        )
    ) {
      throw new LiveAccessError(
        "REPOSITORY_NOT_ALLOWED",
        "Repository is not allowed for live assessments."
      );
    }
  }

  begin(
    now = Date.now()
  ): void {
    this.requireEnabled();

    if (this.inProgress) {
      throw new LiveAccessError(
        "BUSY",
        "Another live assessment is already running."
      );
    }

    const minimumTime =
      now - this.windowMs;

    this.requestTimes =
      this.requestTimes.filter(
        (timestamp) =>
          timestamp >
          minimumTime
      );

    if (
      this.requestTimes.length >=
      this.maxRequests
    ) {
      throw new LiveAccessError(
        "RATE_LIMITED",
        "Live assessment rate limit reached."
      );
    }

    this.requestTimes.push(
      now
    );

    this.inProgress =
      true;
  }

  end(): void {
    this.inProgress =
      false;
  }
}
