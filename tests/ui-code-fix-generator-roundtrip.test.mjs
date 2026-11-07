import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodeFixPreview, assertCodeFixPlanIntegrity } from '../dist/api/ui/code-fix-plan.js';
import { applyStrictUnifiedDiff, computeCodeFixAfterStateEvidence } from '../dist/api/ui/code-fix-after-state.js';

const originalLine = '    return a + b';
const cases = [
  ['final LF', 'def addition(a, b):\n    return a + b\n', originalLine, '    return int(a) + int(b)'],
  ['no final LF', 'def addition(a, b):\n    return a + b', originalLine, '    return int(a) + int(b)'],
  ['remove final LF', 'def addition(a, b):\n    return a + b\n', `${originalLine}\n`, originalLine],
  ['add final LF', 'def addition(a, b):\n    return a + b', originalLine, `${originalLine}\n`],
  ['blank lines', 'def addition(a, b):\n\n    return a + b\n\nif __name__ == "__main__":\n    print(addition(2, 3))\n', originalLine, '    """Return sum."""\n    return a + b'],
  ['multiline insertion', 'def addition(a, b):\n    return a + b\n', originalLine, '    """Return sum.\n\n    Args: a, b\n    """\n    return a + b'],
  ['deletion', 'def addition(a, b):\n    return a + b\n\nif __name__ == "__main__":\n    print(addition(2, 3))\n', originalLine, ''],
  ['unicode', 'def addition(a, b):\n    return a + b\n', originalLine, '    # Addition de valeurs 🙂\n    return a + b'],
  ['insert after EOF without LF', 'def addition(a, b):\n    return a + b', originalLine, '    return a + b\n    # end without LF'],
];
function getPlan(before, oldText, newText) {
  return createCodeFixPreview({repository:'touhaf00/contextguard-demo', issue_number:2,
    issue_fingerprint:'a'.repeat(64), base_branch:'main', base_commit_sha:'b'.repeat(40),
    files:[{path:'app.py',content:before,git_blob_sha:'c'.repeat(40),mode:'100644'}],allowed_paths:['app.py']},
  {title:'Document addition in app.py',description:'A narrow documentation-only change to existing code.',
    edits:[{path:'app.py',old_text:oldText,new_text:newText}]});
}
for (const [name,before,oldText,newText] of cases) {
  test(`Code fix: sealed diff matches committed bytes: ${name}`, () => {
    const plan=getPlan(before,oldText,newText);
    assertCodeFixPlanIntegrity(plan);
    const ch=plan.files[0];
    const applied=applyStrictUnifiedDiff('app.py',before,ch.diff);
    assert.equal(applied.ok,true, `failed to apply ${name}: ${JSON.stringify(applied)}\n${ch.diff}`);
    assert.equal(applied.after,ch.after_content);
    const proof=computeCodeFixAfterStateEvidence({path:'app.py',observedBefore:before,diff:ch.diff,
      sealedAfterSha256:ch.after_sha256,contentToCommit:ch.after_content});
    assert.equal(proof.diff_result_sha256_equals_sealed_after_sha256,true);
    assert.equal(proof.content_to_be_committed_sha256_equals_sealed_after_sha256,true);
    assert.equal(proof.content_to_be_committed_equals_diff_result,true);
  });
}
