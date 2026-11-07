import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveResourceSnapshotV2
} from "../dist/core/snapshot-resolver.js";

import {
  createGitHubSnapshotResolverV2
} from "../dist/adapters/github/snapshot-resolver.js";

const COMMIT_A =
  "a".repeat(40);

const COMMIT_B =
  "b".repeat(40);

const TAG_A =
  "c".repeat(40);

const TAG_B =
  "d".repeat(40);

function subject(
  kind,
  ref
) {
  return {
    provider:
      "github",

    resource_type:
      "repository_ref",

    resource_id:
      "touhaf00/tp-cicd",

    selector: {
      kind,

      ...(ref !== undefined
        ? { ref }
        : {})
    }
  };
}

function clientFixture() {
  return {
    async getRepository() {
      return {
        default_branch:
          "main"
      };
    },

    async getCommit(
      repository,
      reference
    ) {
      if (
        repository !==
          "touhaf00/tp-cicd"
      ) {
        throw new Error(
          "unexpected repository"
        );
      }

      if (
        reference ===
          COMMIT_A
      ) {
        return {
          sha: COMMIT_A
        };
      }

      if (
        reference ===
          "main"
      ) {
        return {
          sha: COMMIT_B
        };
      }

      throw new Error(
        "unexpected commit reference"
      );
    },

    async getRef(
      repository,
      namespace,
      reference
    ) {
      if (
        repository !==
          "touhaf00/tp-cicd"
      ) {
        throw new Error(
          "unexpected repository"
        );
      }

      if (
        namespace ===
          "heads" &&
        reference ===
          "develop"
      ) {
        return {
          object: {
            type:
              "commit",

            sha:
              COMMIT_B
          }
        };
      }

      if (
        namespace ===
          "tags" &&
        reference ===
          "v1.0.0"
      ) {
        return {
          object: {
            type:
              "commit",

            sha:
              COMMIT_A
          }
        };
      }

      if (
        namespace ===
          "tags" &&
        reference ===
          "v2.0.0"
      ) {
        return {
          object: {
            type:
              "tag",

            sha:
              TAG_A
          }
        };
      }

      if (
        namespace ===
          "tags" &&
        reference ===
          "nested"
      ) {
        return {
          object: {
            type:
              "tag",

            sha:
              TAG_A
          }
        };
      }

      throw new Error(
        "unexpected ref"
      );
    },

    async getGitTag(
      repository,
      tagSha
    ) {
      if (
        repository !==
          "touhaf00/tp-cicd"
      ) {
        throw new Error(
          "unexpected repository"
        );
      }

      if (
        tagSha ===
          TAG_A
      ) {
        return {
          object: {
            type:
              "commit",

            sha:
              COMMIT_B
          }
        };
      }

      throw new Error(
        "unexpected tag object"
      );
    }
  };
}

function resolver(
  client =
    clientFixture()
) {
  return createGitHubSnapshotResolverV2(
    client,
    {
      now: () =>
        new Date(
          "2026-11-01T20:40:00Z"
        )
    }
  );
}

test(
  "supports only GitHub repository_ref subjects",
  () => {
    const value =
      resolver();

    assert.equal(
      value.supports(
        subject(
          "commit",
          COMMIT_A
        )
      ),
      true
    );

    assert.equal(
      value.supports({
        provider: "github",
        resource_type: "issue",
        resource_id: "1"
      }),
      false
    );

    assert.equal(
      value.supports({
        provider: "stripe",
        resource_type:
          "repository_ref",
        resource_id:
          "touhaf00/tp-cicd"
      }),
      false
    );
  }
);

test(
  "resolves an exact GitHub commit into generic snapshot version",
  async () => {
    const snapshot =
      await resolveResourceSnapshotV2(
        resolver(),
        subject(
          "commit",
          COMMIT_A
        )
      );

    assert.equal(
      snapshot.version,
      COMMIT_A
    );

    assert.equal(
      snapshot.integrity_hash,
      undefined
    );
  }
);

test(
  "exact commit resolution cannot silently move to another commit",
  async () => {
    const client = {
      ...clientFixture(),

      async getCommit() {
        return {
          sha: COMMIT_B
        };
      }
    };

    await assert.rejects(
      resolveResourceSnapshotV2(
        resolver(client),
        subject(
          "commit",
          COMMIT_A
        )
      ),
      /different commit/
    );
  }
);

test(
  "resolves a branch head to its exact commit",
  async () => {
    const snapshot =
      await resolveResourceSnapshotV2(
        resolver(),
        subject(
          "branch",
          "develop"
        )
      );

    assert.equal(
      snapshot.version,
      COMMIT_B
    );

    assert.equal(
      snapshot.metadata
        .selector_kind,
      "branch"
    );
  }
);

