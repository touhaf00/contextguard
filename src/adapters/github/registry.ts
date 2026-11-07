import {
  SnapshotResolverRegistryV2
} from "../../core/snapshot-resolver.js";

import {
  createGitHubSnapshotResolverV2
} from "./snapshot-resolver.js";

import type {
  GitHubSnapshotClientV2,
  GitHubSnapshotResolverOptionsV2
} from "./snapshot-resolver.js";

export function createGitHubSnapshotResolverRegistryV2(
  client:
    GitHubSnapshotClientV2,

  options:
    GitHubSnapshotResolverOptionsV2 = {}
): SnapshotResolverRegistryV2 {
  const registry =
    new SnapshotResolverRegistryV2();

  registry.register(
    createGitHubSnapshotResolverV2(
      client,
      options
    )
  );

  return registry;
}
