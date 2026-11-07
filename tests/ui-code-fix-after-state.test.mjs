import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyStrictUnifiedDiff, computeCodeFixAfterStateEvidence } from "../dist/api/ui/code-fix-after-state.js";

const sha256 = (t) => createHash("sha256").update(t, "utf8").digest("hex");

const REAL_BEFORE = 'def addition(a, b):\n    return a + b\n\nif __name__ == "__main__":\n    print(addition(20, 30))\n';
const REAL_DIFF = [
  "--- a/app.py", "+++ b/app.py", "@@ -1,4 +1,17 @@", " def addition(a, b):",
  '+    """Return the sum of two numbers.', "+", "+    Args:", "+        a: The first number to add.", "+        b: The second number to add.", "+",
  "+    Returns:", "+        The sum a + b.", "+", "+    Example:", "+        >>> addition(2, 3)", "+        5", '+    """',
  "     return a + b", " ", ' if __name__ == "__main__":'
].join("\n") + "\n";
const REAL_BEFORE_SHA256 = "e0f9c223c7bac066c5d76af82ffd544148c61fd2ac84ff8ddac07cbdefb09061";
const REAL_AFTER_SHA256 = "54e6dc64da4a709b85f850b662cd14f32b67c4e4f8d6d993272272488559120e";

test("Code fix: the real first-run proposal: the displayed diff reproduces the sealed before and after hashes", () => {
  assert.equal(sha256(REAL_BEFORE), REAL_BEFORE_SHA256);
  const applied = applyStrictUnifiedDiff("app.py", REAL_BEFORE, REAL_DIFF);
  assert.equal(applied.ok, true);
  assert.equal(sha256(applied.after), REAL_AFTER_SHA256);
  const evidence = computeCodeFixAfterStateEvidence({ path: "app.py", observedBefore: REAL_BEFORE, diff: REAL_DIFF,
    sealedAfterSha256: REAL_AFTER_SHA256, contentToCommit: applied.after });
  assert.deepEqual(evidence, {
    diff_applies_exactly_to_observed_original: true, diff_failure_reason: null,
    sha256_of_diff_result: REAL_AFTER_SHA256, sha256_of_content_to_be_committed: REAL_AFTER_SHA256, sealed_after_sha256: REAL_AFTER_SHA256,
    diff_result_sha256_equals_sealed_after_sha256: true, content_to_be_committed_sha256_equals_sealed_after_sha256: true,
    content_to_be_committed_equals_diff_result: true, diff_result_size_bytes: Buffer.byteLength(applied.after, "utf8")
  });
});

test("Code fix: a blank context line whose single space was stripped, or a diff without final newline, still applies", () => {
  assert.equal(applyStrictUnifiedDiff("app.py", REAL_BEFORE, REAL_DIFF.replace("\n \n", "\n\n")).ok, true);
  assert.equal(applyStrictUnifiedDiff("app.py", REAL_BEFORE, REAL_DIFF.slice(0, -1)).ok, true);
});

