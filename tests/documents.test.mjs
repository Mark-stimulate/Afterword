import test from 'node:test';
import assert from 'node:assert/strict';
import {describeDocument,cleanDocuments,documentParts,uploadDocument,DOCUMENT_BYTES,DOCUMENT_LIFETIME} from '../src/documents.mjs';
import {contextFor,newChat,importText,encryptBackup,decryptBackup} from '../src/core.mjs';
const at=Date.parse('2026-11-17T12:00:00Z');
const document=(i=1)=>({id:'file-api-synthetic-'+i,name:'虚构材料.txt',bytes:12,purpose:'user_data',expiresAt:Math.floor(at/1000)+3600});

test('documents choose official parsing purpose and reject unsupported or oversized input',()=>{
 assert.equal(describeDocument({name:'论文.PDF',size:12}).purpose,'text_recognition');
 assert.equal(describeDocument({name:'报告.docx',size:12},true).purpose,'rich_layout_recognition');
 for(const name of ['notes.md','table.xlsx','story.epub','test.py'])assert.equal(describeDocument({name,size:12}).purpose,'user_data');
 for(const spec of [{name:'records.zip',size:12},{name:'run.exe',size:12},{name:'empty.txt',size:0},{name:'large.pdf',size:DOCUMENT_BYTES+1}])assert.throws(()=>describeDocument(spec));
});

test('upload uses direct official multipart request, purpose first, and explicit expiration',async()=>{
 const file=new File(['synthetic data'],'虚构材料.txt',{type:'text/plain'});let calls=0;
 const result=await uploadDocument(file,'synthetic-not-real',{fetchImpl:async(url,req)=>{
  calls++;assert.equal(url,'https://api.deepseek.com/files');assert.equal(req.method,'POST');assert.deepEqual(req.headers,{Authorization:'Bearer synthetic-not-real'});
  const entries=[...req.body.entries()];assert.equal(entries[0][0],'purpose');assert.equal(entries[0][1],'user_data');assert.equal(entries.at(-1)[0],'file');assert.equal(await req.body.get('file').text(),'synthetic data');assert.equal(req.body.get('expires_after[seconds]'),String(DOCUMENT_LIFETIME));
  return new Response(JSON.stringify({id:'file-api-synthetic-1',expires_at:Math.floor(at/1000)+3600}));
 }});
 assert.equal(calls,1);assert.equal(result.expiresAt,Math.floor(at/1000)+3600);assert.equal(result.name,file.name);assert.ok(!JSON.stringify(result).includes('synthetic-not-real'));assert.ok(!JSON.stringify(result).includes('synthetic data'));
});

test('upload failures are not retried and parent cancellation reaches the request',async()=>{
 const file=new File(['x'],'report.pdf');let calls=0;
 await assert.rejects(uploadDocument(file,'synthetic',{fetchImpl:async()=>{calls++;return new Response('{}',{status:402});}}),/余额不足/);assert.equal(calls,1);
 await assert.rejects(uploadDocument(file,'synthetic',{fetchImpl:async()=>new Response(JSON.stringify({id:'file-api-synthetic-1'}))}),/引用无效/);
 const ctl=new AbortController();let began;
 const ready=new Promise(r=>began=r);
 const pending=uploadDocument(file,'synthetic',{signal:ctl.signal,fetchImpl:async(url,req)=>{began();return new Promise((resolve,reject)=>req.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true}));}});
 await ready;ctl.abort();await assert.rejects(pending,{name:'AbortError'});
 await assert.rejects(uploadDocument(file,'synthetic',{fetchImpl:async()=>new Response(JSON.stringify({id:'https://bad.example/file'}))}),/引用无效/);
});

test('invalid imported references never become network URLs and expired files become explicit placeholders',()=>{
 for(const value of [[{...document(),id:'../../other'}],[{...document(),purpose:'unknown'}],Array(5).fill(document())])assert.throws(()=>cleanDocuments(value));
 assert.deepEqual(documentParts([document()],at),[{type:'file',file_id:document().id}]);
 assert.match(documentParts([document()],at+3600001)[0].text,/已过期/);
 assert.match(documentParts([{...document(),deleted:true}],at)[0].text,/已删除/);
});

test('file-only messages and recent history preserve references and cap the request at 20 documents',()=>{
 const c=newChat();for(let i=0;i<12;i++){c.messages.push({role:'user',content:'',documents:[document(i*2),document(i*2+1)]},{role:'assistant',content:'合成回复'});}
 const messages=contextFor(c,'',{documents:[document(90),document(91)],now:new Date(at),timeZone:'UTC'});
 assert.equal(messages[1].role,'user');assert.equal(messages.at(-1).content.length,2);
 const refs=messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='file');assert.equal(refs.length,20);
 assert.ok(!refs.some(p=>p.file_id==='file-api-synthetic-0'));
});

test('own encrypted backup retains file metadata, but generic imports cannot inject file references',async()=>{
 const c=newChat();c.messages=[{role:'user',content:'',documents:[document()]}];
 const encrypted=await encryptBackup([c],'synthetic-backup-pass');const restored=importText(await decryptBackup(encrypted,'synthetic-backup-pass'),'backup.json');
 assert.deepEqual(restored[0].messages[0].documents,c.messages[0].documents);
 const generic=importText(JSON.stringify({messages:[{role:'user',content:'hello',documents:[document()]}]}),'generic.json');assert.equal(generic[0].messages[0].documents,undefined);
});
