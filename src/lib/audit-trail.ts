import {
  createHash,
  randomUUID
} from "node:crypto";

import {
  AUDIT_EVENT_TYPES
} from "../types.js";

import type {
  AuditCheckpoint,
  AuditEvent,
  AuditEventType
} from "../types.js";

function clone<T>(
  value: T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function canonicalize(
  value: unknown
): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return (
      "[" +
      value
        .map(canonicalize)
        .join(",") +
      "]"
    );
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        "Audit payload contains a non-finite number."
      );
    }

    return JSON.stringify(value);
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    const object =
      value as Record<
        string,
        unknown
      >;

    const keys =
      Object.keys(object)
        .filter(
          (key) =>
            object[key] !==
              undefined
        )
        .sort();

    return (
      "{" +
      keys
        .map(
          (key) =>
            `${JSON.stringify(key)}:${canonicalize(
              object[key]
            )}`
        )
        .join(",") +
      "}"
    );
  }

  throw new Error(
    `Unsupported audit value: ${typeof value}.`
  );
}

function sha256(
  value: unknown
): string {
  return createHash(
    "sha256"
  )
    .update(
      canonicalize(value),
      "utf8"
    )
    .digest("hex");
}

function calculateEventHash(
  event: Omit<
    AuditEvent,
    "event_hash"
  >
): string {
  return sha256({
    sequence:
      event.sequence,

    event_id:
      event.event_id,

    event_type:
      event.event_type,

    subject_id:
      event.subject_id,

    timestamp:
      event.timestamp,

    previous_hash:
      event.previous_hash,

    payload_hash:
      event.payload_hash
  });
}

export function verifyAuditEvents(
  events: readonly AuditEvent[]
): boolean {
  let previousHash:
    string | null =
      null;

  for (
    let index = 0;
    index < events.length;
    index += 1
  ) {
    const event =
      events[index];

    if (
      event.sequence !==
      index + 1
    ) {
      return false;
    }

    if (
      !AUDIT_EVENT_TYPES.includes(
        event.event_type
      )
    ) {
      return false;
    }

    if (
      !event.event_id.trim() ||
      !event.subject_id.trim()
    ) {
      return false;
    }

    if (
      event.previous_hash !==
      previousHash
    ) {
      return false;
    }

    const payloadHash =
      sha256(
        event.payload
      );

    if (
      payloadHash !==
      event.payload_hash
    ) {
      return false;
    }

    const {
      event_hash:
        suppliedHash,
      ...unsignedEvent
    } = event;

    const expectedHash =
      calculateEventHash(
        unsignedEvent
      );

    if (
      suppliedHash !==
      expectedHash
    ) {
      return false;
    }

    previousHash =
      event.event_hash;
  }

  return true;
}

export function verifyAuditCheckpoint(
  events: readonly AuditEvent[],
  checkpoint: AuditCheckpoint
): boolean {
  if (
    !Number.isInteger(
      checkpoint.event_count
    ) ||
    checkpoint.event_count < 0
  ) {
    return false;
  }

  if (
    checkpoint.head_hash !== null &&
    !/^[0-9a-f]{64}$/i.test(
      checkpoint.head_hash
    )
  ) {
    return false;
  }

  if (
    events.length !==
    checkpoint.event_count
  ) {
    return false;
  }

  if (
    !verifyAuditEvents(
      events
    )
  ) {
    return false;
  }

  const actualHead =
    events.length > 0
      ? events[
          events.length - 1
        ].event_hash
      : null;

  return (
    actualHead ===
    checkpoint.head_hash
  );
}

export interface AppendAuditOptions {
  eventId?: string;
  timestamp?: string;
}

export class AuditTrail {
  private readonly events:
    AuditEvent[] = [];

  append(
    eventType:
      AuditEventType,

    subjectId:
      string,

    payload:
      Record<string, unknown>,

    options:
      AppendAuditOptions = {}
  ): AuditEvent {
    const normalizedSubject =
      subjectId.trim();

    if (!normalizedSubject) {
      throw new Error(
        "Audit subject_id must be non-empty."
      );
    }

    const previous =
      this.events[
        this.events.length - 1
      ];

    const payloadCopy =
      clone(payload);

    const unsignedEvent:
      Omit<
        AuditEvent,
        "event_hash"
      > = {
      sequence:
        this.events.length + 1,

      event_id:
        options.eventId ??
        randomUUID(),

      event_type:
        eventType,

      subject_id:
        normalizedSubject,

      timestamp:
        options.timestamp ??
        new Date()
          .toISOString(),

      previous_hash:
        previous?.event_hash ??
        null,

      payload:
        payloadCopy,

      payload_hash:
        sha256(
          payloadCopy
        )
    };

    const event:
      AuditEvent = {
      ...unsignedEvent,

      event_hash:
        calculateEventHash(
          unsignedEvent
        )
    };

    this.events.push(
      event
    );

    return clone(
      event
    );
  }

  snapshot():
    AuditEvent[] {
    return clone(
      this.events
    );
  }

  verify(): boolean {
    return verifyAuditEvents(
      this.events
    );
  }

  checkpoint():
    AuditCheckpoint {
    const head =
      this.events.length > 0
        ? this.events[
            this.events.length - 1
          ].event_hash
        : null;

    return {
      event_count:
        this.events.length,

      head_hash:
        head
    };
  }
}