const FIXTURES = [{"tool": "diff", "U": 0, "before": " \nx\n+x\né à ü\nsame", "after": " \n+x\n-y\n日本語 🙂\n日本語 🙂\n-y\nsame", "diff": "--- a/f\n+++ b/f\n@@ -2 +1,0 @@\n-x\n@@ -4 +3,4 @@\n-é à ü\n+-y\n+日本語 🙂\n+日本語 🙂\n+-y\n"}, {"tool": "diff", "U": 0, "before": "-y", "after": "x\n", "diff": "--- a/f\n+++ b/f\n@@ -1 +1 @@\n--y\n\\ No newline at end of file\n+x\n"}, {"tool": "diff", "U": 0, "before": " \n", "after": "", "diff": "--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n- \n"}, {"tool": "diff", "U": 0, "before": "é à ü\n--- a/f\n\n", "after": "é à ü\n--- a/f\n\n-y", "diff": "--- a/f\n+++ b/f\n@@ -3,0 +4 @@\n+-y\n\\ No newline at end of file\n"}, {"tool": "diff", "U": 1, "before": "x", "after": "", "diff": "--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-x\n\\ No newline at end of file\n"}, {"tool": "diff", "U": 1, "before": "+++ b/f\nsame\n--- a/f\nsame\n+x\n{\n\\ No newline at end of file\n-y", "after": "+++ b/f\n\nsame\n+x\n{\n\\ No newline at end of file\n-y", "diff": "--- a/f\n+++ b/f\n@@ -1,4 +1,3 @@\n +++ b/f\n-same\n---- a/f\n+\n same\n"}, {"tool": "diff", "U": 1, "before": "", "after": " \n", "diff": "--- a/f\n+++ b/f\n@@ -0,0 +1 @@\n+ \n"}, {"tool": "diff", "U": 1, "before": "+x\n", "after": "\nsame", "diff": "--- a/f\n+++ b/f\n@@ -1 +1,2 @@\n-+x\n+\n+same\n\\ No newline at end of file\n"}, {"tool": "diff", "U": 3, "before": " ", "after": "", "diff": "--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n- \n\\ No newline at end of file\n"}, {"tool": "diff", "U": 3, "before": "}\n{\n-y", "after": "\n \n-y", "diff": "--- a/f\n+++ b/f\n@@ -1,3 +1,3 @@\n-}\n-{\n+\n+ \n -y\n\\ No newline at end of file\n"}, {"tool": "diff", "U": 3, "before": "", "after": "x\n ", "diff": "--- a/f\n+++ b/f\n@@ -0,0 +1,2 @@\n+x\n+ \n\\ No newline at end of file\n"}, {"tool": "diff", "U": 3, "before": "\n", "after": "", "diff": "--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-\n"}, {"tool": "diff", "U": 25, "before": "", "after": "--- a/f\n{\n+x", "diff": "--- a/f\n+++ b/f\n@@ -0,0 +1,3 @@\n+--- a/f\n+{\n++x\n\\ No newline at end of file\n"}, {"tool": "diff", "U": 25, "before": "{\n{", "after": "", "diff": "--- a/f\n+++ b/f\n@@ -1,2 +0,0 @@\n-{\n-{\n\\ No newline at end of file\n"}, {"tool": "diff", "U": 25, "before": "same", "after": "\nsame\nsame\nsame", "diff": "--- a/f\n+++ b/f\n@@ -1 +1,4 @@\n+\n+same\n+same\n same\n\\ No newline at end of file\n"}, {"tool": "diff", "U": 25, "before": "x\n", "after": "", "diff": "--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-x\n"}, {"tool": "git", "U": 0, "before": "def f():", "after": "", "diff": "diff --git a/f b/f\nindex bc64855..e69de29 100644\n--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-def f():\n\\ No newline at end of file\n"}, {"tool": "git", "U": 0, "before": "-y\ny\n+x\n\nsame\ntrailing  \n\n\\ No newline at end of file", "after": "-y\n+++ b/f\n\nsame\ntrailing  \n\n\\ No newline at end of file", "diff": "diff --git a/f b/f\nindex 98af1f1..5bfe683 100644\n--- a/f\n+++ b/f\n@@ -2,2 +2 @@\n-y\n-+x\n++++ b/f\n"}, {"tool": "git", "U": 0, "before": "é à ü\n", "after": "é à ü\nsame", "diff": "diff --git a/f b/f\nindex 2523a7a..ef15eff 100644\n--- a/f\n+++ b/f\n@@ -1,0 +2 @@\n+same\n\\ No newline at end of file\n"}, {"tool": "git", "U": 0, "before": "\n \n", "after": " \n", "diff": "diff --git a/f b/f\nindex d148bc8..8d1c8b6 100644\n--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-\n"}, {"tool": "git", "U": 1, "before": "import os", "after": "", "diff": "diff --git a/f b/f\nindex 0aba17d..e69de29 100644\n--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-import os\n\\ No newline at end of file\n"}, {"tool": "git", "U": 1, "before": "}\n{", "after": "same\n}\n+++ b/f", "diff": "diff --git a/f b/f\nindex 607bb6f..48374cb 100644\n--- a/f\n+++ b/f\n@@ -1,2 +1,3 @@\n+same\n }\n-{\n\\ No newline at end of file\n++++ b/f\n\\ No newline at end of file\n"}, {"tool": "git", "U": 1, "before": "}\n", "after": "", "diff": "diff --git a/f b/f\nindex 5c34318..e69de29 100644\n--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-}\n"}, {"tool": "git", "U": 1, "before": "# comment\n", "after": "same", "diff": "diff --git a/f b/f\nindex 308ec1d..5a66c00 100644\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-# comment\n+same\n\\ No newline at end of file\n"}, {"tool": "git", "U": 3, "before": "", "after": "{", "diff": "diff --git a/f b/f\nindex e69de29..81750b9 100644\n--- a/f\n+++ b/f\n@@ -0,0 +1 @@\n+{\n\\ No newline at end of file\n"}, {"tool": "git", "U": 3, "before": " ", "after": "", "diff": "diff --git a/f b/f\nindex 0519ecb..e69de29 100644\n--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n- \n\\ No newline at end of file\n"}, {"tool": "git", "U": 3, "before": "}\ntrailing  \nsame\n--- a/f\n+++ b/f", "after": "trailing  \nsame\n--- a/f\n+++ b/f", "diff": "diff --git a/f b/f\nindex 1682de5..d4ac1be 100644\n--- a/f\n+++ b/f\n@@ -1,4 +1,3 @@\n-}\n trailing  \n same\n --- a/f\n"}, {"tool": "git", "U": 3, "before": "\n", "after": "", "diff": "diff --git a/f b/f\nindex 8b13789..e69de29 100644\n--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-\n"}, {"tool": "git", "U": 25, "before": "same", "after": "", "diff": "diff --git a/f b/f\nindex 5a66c00..e69de29 100644\n--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-same\n\\ No newline at end of file\n"}, {"tool": "git", "U": 25, "before": "@@ -1 +1 @@", "after": "# comment\n{", "diff": "diff --git a/f b/f\nindex e2e41e5..97f968d 100644\n--- a/f\n+++ b/f\n@@ -1 +1,2 @@\n-@@ -1 +1 @@\n\\ No newline at end of file\n+# comment\n+{\n\\ No newline at end of file\n"}, {"tool": "git", "U": 25, "before": "\n", "after": "", "diff": "diff --git a/f b/f\nindex 8b13789..e69de29 100644\n--- a/f\n+++ b/f\n@@ -1 +0,0 @@\n-\n"}, {"tool": "git", "U": 25, "before": "@@ -1 +1 @@\n", "after": "same", "diff": "diff --git a/f b/f\nindex 299fce8..5a66c00 100644\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-@@ -1 +1 @@\n+same\n\\ No newline at end of file\n"}, {"tool": "git", "U": 3, "before": "\\ No newline at end of file\n@@ -1 +1 @@\n", "after": "--- a/f\n", "diff": "diff --git a/f b/f\nindex 0d800cf..ca1f3d5 100644\n--- a/f\n+++ b/f\n@@ -1,2 +1 @@\n-\\ No newline at end of file\n-@@ -1 +1 @@\n+--- a/f\n"}, {"tool": "git", "U": 0, "before": "--- a/f\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n", "after": "y\n--- a/f\n    \ny\ntrailing  \naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n", "diff": "diff --git a/f b/f\nindex d7d2ba7..3a449bf 100644\n--- a/f\n+++ b/f\n@@ -0,0 +1 @@\n+y\n@@ -1,0 +3,4 @@\n+    \n+y\n+trailing  \n+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"}, {"tool": "diff", "U": 3, "before": "}\n-y\n    return 1\né à ü\n\treturn 2\n+x\n{\n--- a/f\n+++ b/f\n{\nx\n@@ -1 +1 @@\nx\n# comment\nsame\nsame\nx\n+x\n日本語 🙂\né à ü\nx\nsame\n\\ No newline at end of file\n \nimport os\n-y\n}\n+x\nx\n@@ -1 +1 @@\ndef f():\n{\n    return 1\n\\ No newline at end of file\nsame\n    return 1\n+++ b/f\nimport os\ntrailing  \n    \n", "after": "}\n-y\n    return 1\né à ü\n\treturn 2\n    \n+x\n{\n--- a/f\n+++ b/f\n{\nx\n# comment\nsame\nsame\nx\n+x\n日本語 🙂\né à ü\nsame\n\\ No newline at end of file\n \nimport os\n-y\n}\n+x\nx\n@@ -1 +1 @@\ndef f():\n{\n    return 1\n\\ No newline at end of file\nsame\n    return 1\n+++ b/f\nimport os\n", "diff": "--- a/f\n+++ b/f\n@@ -3,14 +3,13 @@\n     return 1\n é à ü\n \treturn 2\n+    \n +x\n {\n --- a/f\n +++ b/f\n {\n x\n-@@ -1 +1 @@\n-x\n # comment\n same\n same\n@@ -18,7 +17,6 @@\n +x\n 日本語 🙂\n é à ü\n-x\n same\n \\ No newline at end of file\n  \n@@ -36,5 +34,3 @@\n     return 1\n +++ b/f\n import os\n-trailing  \n-    \n"}, {"tool": "git", "U": 1, "before": "\n-y\n-y\nx\n}\ny\n--- a/f\nsame\n@@ -1 +1 @@\n{\n    return 1\n    return 1\n\\ No newline at end of file\nsame\nimport os\n", "after": "\nx\n}\ny\n--- a/f\nsame\n@@ -1 +1 @@\n{\n    return 1\n    return 1\n\\ No newline at end of file\nsame\nimport os\ntrailing  \né à ü\n    return 1\n", "diff": "diff --git a/f b/f\nindex 7fbebb2..3c192bd 100644\n--- a/f\n+++ b/f\n@@ -1,4 +1,2 @@\n \n--y\n--y\n x\n@@ -15 +13,4 @@ same\n import os\n+trailing  \n+é à ü\n+    return 1\n"}];

