# ContextGuard

> **Verify the context before you trust the action.**

ContextGuard is an independent evidence-verification and safety layer for AI agents.

Instead of allowing an agent to act directly from its own assessment, ContextGuard introduces a second AI agent that independently verifies the evidence and reasoning, followed by a deterministic application-level gate and explicit human approval.

The project is built with the **Cominty SDK and Managed Agents** and currently evaluates GitHub repository targets in read-only mode.

---

## Why ContextGuard?

AI agents can retrieve correct information and still reach the wrong conclusion.

For example, a workflow job named `deploy` may complete successfully while only printing a message and performing no real deployment.

ContextGuard therefore separates:

- what is configured;
- what was executed;
- whether execution succeeded;
- whether command output was actually observed;
- whether the intended semantic effect was verified.

This helps prevent incomplete or misleading context from being promoted directly into an external action.

---

## Architecture

```text
Repository + Target + Assessment
              |
              v
        Worker Agent
   repository investigation
              |
              | structured evidence report
              v
        ContextGuard
    independent verification
              |
        +-----+-----+
        |     |     |
       PASS REVIEW FAIL
        |     |     |
        |     |     +----> block
        |     |
        |     +----------> targeted evidence recovery
        |                  max 2 retries
        |
        v
   Deterministic Gate
        |
        +--> READY + PASS
        |    AWAITING_HUMAN_APPROVAL
        |
        +--> NOT_READY + PASS
        |    BLOCKED_NOT_READY
        |
        +--> UNKNOWN + PASS
        |    STOPPED_UNKNOWN
        |
        +--> unresolved REVIEW
        |    STOPPED_REVIEW
        |
        +--> FAIL
             BLOCKED_VERIFICATION
```

The LLM does not own the final gate.

---

## Agent roles

### Worker Agent

The Worker investigates the requested repository and target using authorized read-only repository evidence.

It returns one business decision:

- `READY`
- `NOT_READY`
- `UNKNOWN`

Decision-critical claims must be supported by evidence.

The Worker must preserve uncertainty when the available evidence is insufficient.

### ContextGuard

ContextGuard independently evaluates the Worker's evidence and reasoning.

It returns one verification verdict:

- `PASS`
- `REVIEW`
- `FAIL`

The business decision and verification verdict are intentionally separate.

For example:

```text
Worker: NOT_READY
Guard: PASS
```

means that ContextGuard independently verified that the Worker's `NOT_READY` conclusion is well supported.

A `PASS` does **not** mean that the repository itself is ready.

---

## Assessment modes

ContextGuard currently supports three assessment modes.

### Technical release readiness

The agents autonomously discover the repository-established mechanisms relevant to technical readiness, including tests, validation checks, builds, workflows and material technical blockers.

The policy does not invent requirements simply because they are common industry conventions.

Deployment, publication or other release mechanisms are only considered mandatory when repository evidence establishes them as requirements.

### Deployment readiness

The agents evaluate whether the selected target satisfies the repository-established prerequisites required to proceed toward deployment approval.

A workflow or step named `deploy` is not accepted as proof that a real deployment mechanism exists.

ContextGuard distinguishes successful workflow execution from the semantic effect implied by the workflow name.

### Custom assessment

A user can define a specific verification mission.

The Worker investigates only the evidence relevant to that mission, while ContextGuard independently verifies the resulting assessment.

This allows the same architecture to support repository-specific or task-specific decisions without hard-coding one technology stack.

---

## Deterministic safety policy

The final policy is enforced by application code rather than by either AI agent.

| Worker decision | Guard verdict | Final status |
|---|---|---|
| `READY` | `PASS` | `AWAITING_HUMAN_APPROVAL` |
| `NOT_READY` | `PASS` | `BLOCKED_NOT_READY` |
| `UNKNOWN` | `PASS` | `STOPPED_UNKNOWN` |
| any | `REVIEW` | targeted retry or `STOPPED_REVIEW` |
| any | `FAIL` | `BLOCKED_VERIFICATION` |

An external action is never executed automatically.

---

## Targeted evidence recovery

ContextGuard can request focused evidence recovery when a decision-critical gap may realistically be resolved.

A retry occurs only when:

- the Guard returns `REVIEW`;
- the Guard explicitly recommends another retry;
- precise requested checks are available;
- the requested evidence has not already been attempted;
- the evidence is realistically recoverable;
- the maximum retry count has not been reached.

