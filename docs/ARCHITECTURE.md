# Architecture

ContextGuard separates **who proposes**, **who verifies**, **who approves** and **who acts**. No single component can do two of those jobs.

```
 Browser ──► Assistant ──► Worker (Cominty) ──► Guard (Cominty, independent)
                                                   │ PASS            │ REVIEW / FAIL
                                                   ▼                 ▼
                                             ActionLock          stop, nothing issued
                                                   │
                                          human approval (you)
                                                   │
                                          fresh preflight (GitHub re-read)
                                                   │
                                        single-use receipt + typed EXECUTE
                                                   │
                                     trusted executor (deterministic code)
                                                   ▼
                                                GitHub
```

## The six steps

1. **Propose.** The assistant reads real GitHub evidence (commits, workflow runs and job logs, issues, files) and asks a Cominty Worker for one action. The result is a proposal only: this step has no GitHub write path.
2. **Verify.** The Worker re-examines the exact proposal against the current repository state and classifies each factual claim (`SUPPORTED`, `UNKNOWN`, …). The Guard, a separate agent, then checks the Worker's conclusion and returns `PASS`, `REVIEW` or `FAIL`. Server code validates both answers; an answer that breaks an invariant is rejected, not repaired. Facts about CI are checked the same way: when a proposal cites a workflow run, the server reads that run, its jobs and steps, and a few test-runner lines of the failed job log (assertions, tracebacks, summaries) for the Worker and again for the Guard. A CI statement those reads do not contain stays `UNKNOWN`, so the Guard answers `REVIEW`. Files are checked the same way: for an action on an existing issue, the server reads the repository files that the issue or the proposed text names, at the locked commit and Git-blob verified, and for a code fix it shows the exact text the diff applies to and the test file of each changed file, so that a report such as "the docstring was added" is checked against the file itself. Every message to Cominty also fits its 30 000-character limit, whatever the repository: the JSON is compacted first, then the CI evidence switches to a compact rendering of the same observations (every kept log line and every step, none sliced), and only as a last resort are evidence blocks cut, each with a note that the omitted part is **not observed**. Instructions, the output contract and the claim checklist are never cut. Shortening can turn a `PASS` into a `REVIEW`, never the reverse; when nothing can fit, the run stops with a clear message and nothing is written.
3. **Review.** Only a `PASS` reaches a human. `REVIEW` and `FAIL` end the run with the findings shown; they are never upgraded.
4. **Approve.** The server issues an **ActionLock** that binds the exact action, repository, target and observed state. You approve that lock, not a description of it.
5. **Recheck.** A preflight reads GitHub again. Any drift (branch head, issue content, labels, state, file hashes) cancels the run.
6. **Act.** A single-use receipt is issued. After you type `EXECUTE`, the trusted executor performs exactly the locked action and the receipt is consumed. Immediately before writing, it reads the branch head again and, for a new issue, the open issues: a moved branch or an open issue with the same title stops the write, and nothing is written.

## Components

| Component | Where | Role |
| --- | --- | --- |
| Worker / Guard adapters | `src/agents/` | Prompts, structured output, one bounded format repair |
| Verification rules | `src/core/verification.ts` | Invariants a Guard answer must satisfy |
| ActionLock, preflight, receipts | `src/core/`, `src/api/v2/` | Request-bound authorization lifecycle |
| GitHub adapter | `src/adapters/github/` | Snapshots, REST client, trusted executor |
| Assistant, sessions, GitHub App | `src/api/ui/` | Web backend |
| Web interface | `public/` | Single-page UI and Security Playground |

## Code fixes

A code fix is the most delicate action, so the model has the least power over it.

- The model proposes **edits** (`path`, exact `old_text`, `new_text`). It does not write the diff, the file or any hash.
- The server applies the edits to the freshly observed file, builds the unified diff you read, and seals `before_sha256`, `after_sha256` and a `plan_digest`. A plan whose diff does not reproduce its hashes is rejected before any agent sees it.
- The Worker and the Guard receive a **server-computed after-state**: does the diff apply exactly to the observed original, does the result hash to the sealed value, and is the content to be committed identical to it. A language model cannot recompute a SHA-256, so the server does it and reports the result as evidence.
- Allowed files are small source and documentation files. Hidden files and directories at any depth, dependency and build folders, lock files and paths containing `secret` or `credential` are refused. Content that looks like a credential is never sent to an agent.
- At execution the commit is written through the Git Data API on a new branch and opened as a **Draft** pull request. It is never merged.

## Sessions and access

- **GitHub App mode:** each user signs in through GitHub (OAuth with PKCE). The user's token stays in server memory; the browser only holds an opaque HttpOnly session cookie. Every read and write is limited to repositories covered by both the App installation and the user's own rights.
- **Local mode:** an automatic session accepted from the loopback interface only, with writes disabled by default.
- **Machine API (`/api/v2/*`):** separate runtime, approval and executor secrets for integrating another system. It answers 503 until those secrets are configured.

## Naming

Identifiers ending in `V2` belong to the second version of the authorization protocol (`src/core`, `src/api/v2`). They are API versions, not application versions.