test(
  "branch must resolve directly to a commit",
  async () => {
    const client = {
      ...clientFixture(),

      async getRef() {
        return {
          object: {
            type:
              "tag",

            sha:
              TAG_A
          }
        };
      }
    };

    await assert.rejects(
      resolveResourceSnapshotV2(
        resolver(client),
        subject(
          "branch",
          "develop"
        )
      ),
      /branch ref must resolve directly to a commit/
    );
  }
);

test(
  "resolves a lightweight tag directly to a commit",
  async () => {
    const snapshot =
      await resolveResourceSnapshotV2(
        resolver(),
        subject(
          "tag",
          "v1.0.0"
        )
      );

    assert.equal(
      snapshot.version,
      COMMIT_A
    );
  }
);

test(
  "dereferences an annotated tag to its commit",
  async () => {
    const snapshot =
      await resolveResourceSnapshotV2(
        resolver(),
        subject(
          "tag",
          "v2.0.0"
        )
      );

    assert.equal(
      snapshot.version,
      COMMIT_B
    );
  }
);

test(
  "dereferences nested annotated tags",
  async () => {
    const client = {
      ...clientFixture(),

      async getGitTag(
        repository,
        tagSha
      ) {
        if (
          tagSha ===
            TAG_A
        ) {
          return {
            object: {
              type:
                "tag",

              sha:
                TAG_B
            }
          };
        }

        if (
          tagSha ===
            TAG_B
        ) {
          return {
            object: {
              type:
                "commit",

              sha:
                COMMIT_A
            }
          };
        }

        throw new Error(
          "unexpected tag"
        );
      }
    };

    const snapshot =
      await resolveResourceSnapshotV2(
        resolver(client),
        subject(
          "tag",
          "nested"
        )
      );

    assert.equal(
      snapshot.version,
      COMMIT_A
    );
  }
);

test(
  "annotated tag cycles fail closed",
  async () => {
    const client = {
      ...clientFixture(),

      async getGitTag(
        repository,
        tagSha
      ) {
        return {
          object: {
            type:
              "tag",

            sha:
              tagSha
          }
        };
      }
    };

    await assert.rejects(
      resolveResourceSnapshotV2(
        resolver(client),
        subject(
          "tag",
          "v2.0.0"
        )
      ),
      /cycle/
    );
  }
);

test(
  "current_state resolves the repository default branch",
  async () => {
    const snapshot =
      await resolveResourceSnapshotV2(
        resolver(),
        subject(
          "current_state"
        )
      );

    assert.equal(
      snapshot.version,
      COMMIT_B
    );

    assert.equal(
      snapshot.metadata
        .default_branch,
      "main"
    );

    assert.equal(
      snapshot.metadata
        .resolved_ref,
      "main"
    );
  }
);

test(
  "resolved snapshot preserves exact subject selector",
  async () => {
    const requested =
      subject(
        "tag",
        "v1.0.0"
      );

    const snapshot =
      await resolveResourceSnapshotV2(
        resolver(),
        requested
      );

    assert.deepEqual(
      snapshot.subject,
      requested
    );

    assert.equal(
      snapshot.metadata
        .requested_ref,
      "v1.0.0"
    );
  }
);

test(
  "invalid repository identity fails closed",
  async () => {
    await assert.rejects(
      resolveResourceSnapshotV2(
        resolver(),
        {
          provider: "github",
          resource_type:
            "repository_ref",
          resource_id:
            "not-a-repository",

          selector: {
            kind: "branch",
            ref: "main"
          }
        }
      ),
      /owner\/repository/
    );
  }
);

test(
  "branch selector requires a reference",
  async () => {
    await assert.rejects(
      resolveResourceSnapshotV2(
        resolver(),
        subject(
          "branch"
        )
      ),
      /non-empty Git reference/
    );
  }
);

test(
  "current_state forbids caller supplied ref",
  async () => {
    await assert.rejects(
      resolveResourceSnapshotV2(
        resolver(),
        subject(
          "current_state",
          "main"
        )
      ),
      /must not contain ref/
    );
  }
);

test(
  "malformed GitHub commit SHA fails closed",
  async () => {
    const client = {
      ...clientFixture(),

      async getRef() {
        return {
          object: {
            type:
              "commit",

            sha:
              "abc123"
          }
        };
      }
    };

    await assert.rejects(
      resolveResourceSnapshotV2(
        resolver(client),
        subject(
          "branch",
          "develop"
        )
      ),
      /full 40-character Git SHA/
    );
  }
);
