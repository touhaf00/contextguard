import type {
  JsonObject,
  ResourceSnapshot,
  SubjectRef
} from "../../core/contracts.js";

import type {
  SnapshotResolverV2
} from "../../core/snapshot-resolver.js";

const FULL_GIT_SHA =
  /^[0-9a-f]{40}$/i;

const GITHUB_REPOSITORY =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const GITHUB_SELECTOR_KINDS = [
  "commit",
  "branch",
  "tag",
  "current_state"
] as const;

export type GitHubSelectorKindV2 =
  (
    typeof GITHUB_SELECTOR_KINDS
  )[number];

export interface GitHubSnapshotClientV2 {
  getRepository(
    repository: string
  ): Promise<unknown>;

  getCommit(
    repository: string,
    reference: string
  ): Promise<unknown>;

  getRef(
    repository: string,
    namespace:
      "heads" |
      "tags",
    reference: string
  ): Promise<unknown>;

  getGitTag(
    repository: string,
    tagSha: string
  ): Promise<unknown>;

  getBranch?(
    repository: string,
    reference: string
  ): Promise<unknown>;
}

export interface GitHubSnapshotResolverOptionsV2 {
  resolverId?: string;

  now?: () => Date;

  maxTagDepth?: number;
}

interface GitHubSelectionV2 {
  repository: string;

  kind:
    GitHubSelectorKindV2;

  reference?: string;
}

interface GitObjectV2 {
  type:
    "commit" |
    "tag";

  sha: string;
}

function asObject(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

function requiredString(
  object:
    Record<string, unknown>,
  key: string,
  label: string
): string {
  const value =
    object[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label}.${key} must be a non-empty string.`
    );
  }

  return value.trim();
}

function fullGitSha(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !FULL_GIT_SHA.test(
      value.trim()
    )
  ) {
    throw new Error(
      `${label} must be a full 40-character Git SHA.`
    );
  }

  return value
    .trim()
    .toLowerCase();
}

function validateGitReference(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label} must be a non-empty Git reference.`
    );
  }

  const ref =
    value.trim();

  if (
    ref.length > 256 ||
    /[\x00-\x20\x7f~^:?*\[\]\\]/.test(
      ref
    ) ||
    ref.startsWith("/") ||
    ref.endsWith("/") ||
    ref.endsWith(".") ||
    ref.includes("..") ||
    ref.includes("@{") ||
    ref.includes("//") ||
    ref.endsWith(".lock")
  ) {
    throw new Error(
      `${label} is not a valid Git reference.`
    );
  }

  return ref;
}

function parseSelection(
  subject:
    SubjectRef
): GitHubSelectionV2 {
  if (
    subject.provider !==
      "github" ||
    subject.resource_type !==
      "repository_ref"
  ) {
    throw new Error(
      "GitHubSnapshotResolverV2 supports only github/repository_ref subjects."
    );
  }

  const repository =
    subject.resource_id
      .trim();

  if (
    !GITHUB_REPOSITORY.test(
      repository
    )
  ) {
    throw new Error(
      "GitHub repository resource_id must use owner/repository format."
    );
  }

  const selector =
    asObject(
      subject.selector,
      "GitHub subject selector"
    );

  const kindValue =
    requiredString(
      selector,
      "kind",
      "GitHub subject selector"
    );

  if (
    !GITHUB_SELECTOR_KINDS.includes(
      kindValue as
        GitHubSelectorKindV2
    )
  ) {
    throw new Error(
      "GitHub subject selector.kind must be commit, branch, tag or current_state."
    );
  }

  const kind =
    kindValue as
      GitHubSelectorKindV2;

  if (
    kind ===
      "current_state"
  ) {
    if (
      selector.ref !==
        undefined
    ) {
      throw new Error(
        "GitHub current_state selector must not contain ref."
      );
    }

    return {
      repository,
      kind
    };
  }

  if (
    kind ===
      "commit"
  ) {
    return {
      repository,
      kind,

      reference:
        fullGitSha(
          selector.ref,
          "GitHub commit selector.ref"
        )
    };
  }

  return {
    repository,
    kind,

    reference:
      validateGitReference(
        selector.ref,
        `GitHub ${kind} selector.ref`
      )
  };
}

function parseCommit(
  value: unknown,
  label: string
): string {
  const object =
    asObject(
      value,
      label
    );

  return fullGitSha(
    object.sha,
    `${label}.sha`
  );
}

function parseGitObject(
  value: unknown,
  label: string
): GitObjectV2 {
  const outer =
    asObject(
      value,
      label
    );

  const object =
    asObject(
      outer.object,
      `${label}.object`
    );

  const type =
    requiredString(
      object,
      "type",
      `${label}.object`
    );

  if (
    type !== "commit" &&
    type !== "tag"
  ) {
    throw new Error(
      `${label}.object.type must be commit or tag.`
    );
  }

  return {
    type,

    sha:
      fullGitSha(
        object.sha,
        `${label}.object.sha`
      )
  };
}

