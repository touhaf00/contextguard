# ContextGuard

> Verify the context before you trust the action.

ContextGuard is an evidence-verification and safety layer for AI agents.

Instead of allowing an agent to act directly from its own assessment, ContextGuard introduces an independent verification step and a deterministic policy before any external action can proceed.

The current demo focuses on software release readiness using GitHub repository evidence.

## Why ContextGuard?

AI agents can retrieve valid information and still draw the wrong conclusion.

A successful workflow, for example, does not necessarily prove that the real action suggested by its name happened.

A job called `deploy` may finish successfully while performing no actual deployment.

ContextGuard separates:

- what is configured;
- what was executed;
- whether execution succeeded;
- whether the intended semantic effect actually happened.

This helps prevent an agent from turning incomplete context into an unsafe action.

## Architecture

```text
Repository + Target + Mission
            |
            v
     Release Readiness Worker
            |
            | structured evidence report
            v
        ContextGuard
     independent verifier
            |
       +----+----+
       |    |    |
      PASS REVIEW FAIL
       |    |    |
       |    |    +--> block
       |    |
       |    +--> targeted retry
       |         max 2
       |
       v
 Deterministic Safety Gate
       |
       +--> READY + PASS
       |    human approval required
       |
       +--> NOT_READY + PASS
       |    blocked
       |
       +--> UNKNOWN + PASS
       |    stopped safely
       |
       +--> unresolved REVIEW
            stopped safely
```

The Worker and ContextGuard have different responsibilities.

### Release Readiness Worker

The Worker investigates the requested repository and produces one business decision:

- `READY`
- `NOT_READY`
- `UNKNOWN`

Decision-critical claims must be supported by repository evidence.

The Worker operates in read-only mode.

### ContextGuard

ContextGuard independently evaluates the Worker's report.

It returns one verification verdict:

- `PASS`
- `REVIEW`
- `FAIL`

A `PASS` does **not** mean that the repository is ready.

It means that the Worker's conclusion is sufficiently supported.

For example:

```text
Worker: NOT_READY
Guard: PASS
```

means that ContextGuard independently verified that the repository is correctly assessed as not ready.

## Deterministic policy

The final action gate belongs to application code, not to the LLM.

| Worker | Guard | Result |
|---|---|---|
| READY | PASS | `AWAITING_HUMAN_APPROVAL` |
| NOT_READY | PASS | `BLOCKED_NOT_READY` |
| UNKNOWN | PASS | `STOPPED_UNKNOWN` |
| any | REVIEW | targeted retry, then `STOPPED_REVIEW` if unresolved |
| any | FAIL | `BLOCKED_VERIFICATION` |

ContextGuard allows at most two targeted retries.

A retry only occurs when:

- the Guard returns `REVIEW`;
- the Guard recommends another retry;
- precise requested checks are available;
- those checks have not already been attempted;
- the retry limit has not been reached.

Uncertainty is preserved rather than forced into a binary decision.

## Semantic verification example

The demo repository contains a CI/CD workflow with a job named `deploy`.

The workflow job can report:

```text
Job status: SUCCESS
```

while its implementation does not perform a real deployment.

ContextGuard therefore distinguishes:

```text
Job status:        SUCCESS
Actual deployment: NOT VERIFIED
```

This is the core idea behind ContextGuard:

**successful execution is not automatically proof of the intended effect.**

## Safety

The current implementation follows several safety rules:

- repository investigation is read-only;
- agents cannot directly trigger the final action;
- `allowed_to_act` from the Guard is advisory only;
- the orchestration layer owns the real policy;
- unresolved uncertainty stops the workflow;
- duplicate retry requests are not repeated;
- external actions are never executed automatically;
- human approval is required after `READY + PASS`.

The current Human Approval button records approval locally for demonstration purposes. It does not write to GitHub.

## Demo mode

The interface includes local scenarios that can be tested without calling Cominty:

- `REVIEW after retry`
- `READY + PASS`
- `NOT_READY + PASS`
- `UNKNOWN + PASS`
- `Verification FAIL`

Demo mode does not consume Cominty credits.

Live mode calls the real Worker and ContextGuard agents.

## Project structure

```text
contextguard/
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── agents/
│   │   ├── guard.ts
│   │   └── worker.ts
│   ├── lib/
│   │   └── extract-json.ts
│   ├── cominty.ts
│   ├── config.ts
│   ├── demo.ts
│   ├── orchestrator.ts
│   ├── server.ts
│   └── types.ts
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

## Run locally

Requirements:

- Node.js 20+
- a Cominty account
- a configured Worker agent
- a configured ContextGuard agent
- GitHub access configured through the agents

Install dependencies:

```bash
npm install
```

Create the local environment file:

```bash
cp .env.example .env.local
```

Configure the following values:

```env
COMINTY_API_KEY=your_api_key
COMINTY_USER_ID=your_user_id
COMINTY_WORKER_AGENT_ID=your_worker_agent_id
COMINTY_GUARD_AGENT_ID=your_guard_agent_id
```

Never commit `.env.local`.

Check TypeScript:

```bash
npm run check
```

Build:

```bash
npm run build
```

Start:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Tech stack

- TypeScript
- Node.js
- Cominty SDK
- GitHub integration
- HTML
- CSS
- JavaScript

No frontend framework is required for the demo.

## Current scope

ContextGuard currently demonstrates release-readiness verification, but the architecture is intentionally repository-agnostic.

The same pattern can be applied to other agent workflows where an external action should only happen after independent evidence verification.

---

ContextGuard — **Worker → Independent Verifier → Deterministic Gate → Human Approval**
