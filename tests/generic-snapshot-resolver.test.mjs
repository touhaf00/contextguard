import assert from "node:assert/strict";
import test from "node:test";

import {
  SnapshotResolverError,
  SnapshotResolverRegistryV2,
  resolveResourceSnapshotV2
} from "../dist/core/snapshot-resolver.js";

function subjectFixture() {
  return {
    provider:
      "stripe",

    resource_type:
      "payment",

    resource_id:
      "pi_123",

    selector: {
      account:
        "acct_1"
    }
  };
}

function snapshotFixture() {
  return {
    snapshot_id:
      "payment-state-v7",

    subject:
      subjectFixture(),

    version:
      "state-v7",

    observed_at:
      "2026-11-01T20:30:00Z",

    metadata: {
      status:
        "succeeded"
    }
  };
}

function resolverFixture() {
  return {
    resolver_version:
      "2",

    resolver_id:
      "stripe.snapshot",

    provider:
      "stripe",

    supports(subject) {
      return (
        subject.resource_type ===
        "payment"
      );
    },

    async resolve() {
      return snapshotFixture();
    }
  };
}

function expectCode(
  promise,
  code
) {
  return assert.rejects(
    promise,
    (error) =>
      error instanceof
        SnapshotResolverError &&
      error.code === code
  );
}

test(
  "resolves a generic subject into a ResourceSnapshot",
  async () => {
    const snapshot =
      await resolveResourceSnapshotV2(
        resolverFixture(),
        subjectFixture()
      );

    assert.equal(
      snapshot.version,
      "state-v7"
    );

    assert.equal(
      snapshot.subject.provider,
      "stripe"
    );
  }
);

test(
  "passes the validated subject to the resolver",
  async () => {
    let received;

    const resolver = {
      ...resolverFixture(),

      supports(subject) {
        received =
          subject;

        return true;
      }
    };

    await resolveResourceSnapshotV2(
      resolver,
      subjectFixture()
    );

    assert.equal(
      received.resource_id,
      "pi_123"
    );

    assert.equal(
      received.selector.account,
      "acct_1"
    );
  }
);

test(
  "resolver cannot handle another provider",
  async () => {
    const subject = {
      ...subjectFixture(),

      provider:
        "salesforce"
    };

    await expectCode(
      resolveResourceSnapshotV2(
        resolverFixture(),
        subject
      ),
      "UNSUPPORTED_SUBJECT"
    );
  }
);

test(
  "resolver may reject an unsupported resource type",
  async () => {
    const subject = {
      ...subjectFixture(),

      resource_type:
        "customer"
    };

    await expectCode(
      resolveResourceSnapshotV2(
        resolverFixture(),
        subject
      ),
      "UNSUPPORTED_SUBJECT"
    );
  }
);

test(
  "resolver execution failure is fail-closed",
  async () => {
    const resolver = {
      ...resolverFixture(),

      async resolve() {
        throw new Error(
          "provider unavailable"
        );
      }
    };

    await expectCode(
      resolveResourceSnapshotV2(
        resolver,
        subjectFixture()
      ),
      "RESOLUTION_FAILED"
    );
  }
);

test(
  "malformed resolver output is rejected",
  async () => {
    const resolver = {
      ...resolverFixture(),

      async resolve() {
        return {
          subject:
            subjectFixture()
        };
      }
    };

    await expectCode(
      resolveResourceSnapshotV2(
        resolver,
        subjectFixture()
      ),
      "INVALID_SNAPSHOT"
    );
  }
);

test(
  "resolver cannot silently switch resource identity",
  async () => {
    const resolver = {
      ...resolverFixture(),

      async resolve() {
        const snapshot =
          snapshotFixture();

        snapshot.subject.resource_id =
          "pi_other";

        return snapshot;
      }
    };

    await expectCode(
      resolveResourceSnapshotV2(
        resolver,
        subjectFixture()
      ),
      "SUBJECT_MISMATCH"
    );
  }
);

test(
  "resolver cannot silently change subject selector",
  async () => {
    const resolver = {
      ...resolverFixture(),

      async resolve() {
        const snapshot =
          snapshotFixture();

        snapshot.subject.selector = {
          account:
            "acct_other"
        };

        return snapshot;
      }
    };

    await expectCode(
      resolveResourceSnapshotV2(
        resolver,
        subjectFixture()
      ),
      "SUBJECT_MISMATCH"
    );
  }
);

test(
  "registry routes subjects by provider",
  async () => {
    const registry =
      new SnapshotResolverRegistryV2();

    registry.register(
      resolverFixture()
    );

    const snapshot =
      await registry.resolve(
        subjectFixture()
      );

    assert.equal(
      snapshot.version,
      "state-v7"
    );
  }
);

test(
  "registry rejects duplicate provider resolvers",
  () => {
    const registry =
      new SnapshotResolverRegistryV2();

    registry.register(
      resolverFixture()
    );

    assert.throws(
      () =>
        registry.register(
          {
            ...resolverFixture(),

            resolver_id:
              "stripe.second"
          }
        ),
      (error) =>
        error instanceof
          SnapshotResolverError &&
        error.code ===
          "DUPLICATE_PROVIDER"
    );
  }
);

test(
  "registry fails closed when provider has no resolver",
  async () => {
    const registry =
      new SnapshotResolverRegistryV2();

    await expectCode(
      registry.resolve({
        provider:
          "google_drive",

        resource_type:
          "file",

        resource_id:
          "file-123"
      }),
      "RESOLVER_NOT_FOUND"
    );
  }
);