export async function getConsistentGitHubBranchHeadV2(
  client: Pick<GitHubSnapshotClientV2, "getRef" | "getBranch">,
  repository: string,
  reference: string
): Promise<string> {
  const [refResult, branchResult] = await Promise.all([
    client.getRef(repository, "heads", reference),
    typeof client.getBranch === "function"
      ? client.getBranch(repository, reference)
      : Promise.resolve(undefined)
  ]);
  const target = parseGitObject(refResult, "GitHub branch ref");
  if (target.type !== "commit") {
    throw new Error(
      "GitHub branch ref must resolve directly to a commit."
    );
  }

  if (branchResult !== undefined) {
    const branch = asObject(branchResult, "GitHub branch endpoint");
    if (branch.name !== reference) {
      throw new Error("GITHUB_PROVIDER_INCONSISTENT: branch name mismatch.");
    }
    const commit = asObject(branch.commit, "GitHub branch endpoint.commit");
    const branchSha = fullGitSha(
      commit.sha,
      "GitHub branch endpoint.commit.sha"
    );
    if (branchSha !== target.sha) {
      throw new Error(
        "GITHUB_PROVIDER_INCONSISTENT: GitHub branch endpoints " +
        "disagree on the current SHA. Authorization refused."
      );
    }
  }
  return target.sha;
}

async function resolveAnnotatedTag(
  client:
    GitHubSnapshotClientV2,

  repository: string,
  initial:
    GitObjectV2,

  maxDepth: number
): Promise<string> {
  let current =
    initial;

  const seen =
    new Set<string>();

  for (
    let depth = 0;
    depth <= maxDepth;
    depth += 1
  ) {
    if (
      current.type ===
        "commit"
    ) {
      return current.sha;
    }

    if (
      seen.has(
        current.sha
      )
    ) {
      throw new Error(
        "GitHub annotated tag resolution contains a cycle."
      );
    }

    seen.add(
      current.sha
    );

    if (
      depth ===
        maxDepth
    ) {
      throw new Error(
        "GitHub annotated tag resolution exceeded maximum depth."
      );
    }

    current =
      parseGitObject(
        await client.getGitTag(
          repository,
          current.sha
        ),
        "GitHub tag object"
      );
  }

  throw new Error(
    "GitHub tag could not be resolved to a commit."
  );
}

export function createGitHubSnapshotResolverV2(
  client:
    GitHubSnapshotClientV2,

  options:
    GitHubSnapshotResolverOptionsV2 = {}
): SnapshotResolverV2 {
  const resolverId =
    options.resolverId ??
      "github.snapshot";

  const now =
    options.now ??
      (() => new Date());

  const maxTagDepth =
    options.maxTagDepth ??
      5;

  if (
    !Number.isInteger(
      maxTagDepth
    ) ||
    maxTagDepth < 1 ||
    maxTagDepth > 20
  ) {
    throw new Error(
      "GitHubSnapshotResolverV2 maxTagDepth must be an integer between 1 and 20."
    );
  }

  return {
    resolver_version:
      "2",

    resolver_id:
      resolverId,

    provider:
      "github",

    supports(
      subject
    ) {
      return (
        subject.provider ===
          "github" &&
        subject.resource_type ===
          "repository_ref"
      );
    },

    async resolve(
      subject
    ): Promise<ResourceSnapshot> {
      const selection =
        parseSelection(
          subject
        );

      let version:
        string;

      let resolvedRef:
        string;

      let defaultBranch:
        string | undefined;

      switch (
        selection.kind
      ) {
        case "commit": {
          const requestedSha =
            selection.reference as
              string;

          const resolvedSha =
            parseCommit(
              await client.getCommit(
                selection.repository,
                requestedSha
              ),
              "GitHub commit"
            );

          if (
            resolvedSha !==
              requestedSha
                .toLowerCase()
          ) {
            throw new Error(
              "GitHub returned a different commit than the exact requested commit."
            );
          }

          version =
            resolvedSha;

          resolvedRef =
            requestedSha;

          break;
        }

        case "branch": {
          const reference =
            selection.reference as
              string;

          version =
            await getConsistentGitHubBranchHeadV2(
              client,
              selection.repository,
              reference
            );

          resolvedRef =
            reference;

          break;
        }

        case "tag": {
          const reference =
            selection.reference as
              string;

          const target =
            parseGitObject(
              await client.getRef(
                selection.repository,
                "tags",
                reference
              ),
              "GitHub tag ref"
            );

          version =
            await resolveAnnotatedTag(
              client,
              selection.repository,
              target,
              maxTagDepth
            );

          resolvedRef =
            reference;

          break;
        }

        case "current_state": {
          const repositoryInfo =
            asObject(
              await client.getRepository(
                selection.repository
              ),
              "GitHub repository"
            );

          defaultBranch =
            validateGitReference(
              repositoryInfo
                .default_branch,
              "GitHub repository.default_branch"
            );

          version =
            parseCommit(
              await client.getCommit(
                selection.repository,
                defaultBranch
              ),
              "GitHub default branch commit"
            );

          if (typeof client.getBranch === "function") {
            const corroborated =
              await getConsistentGitHubBranchHeadV2(
                client,
                selection.repository,
                defaultBranch
              );
            if (corroborated !== version) {
              throw new Error(
                "GITHUB_PROVIDER_INCONSISTENT: default branch " +
                "commit and reference disagree."
              );
            }
          }

          resolvedRef =
            defaultBranch;

          break;
        }
      }

      const metadata:
        JsonObject = {
        repository:
          selection.repository,

        selector_kind:
          selection.kind,

        resolved_ref:
          resolvedRef,

        object_type:
          "commit",

        ...(selection.reference
          ? {
              requested_ref:
                selection.reference
            }
          : {}),

        ...(defaultBranch
          ? {
              default_branch:
                defaultBranch
            }
          : {})
      };

      return {
        snapshot_id:
          `github:${selection.repository}@${version}`,

        subject,

        version,

        observed_at:
          now().toISOString(),

        metadata
      };
    }
  };
}
