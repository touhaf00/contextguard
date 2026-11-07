# GitHub App setup

In GitHub App mode each person connects their own GitHub account. ContextGuard can then act only on repositories where the App is installed **and** the person has rights. The server's own personal tokens are not used.

## 1. Register the App

Open <https://github.com/settings/apps/new>.

| Setting | Value |
| --- | --- |
| Name | Any unique name, for example `ContextGuard <your-name>` |
| Homepage URL | `http://localhost:3000` |
| Callback URL | `http://localhost:3000/api/ui/github/callback` (exact) |
| Webhook | Uncheck **Active** |
| Where can it be installed | Only on your account (or Any account for other users) |

**Repository permissions**

| Permission | Level | Used for |
| --- | --- | --- |
| Metadata | Read | Repository identity (automatic) |
| Contents | Read and write | Reading files; committing a code fix to a new branch |
| Pull requests | Read and write | Opening the Draft pull request |
| Issues | Read and write | Creating and maintaining issues |
| Actions | Read | Workflow runs and failed job logs |

Without **Contents** and **Pull requests** write access the repository can still be used for issues, but "Fix issue in code" is refused with a message asking you to update the App's permissions. After changing permissions, accept the new permissions on the installation, then sign in again.

Do not grant Administration, Secrets or account permissions.

After creating the App, copy the **Client ID** (not the App ID), generate a **Client secret** and note the App's **slug** from its public URL.

## 2. Configure the server

Add to `.env.local`:

```dotenv
CONTEXTGUARD_GITHUB_APP_CLIENT_ID=Iv1.your_client_id
CONTEXTGUARD_GITHUB_APP_CLIENT_SECRET=your_client_secret
CONTEXTGUARD_GITHUB_APP_CALLBACK_URL=http://localhost:3000/api/ui/github/callback
CONTEXTGUARD_GITHUB_APP_SLUG=your-github-app-slug
CONTEXTGUARD_UI_LOCAL_SESSION_ENABLED=false
```

All four `CONTEXTGUARD_GITHUB_APP_*` values are required together; the server refuses to start with only some of them. The client secret stays on the server.

## 3. Start and connect

```bash
npm start                # writes disabled: safe first test
```

Open <http://localhost:3000> (use `localhost`, not `127.0.0.1`: the OAuth cookies are bound to the host name), click **Connect with GitHub**, authorize the App, then **install** it on the repositories you choose. Authorization alone does not grant access to a repository.

Check that you see your own GitHub login and only the repositories you installed the App on. No Cominty call is made until you ask the assistant for something.

When you are ready to test real writes on a disposable repository:

```bash
npm run start:live       # real writes enabled for this run; each action still needs your approval
```

## Deploying publicly

Add `https://your-domain/api/ui/github/callback` to the App's callback URLs, and set the same value in `CONTEXTGUARD_GITHUB_APP_CALLBACK_URL` on the server. The full procedure is in [DEPLOY.md](DEPLOY.md).

## Troubleshooting

- **No repositories listed** — the App is not installed on any repository you can access, or its Issues permission is missing.
- **"Code fixes require Contents: write and Pull requests: write"** — update the App's permissions, accept them on the installation, sign in again.
- **Signed out after a restart** — expected: sessions are in memory.
