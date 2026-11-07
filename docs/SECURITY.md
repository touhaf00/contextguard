# Security model

ContextGuard is designed so that a wrong, manipulated or overconfident AI answer cannot, by itself, change a repository.

## What is enforced

**Separation of duties**

- The agent that proposes cannot approve. The agent that verifies is independent from the one that proposed.
- The executor is deterministic server code. It holds the only write path and accepts nothing from the browser except the identifier of a server-owned proposal.

**Fail closed**

- The Guard answers `PASS`, `REVIEW` or `FAIL`. Only `PASS` can lead to an approval request. A `REVIEW` is never converted to a pass, and a `REVIEW` needs at least one finding above `LOW`.
- An agent reply that is not valid structured output gets one neutral format repair. If it still fails, the run stops with nothing authorized.
- Missing or contradictory evidence ends in `UNKNOWN`/`REVIEW`, not in an approval.

**Exact action, not a description**

- An ActionLock binds the action, repository, target and observed state. Approval, preflight and the single-use receipt all refer to that lock.
- For existing issues the server locks a fingerprint of the issue (title, body, labels, state, update time, comments). The browser cannot supply it.
- For code fixes the server computes the diff and the file hashes (see [ARCHITECTURE.md](ARCHITECTURE.md)). What you approve is what is committed.

**Recheck before acting**

- A fresh read of GitHub happens after your approval. If anything drifted, nothing is written.
- Receipts are single-use and tied to the session that obtained them.

**Credentials**

- GitHub tokens, the Cominty key and the GitHub App secret never reach the browser.
- GitHub App sign-in uses a random `state` bound to a short-lived HttpOnly cookie and PKCE (S256). Browser sessions are opaque, HttpOnly, `SameSite=Strict` cookies. Browser POSTs are origin-checked.
- User tokens are kept in server memory only and are not written to disk.
- Writes are disabled unless `CONTEXTGUARD_UI_REAL_EXECUTION_ENABLED=true`.

**Bounded blast radius**

- Maintenance actions are limited to: create issue, comment, add labels, edit, close, reopen. Code fixes only produce a Draft pull request.
- There is no merge, no force-push, no workflow or settings change.
- A per-user and global budget caps Cominty usage.

**Network exposure**

- The UI listens on `127.0.0.1` only. `CONTEXTGUARD_UI_HOST` changes the listen address. Any address other than `127.0.0.1` or `::1` makes the server print a warning: put HTTPS and authentication in front of it first.
- A request is answered only if its `Host` header is on the allowlist: `localhost`, `127.0.0.1` and `[::1]` (with or without the port), the host of the GitHub App callback URL, and the names listed in `CONTEXTGUARD_ALLOWED_HOSTS` (comma-separated). Any other host gets `403`. This blocks DNS rebinding, and a tunnel's public name works only if you list it.
- A `POST`, `PUT`, `PATCH` or `DELETE` that carries an `Origin` header from another site gets `403`.
- The automatic local session is issued only to a direct loopback connection. A request with a forwarding header (`Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host`, `X-Real-IP` or `CF-Connecting-IP`) gets none, even when it reaches the server from loopback through a proxy.
- Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer` and a `Content-Security-Policy` that restricts framing, plugins and `base` URLs. The policy does not restrict scripts yet, so the interface must keep escaping any text it inserts as HTML.

**Bounded waits**

- Every GitHub and OAuth request has a timeout: 20 seconds for API calls and 60 seconds for log downloads. Cominty requests use the SDK's own 60-second timeout.
- Writes are never retried automatically. A timed-out or unclear write is reported with an instruction to check GitHub before retrying.
- At most one investigation runs per browser session at a time, and at most two run on the server at once. Other requests get `429` until a slot is free.

## What is not guaranteed

- **The Guard is a language model.** It can be wrong in either direction. ContextGuard reduces that risk with independent verification, server-computed evidence and a human decision; it does not remove it. Read the diff.
- **Agent tool usage is self-reported.** The interface shows what the agents say they checked. It is not a signed execution trace.
- **Final recheck is not atomic.** Between the last read and the GitHub write, a concurrent edit is theoretically possible.
- **Single process, in-memory state.** A restart signs users out and clears proposals and budgets. Public deployment would need persistent session storage, token encryption, rate limiting at the proxy and audit retention.
- **The host rules protect the local interface only.** They are not a substitute for a reverse proxy with TLS, authentication and rate limiting when the UI is reachable from other machines.
- **GitHub content is data.** Issues, comments and files can contain instructions aimed at the agent. They are treated as untrusted input, but no filter is perfect.

## Reporting a vulnerability

Please open a private security advisory on the repository rather than a public issue.
