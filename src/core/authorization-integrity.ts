import {
  createHash
} from "node:crypto";

import {
  canonicalJson,
  validateAuthorizationRequest
} from "./contracts.js";

import type {
  AuthorizationRequest
} from "./contracts.js";

export const AUTHORIZATION_ENVELOPE_VERSION =
  "1" as const;

export interface AuthorizationEnvelope {
  envelope_version:
    typeof AUTHORIZATION_ENVELOPE_VERSION;

  request:
    AuthorizationRequest;

  request_digest:
    string;

  issued_at:
    string;

  envelope_digest:
    string;
}

const SHA256 =
  /^[0-9a-f]{64}$/i;

function sha256(
  value: string
): string {
  return createHash(
    "sha256"
  )
    .update(
      value,
      "utf8"
    )
    .digest(
      "hex"
    );
}

export function digestCanonicalJson(
  value: unknown
): string {
  return sha256(
    canonicalJson(
      value
    )
  );
}

export function authorizationRequestDigest(
  value: unknown
): string {
  const request =
    validateAuthorizationRequest(
      value
    );

  return digestCanonicalJson(
    request
  );
}

function envelopeMaterial(
  envelope: {
    envelope_version: string;
    request_digest: string;
    issued_at: string;
  }
) {
  return {
    envelope_version:
      envelope.envelope_version,

    request_digest:
      envelope.request_digest,

    issued_at:
      envelope.issued_at
  };
}

function normalizeTimestamp(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label} must be a non-empty timestamp.`
    );
  }

  const parsed =
    Date.parse(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    throw new Error(
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

export interface CreateAuthorizationEnvelopeOptions {
  issuedAt?: string;
}

export function createAuthorizationEnvelope(
  value: unknown,
  options:
    CreateAuthorizationEnvelopeOptions = {}
): AuthorizationEnvelope {
  const request =
    validateAuthorizationRequest(
      value
    );

  const requestDigest =
    digestCanonicalJson(
      request
    );

  const issuedAt =
    normalizeTimestamp(
      options.issuedAt ??
        new Date().toISOString(),
      "AuthorizationEnvelope.issued_at"
    );

  const material = {
    envelope_version:
      AUTHORIZATION_ENVELOPE_VERSION,

    request_digest:
      requestDigest,

    issued_at:
      issuedAt
  };

  return {
    envelope_version:
      AUTHORIZATION_ENVELOPE_VERSION,

    request,

    request_digest:
      requestDigest,

    issued_at:
      issuedAt,

    envelope_digest:
      digestCanonicalJson(
        material
      )
  };
}

export function validateAuthorizationEnvelope(
  value: unknown
): AuthorizationEnvelope {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "AuthorizationEnvelope must be a JSON object."
    );
  }

  const object =
    value as
      Record<string, unknown>;

  if (
    object.envelope_version !==
      AUTHORIZATION_ENVELOPE_VERSION
  ) {
    throw new Error(
      `AuthorizationEnvelope.envelope_version must be ${AUTHORIZATION_ENVELOPE_VERSION}.`
    );
  }

  const request =
    validateAuthorizationRequest(
      object.request,
      "AuthorizationEnvelope.request"
    );

  if (
    typeof object.request_digest !==
      "string" ||
    !SHA256.test(
      object.request_digest
    )
  ) {
    throw new Error(
      "AuthorizationEnvelope.request_digest must be a SHA-256 hex digest."
    );
  }

  const requestDigest =
    object.request_digest
      .toLowerCase();

  const expectedRequestDigest =
    digestCanonicalJson(
      request
    );

  if (
    requestDigest !==
      expectedRequestDigest
  ) {
    throw new Error(
      "AuthorizationEnvelope request digest does not match the embedded request."
    );
  }

  const issuedAt =
    normalizeTimestamp(
      object.issued_at,
      "AuthorizationEnvelope.issued_at"
    );

  if (
    typeof object.envelope_digest !==
      "string" ||
    !SHA256.test(
      object.envelope_digest
    )
  ) {
    throw new Error(
      "AuthorizationEnvelope.envelope_digest must be a SHA-256 hex digest."
    );
  }

  const envelopeDigest =
    object.envelope_digest
      .toLowerCase();

  const expectedEnvelopeDigest =
    digestCanonicalJson(
      envelopeMaterial({
        envelope_version:
          AUTHORIZATION_ENVELOPE_VERSION,

        request_digest:
          requestDigest,

        issued_at:
          issuedAt
      })
    );

  if (
    envelopeDigest !==
      expectedEnvelopeDigest
  ) {
    throw new Error(
      "AuthorizationEnvelope digest verification failed."
    );
  }

  return {
    envelope_version:
      AUTHORIZATION_ENVELOPE_VERSION,

    request,

    request_digest:
      requestDigest,

    issued_at:
      issuedAt,

    envelope_digest:
      envelopeDigest
  };
}

export function verifyAuthorizationEnvelope(
  value: unknown
): boolean {
  try {
    validateAuthorizationEnvelope(
      value
    );

    return true;
  } catch {
    return false;
  }
}