test("Code fix: the applier reproduces exactly what real `diff -u` and `git diff` describe (all context sizes, newline-at-EOF variants, empty files)", () => {
  assert.ok(FIXTURES.length >= 30);
  for (const [index, fixture] of FIXTURES.entries()) {
    const result = applyStrictUnifiedDiff("f", fixture.before, fixture.diff);
    assert.equal(result.ok, true, `fixture ${index} (${fixture.tool} -U${fixture.U}): ${result.ok ? "" : result.reason}`);
    assert.equal(result.after, fixture.after, `fixture ${index} (${fixture.tool} -U${fixture.U})`);
  }
});

const hunkOf = (...lines) => ["--- a/f", "+++ b/f", ...lines].join("\n") + "\n";
const REJECTED = [
  ["context line that differs from the original", "a\nb\nc\n", hunkOf("@@ -1,3 +1,3 @@", " a", "-X", "+B", " c"), /does not match/],
  ["removed line that differs from the original", "a\nb\nc\n", hunkOf("@@ -1,3 +1,2 @@", " a", "-X", " c"), /does not match/],
  ["old-side count too large", "a\nb\n", hunkOf("@@ -1,3 +1,2 @@", " a", "-b"), /shorter/],
  ["old-side count too small", "a\nb\n", hunkOf("@@ -1,1 +1,1 @@", " a", "-b", "+c"), /hunk header|longer/],
  ["new-side count wrong", "a\n", hunkOf("@@ -1 +1,3 @@", "-a", "+b"), /shorter/],
  ["header path differs (+++)", "a\n", "--- a/f\n+++ b/g\n@@ -1 +1 @@\n-a\n+b\n", /path/],
  ["header path differs (---)", "a\n", "--- a/g\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n", /path/],
  ["path traversal in header", "a\n", "--- a/../f\n+++ b/../f\n@@ -1 +1 @@\n-a\n+b\n", /path/],
  ["no headers", "a\n", "@@ -1 +1 @@\n-a\n+b\n", /header/],
  ["no hunks", "a\n", "--- a/f\n+++ b/f\n", /no hunks/],
  ["a second file section is appended", "a\n", hunkOf("@@ -1 +1 @@", "-a", "+b") + "--- a/f\n+++ b/f\n@@ -1 +1 @@\n-b\n+c\n", /hunk header/],
  ["trailing garbage after the hunk", "a\n", hunkOf("@@ -1 +1 @@", "-a", "+b") + "garbage\n", /hunk header/],
  ["rename header", "a\n", "diff --git a/f b/f\nrename from f\nrename to g\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n", /header/],
  ["hunks out of order", "a\nb\nc\nd\n", hunkOf("@@ -3 +3 @@", "-c", "+C", "@@ -1 +1 @@", "-a", "+A"), /out of order/],
  ["overlapping hunks", "a\nb\nc\n", hunkOf("@@ -1,2 +1,2 @@", "-a", "+A", " b", "@@ -2,2 +2,2 @@", "-b", "+B", " c"), /out of order/],
  ["hunk outside the file", "a\n", hunkOf("@@ -9 +9 @@", "-a", "+b"), /outside|out of order/],
  ["carriage return in diff", "a\n", "--- a/f\r\n+++ b/f\r\n@@ -1 +1 @@\r\n-a\r\n+b\r\n", /carriage/],
  ["invalid line prefix", "a\n", hunkOf("@@ -1 +1 @@", "?a"), /prefix/],
  ["unknown backslash marker", "a\n", hunkOf("@@ -1 +1 @@", "-a", "+b", "\\ Something else"), /marker/],
  ["no-newline marker missing for an original without final newline", "a", hunkOf("@@ -1 +1 @@", "-a", "+b"), /newline/],
  ["no-newline marker present for an original that has one", "a\n", hunkOf("@@ -1 +1 @@", "-a", "\\ No newline at end of file", "+b"), /newline/],
  ["no-newline marker in the middle of the file", "a\nb\nc\n", hunkOf("@@ -1,2 +1,2 @@", " a", "-b", "+B", "\\ No newline at end of file"), /not the last line/],
  ["no-newline marker after a context line that is not the last line of the hunk", "a\nb", hunkOf("@@ -1,2 +1,2 @@", " a", "\\ No newline at end of file", "-b", "\\ No newline at end of file", "+c"), /marker/],
  ["two markers in a row", "a", hunkOf("@@ -1 +1 @@", "-a", "\\ No newline at end of file", "\\ No newline at end of file", "+b"), /marker/],
  ["empty hunk", "a\n", hunkOf("@@ -1,0 +1,0 @@"), /empty hunk/]
];
for (const [name, before, diff, reason] of REJECTED) {
  test(`Code fix: fails closed: ${name}`, () => {
    const result = applyStrictUnifiedDiff("f", before, diff);
    assert.equal(result.ok, false);
    assert.match(result.reason, reason);
  });
}

