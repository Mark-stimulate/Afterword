import test from 'node:test';
import assert from 'node:assert/strict';
import {newChat,editedBranch,contextFor,importText,encryptBackup,decryptBackup} from '../src/core.mjs';
const file={id:'file-api-synthetic-edit',name:'合成资料.txt',bytes:12,purpose:'user_data',expiresAt:4102444800};
const seed=()=>({...newChat('合成编辑测试'),messages:[{role:'user',content:'原来的问题'},{role:'assistant',content:'原来的回答'},{role:'user',content:'后续问题'},{role:'assistant',content:'后续回答'}]});

test('resending an earlier user message archives the entire old branch without mutating it',()=>{
 const c=seed(),before=JSON.stringify(c);const edit=editedBranch(c,0,{role:'user',content:'修改后的问题',documents:[file]});
 assert.equal(JSON.stringify(c),before);assert.equal(edit.messages.length,1);assert.equal(edit.messages[0].content,'修改后的问题');
 assert.deepEqual(edit.revisions[0].messages,c.messages);assert.deepEqual(edit.messages[0].documents,[file]);
 const context=contextFor({...c,...edit},'继续');assert.ok(!JSON.stringify(context).includes('后续回答'));assert.ok(!JSON.stringify(context).includes('原来的问题'));
});

test('editing the last user turn keeps its preceding history and supports attachment-only input',()=>{
 const c=seed(),edit=editedBranch(c,2,{role:'user',content:'',documents:[file]});
 assert.deepEqual(edit.messages.slice(0,2),c.messages.slice(0,2));assert.equal(edit.messages.length,3);assert.deepEqual(edit.messages[2].documents,[file]);
 const second=editedBranch({...c,...edit},2,{role:'user',content:'再修改'});assert.equal(second.revisions.length,2);assert.equal(second.revisions[1].messages[2].content,'');
});

test('invalid edits never replace the original conversation',()=>{
 const c=seed(),before=JSON.stringify(c);
 for(const index of [-1,1,10,0.5])assert.throws(()=>editedBranch(c,index,{role:'user',content:'x'}));
 for(const message of [{role:'assistant',content:'x'},{role:'user',content:'  '},{role:'user',content:'x'.repeat(50001)}])assert.throws(()=>editedBranch(c,0,message));
 assert.equal(JSON.stringify(c),before);
});

test('own encrypted backups retain complete revision messages and files; generic imports omit revisions',async()=>{
 const c=seed();Object.assign(c,editedBranch(c,0,{role:'user',content:'带文件的新问题',documents:[file]}));Object.assign(c,editedBranch(c,0,{role:'user',content:'第二次修改'}));
 const backup=await encryptBackup([c],'synthetic-edit-backup');const restored=importText(await decryptBackup(backup,'synthetic-edit-backup'),'backup.json')[0];
 assert.equal(restored.revisions.length,2);assert.equal(restored.revisions[0].messages.length,4);assert.deepEqual(restored.revisions[1].messages[0].documents,[file]);
 assert.ok(!JSON.stringify(contextFor(restored,'继续')).includes('后续回答'));
 const generic=importText(JSON.stringify(c),'generic.json')[0];assert.equal(generic.revisions,undefined);
});
