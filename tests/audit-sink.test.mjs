import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuditCheckpointV2,
  readVerifiedAuditChainV2,
  verifyAuditChainV2,
  verifyAuditCheckpointV2,
  verifyAuditSinkCheckpointV2
} from "../dist/audit/sink.js";

import {
  InMemoryAuditSinkV2
} from "../dist/audit/in-memory.js";

function sink() {
  return new InMemoryAuditSinkV2({
    sinkId:
      "memory.audit"
  });
}

async function appendFixture(
  auditSink,
  index
) {
  return auditSink.append({
    event_id:
      `event-${index}`,

    event_type:
      index === 1
        ? "authorization.requested"
        : "preflight.verified",

    subject_key:
      "stripe:payment:pi_123",

    timestamp:
      `2026-11-01T21:0${index}:00Z`,

    payload: {
      request_id:
        "req-123",

      index
    }
  });
}

test(
  "creates a genesis event with no previous hash",
  async () => {
    const auditSink =
      sink();

    const event =
      await appendFixture(
        auditSink,
        1
      );

    assert.equal(
      event.sequence,
      1
    );

    assert.equal(
      event.previous_hash,
      null
    );

    assert.equal(
      auditSink.verify(),
      true
    );
  }
);

test(
  "links each event to the previous event hash",
  async () => {
    const auditSink =
      sink();

    const first =
      await appendFixture(
        auditSink,
        1
      );

    const second =
      await appendFixture(
        auditSink,
        2
      );

    assert.equal(
      second.previous_hash,
      first.event_hash
    );

    assert.equal(
      auditSink.verify(),
      true
    );
  }
);

test(
  "returned records are detached from internal audit state",
  async () => {
    const auditSink =
      sink();

    const event =
      await appendFixture(
        auditSink,
        1
      );

    event.payload.index =
      999;

    const stored =
      await auditSink.readAll();

    assert.equal(
      stored[0].payload.index,
      1
    );

    assert.equal(
      auditSink.verify(),
      true
    );
  }
);

test(
  "readAll returns detached copies",
  async () => {
    const auditSink =
      sink();

    await appendFixture(
      auditSink,
      1
    );

    const firstRead =
      await auditSink.readAll();

    firstRead[0]
      .subject_key =
      "tampered";

    const secondRead =
      await auditSink.readAll();

    assert.equal(
      secondRead[0]
        .subject_key,
      "stripe:payment:pi_123"
    );
  }
);

test(
  "payload tampering invalidates the chain",
  async () => {
    const auditSink =
      sink();

    await appendFixture(
      auditSink,
      1
    );

    const records =
      await auditSink.readAll();

    records[0]
      .payload.index =
      999;

    assert.equal(
      verifyAuditChainV2(
        records
      ),
      false
    );
  }
);

test(
  "event metadata tampering invalidates the chain",
  async () => {
    const auditSink =
      sink();

    await appendFixture(
      auditSink,
      1
    );

    const records =
      await auditSink.readAll();

    records[0]
      .event_type =
      "execution.completed";

    assert.equal(
      verifyAuditChainV2(
        records
      ),
      false
    );
  }
);

test(
  "event reordering invalidates the chain",
  async () => {
    const auditSink =
      sink();

    await appendFixture(
      auditSink,
      1
    );

    await appendFixture(
      auditSink,
      2
    );

    const records =
      await auditSink.readAll();

    records.reverse();

    assert.equal(
      verifyAuditChainV2(
        records
      ),
      false
    );
  }
);

test(
  "checkpoint verifies an intact chain",
  async () => {
    const auditSink =
      sink();

    await appendFixture(
      auditSink,
      1
    );

    await appendFixture(
      auditSink,
      2
    );

    const records =
      await auditSink.readAll();

    const checkpoint =
      createAuditCheckpointV2(
        records
      );

    assert.equal(
      verifyAuditCheckpointV2(
        records,
        checkpoint
      ),
      true
    );
  }
);

test(
  "checkpoint detects tail truncation",
  async () => {
    const auditSink =
      sink();

    await appendFixture(
      auditSink,
      1
    );

    await appendFixture(
      auditSink,
      2
    );

    const records =
      await auditSink.readAll();

    const checkpoint =
      createAuditCheckpointV2(
        records
      );

    records.pop();

    assert.equal(
      verifyAuditCheckpointV2(
        records,
        checkpoint
      ),
      false
    );
  }
);

test(
  "empty audit chain has a valid null checkpoint",
  async () => {
    const auditSink =
      sink();

    const checkpoint =
      await auditSink
        .checkpoint();

    assert.deepEqual(
      checkpoint,
      {
        audit_version:
          "2",

        event_count:
          0,

        head_hash:
          null
      }
    );

    assert.equal(
      await verifyAuditSinkCheckpointV2(
        auditSink
      ),
      true
    );
  }
);

test(
  "duplicate event IDs are rejected",
  async () => {
    const auditSink =
      sink();

    await appendFixture(
      auditSink,
      1
    );

    await assert.rejects(
      auditSink.append({
        event_id:
          "event-1",

        event_type:
          "approval.decided",

        subject_key:
          "stripe:payment:pi_123",

        timestamp:
          "2026-11-01T21:03:00Z",

        payload: {
          decision:
            "APPROVED"
        }
      }),
      /already been recorded/
    );
  }
);

test(
  "non JSON-compatible audit payload fails closed",
  async () => {
    const auditSink =
      sink();

    await assert.rejects(
      auditSink.append({
        event_type:
          "authorization.requested",

        subject_key:
          "stripe:payment:pi_123",

        payload: {
          impossible:
            Number.NaN
        }
      }),
      /non-finite number/
    );
  }
);

test(
  "invalid event type fails closed",
  async () => {
    const auditSink =
      sink();

    await assert.rejects(
      auditSink.append({
        event_type:
          "INVALID EVENT TYPE",

        subject_key:
          "stripe:payment:pi_123",

        payload: {
          ok: true
        }
      }),
      /valid identifier/
    );
  }
);

test(
  "generic audit reader verifies a valid sink",
  async () => {
    const auditSink =
      sink();

    await appendFixture(
      auditSink,
      1
    );

    await appendFixture(
      auditSink,
      2
    );

    const records =
      await readVerifiedAuditChainV2(
        auditSink
      );

    assert.equal(
      records.length,
      2
    );

    assert.equal(
      await verifyAuditSinkCheckpointV2(
        auditSink
      ),
      true
    );
  }
);

test(
  "generic audit reader rejects a malicious sink returning a broken chain",
  async () => {
    const auditSink =
      sink();

    await appendFixture(
      auditSink,
      1
    );

    const records =
      await auditSink.readAll();

    records[0]
      .payload.index =
      999;

    const maliciousSink = {
      sink_version:
        "2",

      sink_id:
        "malicious.audit",

      async append() {
        throw new Error(
          "not used"
        );
      },

      async readAll() {
        return records;
      },

      async checkpoint() {
        return {
          audit_version:
            "2",

          event_count:
            1,

          head_hash:
            records[0]
              .event_hash
        };
      }
    };

    await assert.rejects(
      readVerifiedAuditChainV2(
        maliciousSink
      ),
      /invalid audit chain/
    );
  }
);
