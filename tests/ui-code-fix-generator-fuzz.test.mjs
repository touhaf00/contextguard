import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodeFixPreview} from '../dist/api/ui/code-fix-plan.js';
import {applyStrictUnifiedDiff} from '../dist/api/ui/code-fix-after-state.js';

let seed = 0x4271b23;
function rand(n) {seed = (Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
const fragments = ['alpha','beta','gamma','delta','🍀','', '# code', '\\ No newline at end of file','--- a/f','+++ b/f'];
function rndLine(){return 'prefix_'+fragments[rand(fragments.length)]+'_'+rand(9999);}
function source(i){
  const p=Array.from({length:rand(8)},rndLine);
  const s=Array.from({length:rand(8)},rndLine);
  const tail = (i%2===0?'\n':'');
  return p.join('\n') + (p.length?'\n':'') + 'target_unique_line_123456789' + (s.length?'\n'+s.join('\n'):'') + tail;
}
const replacements=[
'fixed_unique_line_123456789',
'new_line_123456789\nextra',
'\nnew_line_123456789',
'fixed\nnew_line_123456789\n',
'fixed_unique_line_123456789\n',
'fixed_unique_line_123456789\n\n',
'first_line\nsecond_line\n\nthird_line',
'😃 rewritten line',
];
test('Code fix: deterministic corpus: 512 different sealed plans round-trip through strict diff proof',()=>{
for(let i=0;i<512;i++){
  const before=source(i),newText=replacements[rand(replacements.length)];
  const plan=createCodeFixPreview({repository:'touhaf00/contextguard-demo',issue_number:2,
    issue_fingerprint:'a'.repeat(64),base_branch:'main',base_commit_sha:'b'.repeat(40),
    files:[{path:'app.py',content:before,git_blob_sha:'c'.repeat(40),mode:'100644'}],allowed_paths:['app.py']},
    {title:'Fix code in existing file',description:'Fix small code issue and include a clear explanation of the changed code.',
      edits:[{path:'app.py',old_text:'target_unique_line_123456789',new_text:newText}]});
  const ch=plan.files[0];
  const applied=applyStrictUnifiedDiff('app.py',before,ch.diff);
  assert.equal(applied.ok,true,`case ${i}: ${JSON.stringify(applied)}\nDIFF:\n${ch.diff}`);
  assert.equal(applied.after,ch.after_content,`case ${i} after-file mismatch`);
}
});
