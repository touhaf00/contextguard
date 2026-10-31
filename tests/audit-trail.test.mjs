import assert from "node:assert/strict";
import test from "node:test";

import {
  AuditTrail,
  verifyAuditEvents
} from "../dist/lib/audit-trail.js";

function trail() {
  const audit =
    new AuditTrail();

  audit.append(
    "ASSESSMENT_COMPLETED",
    "assessment-1",
    {
      repository:
        "example/project",
      status:
        "AWAITING_HUMAN_APPROVAL"
    },
    {
      eventId:
        "event-1",
      timestamp:
        "2026-10-31T01:00:00.000Z"
    }
  );

  audit.append(
    "ACTION_LOCK_CREATED",
    "approval-1",
    {
      fingerprint:
        "a".repeat(64),
      locked_sha:
        "b".repeat(40)
    },
    {
      eventId:
        "event-2",
      timestamp:
        "2026-10-31T01:01:00.000Z"
    }
  );

  return audit;
}

test(
  "creates a genesis audit event without a previous hash",
  () => {
    const audit =
      new AuditTrail();

    const event =
      audit.append(
        "ASSESSMENT_COMPLETED",
        "assessment-1",
        {
          result:
            "READY"
        },
        {
          eventId:
            "event-1",
          timestamp:
            "2026-10-31T01:00:00.000Z"
        }
      );

    assert.equal(
      event.sequence,
      1
    );

    assert.equal(
      event.previous_hash,
      null
    );

    assert.match(
      event.event_hash,
      /^[0-9a-f]{64}$/
    );
  }
);

test(
  "links each audit event to the previous event hash",
  () => {
    const events =
      trail().snapshot();

    assert.equal(
      events[1]
        .previous_hash,
      events[0]
        .event_hash
    );
  }
);

test(
  "verifies an intact audit chain",
  () => {
    const audit =
      trail();

    assert.equal(
      audit.verify(),
      true
    );

    assert.equal(
      verifyAuditEvents(
        audit.snapshot()
      ),
      true
    );
  }
);

test(
  "detects audit payload tampering",
  () => {
    const events =
      trail().snapshot();

    events[0].payload.status =
      "EXECUTED";

    assert.equal(
      verifyAuditEvents(
        events
      ),
      false
    );
  }
);

test(
  "detects audit event reordering",
  () => {
    const events =
      trail().snapshot();

    const reversed =
      [...events]
        .reverse();

    assert.equal(
      verifyAuditEvents(
        reversed
      ),
      false
    );
  }
);

test(
  "detects tampering with the audit hash chain",
  () => {
    const events =
      trail().snapshot();

    events[1]
      .previous_hash =
        "f".repeat(64);

    assert.equal(
      verifyAuditEvents(
        events
      ),
      false
    );
  }
);

test(
  "verifies an audit chain against a known checkpoint",
  async () => {
    const {
      verifyAuditCheckpoint
    } =
      await import(
        "../dist/lib/audit-trail.js"
      );

    const audit =
      trail();

    const checkpoint =
      audit.checkpoint();

    assert.equal(
      verifyAuditCheckpoint(
        audit.snapshot(),
        checkpoint
      ),
      true
    );
  }
);

test(
  "detects tail truncation against a known checkpoint",
  async () => {
    const {
      verifyAuditCheckpoint
    } =
      await import(
        "../dist/lib/audit-trail.js"
      );

    const audit =
      trail();

    const checkpoint =
      audit.checkpoint();

    const truncated =
      audit.snapshot();

    truncated.pop();

    assert.equal(
      verifyAuditCheckpoint(
        truncated,
        checkpoint
      ),
      false
    );
  }
);
