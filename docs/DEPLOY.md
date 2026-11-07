# Deployment

ContextGuard is a single Node.js process. It ships with a `Dockerfile` that builds and runs it, and a `render.yaml` blueprint for Render. Any host that can run a Docker image and terminate HTTPS works the same way.

Secrets are never stored in the repository. They are entered in the hosting platform, which passes them to the app as environment variables.

## Before you start

- The repository is on GitHub.
- You have a GitHub App (see [GITHUB_APP.md](GITHUB_APP.md)) with its client ID, client secret and slug at hand.
- You have your Cominty API key, user ID and the IDs of the Worker and Guard agents.

## Render

1. Sign in to <https://render.com> with GitHub.
2. Click **New > Blueprint**, select the repository and confirm. Render reads `render.yaml` and creates a web service called `contextgard`, built from the `Dockerfile`, in the Frankfurt region.
3. Render asks for the values that are not in the blueprint:

   | Variable | Value |
   | --- | --- |
   | `COMINTY_API_KEY` | your Cominty API key |
   | `COMINTY_USER_ID` | your Cominty user ID |
   | `COMINTY_WORKER_AGENT_ID` | the Worker agent ID |
   | `COMINTY_GUARD_AGENT_ID` | the Guard agent ID |
   | `CONTEXTGUARD_GITHUB_APP_CLIENT_ID` | the App's client ID |
   | `CONTEXTGUARD_GITHUB_APP_CLIENT_SECRET` | the App's client secret |
   | `CONTEXTGUARD_GITHUB_APP_SLUG` | the App's slug |
   | `CONTEXTGUARD_GITHUB_APP_CALLBACK_URL` | `https://contextgard.onrender.com/api/ui/github/callback` |

   If the name `contextgard` is already taken, Render adds a suffix to the address. Once the service exists, check its URL at the top of its page, and correct the callback URL under **Environment** if needed. Render restarts the service on save.

4. Wait until the deploy is **Live**. The logs end with `GitHub identity : GitHub App user sessions` and `GitHub writes : ENABLED after per-user approval`.
5. Open your GitHub App settings (<https://github.com/settings/apps>, then **Edit**):
   - **Homepage URL**: `https://contextgard.onrender.com`
   - **Callback URL**: add `https://contextgard.onrender.com/api/ui/github/callback`. Keep the `localhost` one if you still run the app on your machine.
   - **Where can this GitHub App be installed**: *Only on this account* is the safe choice for a public demo.
6. Open `https://contextgard.onrender.com`, click **Connect with GitHub** and install the App on the repositories you want to use.

The blueprint sets these values itself:

| Variable | Value | Why |
| --- | --- | --- |
| `CONTEXTGUARD_UI_HOST` | `0.0.0.0` | Accept connections from Render's proxy |
| `CONTEXTGUARD_UI_REAL_EXECUTION_ENABLED` | `true` | Writes are possible, each one after verification, approval, recheck and `EXECUTE` |
| `CONTEXTGUARD_UI_LOCAL_SESSION_ENABLED` | `false` | Only GitHub sign-in |
| `CONTEXTGUARD_AGENT_DRAFT_FILE` | `memory` | Nothing is written to disk |

Render provides HTTPS and sets `PORT` itself.

### Good to know

- On the free plan the service sleeps after 15 minutes without traffic. The next visit wakes it in about a minute, and everyone has to sign in again because sessions live in memory. Open the page a minute before a demo, or use a paid instance.
- Every push to `main` redeploys automatically.
- For a custom domain, add it in Render and list it in `CONTEXTGUARD_ALLOWED_HOSTS`. Requests for any host name that is not allowed are refused with `403`.
- To turn writes off without redeploying the code, set `CONTEXTGUARD_UI_REAL_EXECUTION_ENABLED` to `false` in the dashboard.

## Other hosts

Build and run the image:

```bash
docker build -t contextguard .
docker run --rm -p 3000:3000 --env-file .env.local contextguard
```

With `.env.local` set up for local use (callback on `http://localhost:3000`), this runs the production image on your machine at <http://localhost:3000>.

On Railway, Fly.io or a server of your own, deploy the same image, set the variables from the table above, put HTTPS in front of it, and use `https://<your-domain>/api/ui/github/callback` as the callback URL, both in the environment and in the GitHub App settings.

## Before going public

- Install the App only on repositories you are happy to demo, and keep *Only on this account* in the App settings.
- The Cominty budget (`CONTEXTGUARD_COMINTY_MAX_USER_HOUR`, `CONTEXTGUARD_COMINTY_MAX_GLOBAL_DAY`) caps how many agent calls can be made, per user and in total.
- Sessions, proposals and budgets are in memory and reset on every restart. This is fine for a demo; a long-running public service would need persistent session storage. See [SECURITY.md](SECURITY.md).
