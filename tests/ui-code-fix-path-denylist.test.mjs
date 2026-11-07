import assert from "node:assert/strict";
import test from "node:test";
import { validateCodeFixApprovalAction } from "../dist/api/ui/github-code-fix.js";

const action = path => ({
  plan_digest: "a".repeat(64), issue_number: 1, issue_fingerprint: "b".repeat(64), base_commit_sha: "c".repeat(40),
  head_branch: "contextguard/issue-1-abcdef", pr_title: "Fix addition output", pr_body: "Corrige l'affichage de l'addition.",
  files: [{ path, before_sha256: "d".repeat(64), after_sha256: "e".repeat(64), diff: "@@ -1 +1 @@" }]
});
const accepted = path => { try { validateCodeFixApprovalAction(action(path)); return true; } catch { return false; } };

test("Code fix: ordinary source, docs and manifest files stay editable", () => {
  for (const path of ["app.py", "src/app.py", "tests/test_app.py", "docs/guide.md", "scripts/deploy.sh", "package.json", "docker-compose.yml", "src/token.py", "src/tokenizer/core.ts"]) {
    assert.equal(accepted(path), true, path);
  }
});

test("Code fix: dependency lock files are never editable", () => {
  for (const path of ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "sub/package-lock.json", "yarn.lock", "Cargo.lock", "Pipfile.lock", "poetry.lock", "composer.lock"]) {
    assert.equal(accepted(path), false, path);
  }
});

test("Code fix: anything named like a secret or credential is never editable, as a file or a directory", () => {
  for (const path of ["config/secrets.json", "secrets.yaml", "secret.yml", "src/credentials.json", "my-credentials/app.py", "secrets/x.py", "aws_credentials.js", "app/Secrets.ts"]) {
    assert.equal(accepted(path), false, path);
  }
});

test("Code fix: hidden files and directories are refused at every depth, workflows included", () => {
  for (const path of [".github/workflows/ci-cd.yml", "x/.github/workflows/ci.yml", ".env", ".env.local", "src/.env.production", "src/.config/x.json", ".npmrc", ".ssh/config", ".git/config"]) {
    assert.equal(accepted(path), false, path);
  }
});

test("Code fix: build output, vendored code, keys and extensionless files stay refused", () => {
  for (const path of ["vendor/x.js", "node_modules/a/b.js", "dist/app.js", "build/x.js", "coverage/x.js", "certs/server.pem", "keys/id.key", "Dockerfile", "requirements.txt", "a/../b.py"]) {
    assert.equal(accepted(path), false, path);
  }
});