The orchestration layer allows at most **two targeted retries**.

The Worker receives only the requested checks instead of repeating the entire repository investigation.

If evidence becomes terminally unavailable, ContextGuard can return:

```text
REVIEW
retry_recommended = false
```

and the deterministic gate stops the assessment safely.

---

## Evidence semantics

ContextGuard distinguishes several evidence levels:

```text
configured
    ↓
executed
    ↓
completed successfully
    ↓
output directly observed
    ↓
semantic effect verified
```

One level is never automatically promoted into another.

For example:

```text
Job name:    deploy
Conclusion:  success
```

does not prove:

```text
Deployment occurred: yes
```

The actual configured operation or resulting effect must support that claim when it is decision-critical.

---

## Safety properties

The current implementation enforces the following principles:

- repository investigation is read-only;
- no agent may modify the repository;
- the Worker cannot directly authorize an action;
- ContextGuard independently verifies decision-critical evidence;
- `allowed_to_act` is advisory only;
- deterministic application code owns the final gate;
- uncertainty is preserved instead of being forced into a binary answer;
- duplicate retry requests are not repeated;
- terminally unavailable evidence does not trigger endless retries;
- external actions are never executed automatically;
- `READY + PASS` still requires explicit human approval.

The current Human Approval button records approval locally for demonstration purposes.

It does **not** execute a GitHub action.

---

## Validated behaviors

ContextGuard has been exercised against controlled and real repositories with different technology stacks and decision outcomes.

### Controlled Python / Docker CI

Validated:

```text
READY + PASS
→ AWAITING_HUMAN_APPROVAL
```

A deliberately failing test scenario validated:

```text
NOT_READY + PASS
→ BLOCKED_NOT_READY
```

A workflow containing an echo-only `deploy` step validated semantic-effect handling:

```text
UNKNOWN + PASS
→ STOPPED_UNKNOWN
```

### Terraform repository

A real Terraform repository validated repository-agnostic discovery without assuming Python, Docker or another unrelated build system.

Result:

```text
READY + PASS
→ AWAITING_HUMAN_APPROVAL
```

### JavaScript GitHub Action repository

A larger real-world repository exposed incomplete and expired execution evidence.

ContextGuard preserved uncertainty instead of forcing a decision:

```text
UNKNOWN + REVIEW
→ STOPPED_REVIEW
```

### Spring Petclinic

The same repository and branch produced different outcomes depending on the assessment mission.

Technical release readiness:

```text
READY + PASS
→ AWAITING_HUMAN_APPROVAL
```

Deployment readiness:

```text
UNKNOWN + REVIEW
→ STOPPED_REVIEW
```

Custom Maven + Gradle verification:

```text
READY + PASS
→ AWAITING_HUMAN_APPROVAL
```

This demonstrates that the decision depends on the requested mission and its evidence requirements, not simply on the repository or CI status.

---

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
│   ├── policies.ts
│   ├── server.ts
│   └── types.ts
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## Run locally

### Requirements

- Node.js 20+
- a Cominty account
- a configured Worker Managed Agent
- a configured ContextGuard Managed Agent
- GitHub repository access configured through the agents

### Install

```bash
npm install
```

### Environment

Create the local environment file:

```bash
cp .env.example .env.local
```

Configure:

```env
COMINTY_API_KEY=your_api_key
COMINTY_USER_ID=your_user_id
COMINTY_WORKER_AGENT_ID=your_worker_agent_id
COMINTY_GUARD_AGENT_ID=your_guard_agent_id
```

Never commit `.env.local`.

### TypeScript check

```bash
npm run check
```

### Build

```bash
npm run build
```

### Start

```bash
npm start
```

The application uses `PORT` when provided and otherwise defaults to port `3000`.

Open:

```text
http://localhost:3000
```

---

## Tech stack

- TypeScript
- Node.js
- Cominty SDK
- Cominty Managed Agents
- GitHub integration
- HTML
- CSS
- JavaScript

No frontend framework is required.

---

## Current scope

ContextGuard currently demonstrates independent evidence verification for software repository decisions.

The architecture is intentionally repository-agnostic and can be extended to other agent workflows where an external action should only proceed after:

```text
Investigation
→ Independent verification
→ Deterministic policy
→ Human approval
```

---

**ContextGuard — Worker → Independent Verifier → Deterministic Gate → Human Approval**
