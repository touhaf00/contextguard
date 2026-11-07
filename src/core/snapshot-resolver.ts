import {
  sameSubject,
  validateResourceSnapshot,
  validateSubjectRef
} from "./contracts.js";

import type {
  ResourceSnapshot,
  SubjectRef
} from "./contracts.js";

export const SNAPSHOT_RESOLVER_VERSION =
  "2" as const;

const IDENTIFIER =
  /^[a-z0-9][a-z0-9._-]*$/;

export type SnapshotResolverErrorCode =
  | "INVALID_RESOLVER"
  | "UNSUPPORTED_SUBJECT"
  | "RESOLUTION_FAILED"
  | "INVALID_SNAPSHOT"
  | "SUBJECT_MISMATCH"
  | "RESOLVER_NOT_FOUND"
  | "DUPLICATE_PROVIDER";

export class SnapshotResolverError
  extends Error {
  constructor(
    public readonly code:
      SnapshotResolverErrorCode,

    message: string
  ) {
    super(message);
  }
}

export interface SnapshotResolverV2 {
  resolver_version:
    typeof SNAPSHOT_RESOLVER_VERSION;

  resolver_id:
    string;

  provider:
    string;

  supports(
    subject: SubjectRef
  ): boolean;

  resolve(
    subject: SubjectRef
  ): Promise<unknown>;
}

function requiredIdentifier(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new SnapshotResolverError(
      "INVALID_RESOLVER",
      `${label} must be a non-empty identifier.`
    );
  }

  const normalized =
    value.trim();

  if (
    !IDENTIFIER.test(
      normalized
    )
  ) {
    throw new SnapshotResolverError(
      "INVALID_RESOLVER",
      `${label} must use lowercase letters, numbers, dot, underscore or hyphen.`
    );
  }

  return normalized;
}

export function validateSnapshotResolverV2(
  resolver:
    SnapshotResolverV2
): SnapshotResolverV2 {
  if (
    typeof resolver !== "object" ||
    resolver === null
  ) {
    throw new SnapshotResolverError(
      "INVALID_RESOLVER",
      "SnapshotResolverV2 must be an object."
    );
  }

  if (
    resolver.resolver_version !==
      SNAPSHOT_RESOLVER_VERSION
  ) {
    throw new SnapshotResolverError(
      "INVALID_RESOLVER",
      `SnapshotResolverV2.resolver_version must be ${SNAPSHOT_RESOLVER_VERSION}.`
    );
  }

  requiredIdentifier(
    resolver.resolver_id,
    "SnapshotResolverV2.resolver_id"
  );

  requiredIdentifier(
    resolver.provider,
    "SnapshotResolverV2.provider"
  );

  if (
    typeof resolver.supports !==
      "function"
  ) {
    throw new SnapshotResolverError(
      "INVALID_RESOLVER",
      "SnapshotResolverV2.supports must be a function."
    );
  }

  if (
    typeof resolver.resolve !==
      "function"
  ) {
    throw new SnapshotResolverError(
      "INVALID_RESOLVER",
      "SnapshotResolverV2.resolve must be a function."
    );
  }

  return resolver;
}

export async function resolveResourceSnapshotV2(
  resolverValue:
    SnapshotResolverV2,

  subjectValue:
    unknown
): Promise<ResourceSnapshot> {
  const resolver =
    validateSnapshotResolverV2(
      resolverValue
    );

  const subject =
    validateSubjectRef(
      subjectValue
    );

  if (
    resolver.provider !==
      subject.provider
  ) {
    throw new SnapshotResolverError(
      "UNSUPPORTED_SUBJECT",
      `Resolver ${resolver.resolver_id} handles provider ${resolver.provider}, not ${subject.provider}.`
    );
  }

  let supported:
    boolean;

  try {
    supported =
      resolver.supports(
        subject
      );
  } catch {
    throw new SnapshotResolverError(
      "RESOLUTION_FAILED",
      `Resolver ${resolver.resolver_id} failed while checking subject support.`
    );
  }

  if (!supported) {
    throw new SnapshotResolverError(
      "UNSUPPORTED_SUBJECT",
      `Resolver ${resolver.resolver_id} does not support this subject.`
    );
  }

  let rawSnapshot:
    unknown;

  try {
    rawSnapshot =
      await resolver.resolve(
        subject
      );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown resolver failure.";

    throw new SnapshotResolverError(
      "RESOLUTION_FAILED",
      `Resolver ${resolver.resolver_id} failed: ${message}`
    );
  }

  let snapshot:
    ResourceSnapshot;

  try {
    snapshot =
      validateResourceSnapshot(
        rawSnapshot,
        "ResolvedResourceSnapshot"
      );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Invalid snapshot.";

    throw new SnapshotResolverError(
      "INVALID_SNAPSHOT",
      message
    );
  }

  if (
    !sameSubject(
      snapshot.subject,
      subject
    )
  ) {
    throw new SnapshotResolverError(
      "SUBJECT_MISMATCH",
      "Resolved ResourceSnapshot belongs to a different subject."
    );
  }

  return snapshot;
}

export class SnapshotResolverRegistryV2 {
  private readonly byProvider =
    new Map<
      string,
      SnapshotResolverV2
    >();

  register(
    resolverValue:
      SnapshotResolverV2
  ): void {
    const resolver =
      validateSnapshotResolverV2(
        resolverValue
      );

    if (
      this.byProvider.has(
        resolver.provider
      )
    ) {
      throw new SnapshotResolverError(
        "DUPLICATE_PROVIDER",
        `A SnapshotResolverV2 is already registered for provider ${resolver.provider}.`
      );
    }

    this.byProvider.set(
      resolver.provider,
      resolver
    );
  }

  hasProvider(
    provider: string
  ): boolean {
    return this.byProvider.has(
      provider
    );
  }

  async resolve(
    subjectValue: unknown
  ): Promise<ResourceSnapshot> {
    const subject =
      validateSubjectRef(
        subjectValue
      );

    const resolver =
      this.byProvider.get(
        subject.provider
      );

    if (!resolver) {
      throw new SnapshotResolverError(
        "RESOLVER_NOT_FOUND",
        `No SnapshotResolverV2 is registered for provider ${subject.provider}.`
      );
    }

    return resolveResourceSnapshotV2(
      resolver,
      subject
    );
  }
}