test("Code fix: never throws on malformed input", () => {
  for (const value of [undefined, null, 5, {}, [], "", "\n\n", "@@", "--- a/f\n+++ b/f\n@@ -1 +1 @@\n", "x".repeat(300000)]) {
    assert.doesNotThrow(() => applyStrictUnifiedDiff("f", "a\n", value));
    assert.doesNotThrow(() => applyStrictUnifiedDiff("f", value, "--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n"));
    assert.doesNotThrow(() => applyStrictUnifiedDiff(value, "a\n", "--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n"));
    assert.doesNotThrow(() => computeCodeFixAfterStateEvidence({ path: "f", observedBefore: "a\n", diff: value, sealedAfterSha256: value, contentToCommit: value }));
  }
});

test("Code fix: each broken binding is reported on its own flag and never reported as satisfied", () => {
  const base = { path: "app.py", observedBefore: REAL_BEFORE, diff: REAL_DIFF, sealedAfterSha256: REAL_AFTER_SHA256 };
  const goodAfter = applyStrictUnifiedDiff("app.py", REAL_BEFORE, REAL_DIFF).after;

  const wrongSeal = computeCodeFixAfterStateEvidence({ ...base, sealedAfterSha256: "0".repeat(64), contentToCommit: goodAfter });
  assert.equal(wrongSeal.diff_applies_exactly_to_observed_original, true);
  assert.equal(wrongSeal.diff_result_sha256_equals_sealed_after_sha256, false);
  assert.equal(wrongSeal.content_to_be_committed_sha256_equals_sealed_after_sha256, false);
  assert.equal(wrongSeal.content_to_be_committed_equals_diff_result, true);

  const swapped = computeCodeFixAfterStateEvidence({ ...base, contentToCommit: goodAfter.replace("a + b", "a - b") });
  assert.equal(swapped.diff_result_sha256_equals_sealed_after_sha256, true);
  assert.equal(swapped.content_to_be_committed_sha256_equals_sealed_after_sha256, false);
  assert.equal(swapped.content_to_be_committed_equals_diff_result, false);

  const drifted = computeCodeFixAfterStateEvidence({ ...base, observedBefore: REAL_BEFORE.replace("20, 30", "1, 2"), contentToCommit: goodAfter });
  assert.equal(drifted.diff_applies_exactly_to_observed_original, true);
  assert.equal(drifted.diff_result_sha256_equals_sealed_after_sha256, false);
  assert.equal(drifted.content_to_be_committed_equals_diff_result, false);

  const stale = computeCodeFixAfterStateEvidence({ ...base, observedBefore: REAL_BEFORE.replace("return a + b", "return b + a"), contentToCommit: goodAfter });
  assert.equal(stale.diff_applies_exactly_to_observed_original, false);
  assert.equal(typeof stale.diff_failure_reason, "string");
  assert.equal(stale.sha256_of_diff_result, null);
  assert.equal(stale.diff_result_sha256_equals_sealed_after_sha256, false);
  assert.equal(stale.content_to_be_committed_equals_diff_result, false);

  const missing = computeCodeFixAfterStateEvidence({ ...base, contentToCommit: undefined });
  assert.equal(missing.sha256_of_content_to_be_committed, null);
  assert.equal(missing.content_to_be_committed_sha256_equals_sealed_after_sha256, false);
  assert.equal(missing.content_to_be_committed_equals_diff_result, false);

  const noSeal = computeCodeFixAfterStateEvidence({ ...base, sealedAfterSha256: "", contentToCommit: goodAfter });
  assert.equal(noSeal.diff_result_sha256_equals_sealed_after_sha256, false);
  assert.equal(noSeal.content_to_be_committed_sha256_equals_sealed_after_sha256, false);
});

test("Code fix: verificationEvidence delivers the server-computed after state to both Worker and Guard", () => {
  const source = readFileSync(new URL("../src/api/ui/github-code-fix.ts", import.meta.url), "utf8");
  assert.match(source, /import \{ computeCodeFixAfterStateEvidence \} from '\.\/code-fix-after-state\.js';/);
  const start = source.indexOf("async verificationEvidence(");
  const end = source.indexOf("async executeApprovedPlan(", start);
  assert.ok(start > 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /server_computed_after_state:computeCodeFixAfterStateEvidence\(\{path:ch\.path,/);
  assert.match(body, /sealedAfterSha256:ch\.after_sha256,contentToCommit:ch\.after_content/);
  assert.match(body, /not by a language model/);
  assert.match(body, /report any mismatch/);
  assert.doesNotMatch(body, /must (?:return|answer|output|conclude)[^'\n]*(?:PASS|READY)/i);
});
