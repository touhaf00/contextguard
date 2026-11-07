import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";
import type { AgentIssueDraft } from "./agent-issue-draft.js";

export type AgentIssueDraftLookup =
  | { status: "found"; draft: AgentIssueDraft }
  | { status: "expired" }
  | { status: "unknown" };

export interface AgentIssueDraftStoreOptions {
  filePath?: string;
  now?: () => number;
}

interface StoredItem {
  draft: AgentIssueDraft;
  expiresAt: number;
}

interface PersistedItem extends StoredItem {
  digest: string;
}

const FILE_VERSION = 1;

function digestOf(draft: unknown, expiresAt: number): string {
  return createHash("sha256")
    .update(JSON.stringify([draft, expiresAt]))
    .digest("hex");
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function looksLikeDraft(value: unknown): value is AgentIssueDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  const issue = draft.issue as Record<string, unknown> | undefined;
  return (
    isText(draft.draft_id) &&
    isText(draft.repository) &&
    isText(draft.branch) &&
    isText(draft.investigated_sha) &&
    typeof issue === "object" &&
    issue !== null &&
    isText(issue.title) &&
    isText(issue.body)
  );
}

export class AgentIssueDraftStore {
  private readonly values = new Map<string, StoredItem>();
  private readonly gone = new Map<string, number>();
  private readonly filePath: string | undefined;
  private readonly now: () => number;
  private persistWarned = false;

  constructor(
    private readonly maxItems = 100,
    private readonly ttlMs = 15 * 60 * 1000,
    options: AgentIssueDraftStoreOptions = {}
  ) {
    this.filePath = options.filePath;
    this.now = options.now ?? Date.now;
    this.loadFromDisk();
  }

  put(draft: AgentIssueDraft): void {
    const now = this.now();
    this.dropExpired(now);
    while (this.values.size >= this.maxItems) {
      const oldest = this.values.keys().next().value;
      if (!oldest) break;
      this.forget(oldest, now);
    }
    this.values.set(draft.draft_id, {
      draft: structuredClone(draft),
      expiresAt: now + this.ttlMs
    });
    this.persist();
  }

  get(id: string): AgentIssueDraft | undefined {
    const result = this.lookup(id);
    return result.status === "found" ? result.draft : undefined;
  }

  lookup(id: string): AgentIssueDraftLookup {
    const value = this.values.get(id);
    if (!value) {
      return this.gone.has(id)
        ? { status: "expired" }
        : { status: "unknown" };
    }
    const now = this.now();
    if (value.expiresAt <= now) {
      this.forget(id, now);
      this.persist();
      return { status: "expired" };
    }
    return { status: "found", draft: structuredClone(value.draft) };
  }

  private dropExpired(now: number): void {
    let removed = false;
    for (const [id, item] of this.values) {
      if (item.expiresAt <= now) {
        this.forget(id, now);
        removed = true;
      }
    }
    if (removed) this.persist();
  }

  private forget(id: string, now: number): void {
    this.values.delete(id);
    this.gone.set(id, now);
    while (this.gone.size > this.maxItems * 2) {
      const oldest = this.gone.keys().next().value;
      if (!oldest) break;
      this.gone.delete(oldest);
    }
  }

  private loadFromDisk(): void {
    const path = this.filePath;
    if (!path || !existsSync(path)) return;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as { version?: unknown }).version !== FILE_VERSION ||
        !Array.isArray((parsed as { items?: unknown }).items)
      ) {
        return;
      }
      const now = this.now();
      for (const raw of (parsed as { items: unknown[] }).items) {
        const item = raw as Partial<PersistedItem> | null;
        if (
          !item ||
          !looksLikeDraft(item.draft) ||
          typeof item.expiresAt !== "number" ||
          !Number.isFinite(item.expiresAt) ||
          item.digest !== digestOf(item.draft, item.expiresAt)
        ) {
          continue;
        }
        if (item.expiresAt <= now) {
          this.gone.set(item.draft.draft_id, now);
          continue;
        }
        if (this.values.size < this.maxItems) {
          this.values.set(item.draft.draft_id, {
            draft: item.draft,
            expiresAt: item.expiresAt
          });
        }
      }
    } catch {
    }
  }

  private persist(): void {
    const path = this.filePath;
    if (!path) return;
    try {
      const items: PersistedItem[] = [...this.values.values()].map(item => ({
        draft: item.draft,
        expiresAt: item.expiresAt,
        digest: digestOf(item.draft, item.expiresAt)
      }));
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const temporary = `${path}.${process.pid}.tmp`;
      writeFileSync(
        temporary,
        JSON.stringify({ version: FILE_VERSION, items }),
        { mode: 0o600 }
      );
      chmodSync(temporary, 0o600);
      renameSync(temporary, path);
    } catch {
      if (!this.persistWarned) {
        this.persistWarned = true;
        console.warn(
          "[contextguard] Agent drafts could not be saved to disk; they remain in memory only."
        );
      }
    }
  }
}
