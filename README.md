# ContextGuard

ContextGuard lets a Cominty agent look after a GitHub repository without ever letting it write on its own. The agent can open an issue about a failing CI run, comment on, label, close or reopen an issue, or propose a code fix. Every one of these actions is checked by a second agent, approved by you, and checked against GitHub one last time right before it is applied.

Built for the Cominty Agent-Native Product Challenge.

## How it works

1. **Propose.** A Cominty agent reads the repository (commits, workflow runs, job logs, issues, files) and proposes one precise action.
2. **Verify.** A Worker agent checks each statement of the proposal against GitHub data that the server reads itself. A separate Guard agent then reviews the Worker's conclusion and answers `PASS`, `REVIEW` or `FAIL`. Only `PASS` goes further.
3. **Approve.** You see exactly what will be written, and you approve that exact action.
4. **Recheck.** Just before writing, the server reads GitHub again. If the branch moved, the issue changed or an issue with the same title appeared, nothing is written.
5. **Execute.** You type `EXECUTE`. A single-use receipt is consumed and the action is applied once.

The agents never hold write access. Writes go through a small deterministic executor that uses the GitHub authorization of the person signed in.

## What it can do

| Action | Result on GitHub |
| --- | --- |
| Create an issue | An issue about a failed CI run, written by the server from the run, its jobs and its log |
| Comment on an issue | A comment |
| Add labels | Labels on an existing issue |
| Edit an issue | A new title or description |
| Close or reopen an issue | The new state |
| Fix the code | A commit on a new branch and a draft pull request, never merged |

You can let Cominty pick the most useful action for a repository, or choose the action (and the issue) yourself.

## Running it locally

You need Node.js 22 or later, a Cominty account with two agents (a Worker and a Guard), and a GitHub App. Creating the App takes a few minutes: see [docs/GITHUB_APP.md](docs/GITHUB_APP.md).

```bash
git clone https://github.com/touhaf00/contextgard.git
cd contextgard
npm ci
cp .env.example .env.local
```

Fill in `.env.local`, then:

```bash
npm test
npm start
```

Open <http://localhost:3000> (use `localhost`, not `127.0.0.1`), click **Connect with GitHub** and install the App on the repositories you want to use.

Writes to GitHub are off by default. To allow them for one session:

```bash
npm run start:live
```

Each write still needs a `PASS` from the Guard, your approval, the final recheck and `EXECUTE`. Try it on a throwaway repository first, and keep an eye on your Cominty credits: a full run makes several agent calls.

## Configuration

Locally, the configuration lives in `.env.local`, which Git ignores. Online, set the same variables in your hosting platform. No personal access token is needed: each user acts with their own GitHub authorization, and only on repositories where the App is installed.

| Variable | Required | Description |
| --- | --- | --- |
| `COMINTY_API_KEY` | yes | Cominty API key |
| `COMINTY_USER_ID` | yes | Cominty user ID |
| `COMINTY_WORKER_AGENT_ID` | yes | ID of the Worker agent |
| `COMINTY_GUARD_AGENT_ID` | yes | ID of the Guard agent |
| `CONTEXTGUARD_GITHUB_APP_CLIENT_ID` | yes | Client ID of the GitHub App |
| `CONTEXTGUARD_GITHUB_APP_CLIENT_SECRET` | yes | Client secret of the GitHub App |
| `CONTEXTGUARD_GITHUB_APP_CALLBACK_URL` | yes | Your base URL followed by `/api/ui/github/callback` |
| `CONTEXTGUARD_GITHUB_APP_SLUG` | recommended | The App's slug, from its public page URL. Used for the install link |
| `CONTEXTGUARD_UI_REAL_EXECUTION_ENABLED` | no | `true` allows writes. Default `false` |
| `CONTEXTGUARD_UI_HOST` | no | Listen address. Default `127.0.0.1`, use `0.0.0.0` in a container |
| `PORT` | no | Default `3000` |
| `CONTEXTGUARD_ALLOWED_HOSTS` | no | Extra public host names, for example a custom domain |
| `CONTEXTGUARD_COMINTY_MAX_USER_HOUR` | no | Agent calls per user per hour. Default `50` |
| `CONTEXTGUARD_COMINTY_MAX_GLOBAL_DAY` | no | Agent calls for everyone per day. Default `300` |

## Putting it online

The repository includes a `Dockerfile` and a `render.yaml` blueprint for [Render](https://render.com). The short version:

1. Push the repository to GitHub.
2. On Render, choose **New > Blueprint** and select the repository.
3. Enter the values Render asks for. The callback URL is `https://<your-service>.onrender.com/api/ui/github/callback`.
4. In the GitHub App settings, add that callback URL and set the homepage to your Render URL.

Step-by-step instructions, and how to run the same image elsewhere, are in [docs/DEPLOY.md](docs/DEPLOY.md).

## Tests

```bash
npm test
```

This builds the project and runs about a thousand tests. GitHub and Cominty are mocked, so no key and no credit is used. The same command runs on every push through GitHub Actions.

## Project layout

```
src/
  core/              evidence, verification, action locks, preflight, receipts
  agents/            Worker and Guard adapters for Cominty
  adapters/github/   GitHub reads, snapshots and the trusted executor
  api/ui/            web backend: sessions, GitHub App, proposals, code fixes
  api/v2/            machine API: authorization, approval, preflight, execution
  server.ts          HTTP server
public/              web interface and the Security Playground
tests/               test suite
docs/                architecture, security model, GitHub App setup, deployment, demo script
```

Names ending in `V2` refer to the version of the authorization protocol, not of the app.

## Limits

- Sessions, proposals and budgets are kept in memory, so a restart signs everyone out.
- The Worker and the Guard are language models. When the evidence is thin they answer `REVIEW`, and ContextGuard stops instead of guessing.
- The final recheck and the write are two separate GitHub calls, so a change made in between is still possible in theory.
- The repository also contains an older single-call API (`/api/live`, `/api/demo`) that the web interface does not use.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/SECURITY.md](docs/SECURITY.md).

## License

[ISC](LICENSE)
