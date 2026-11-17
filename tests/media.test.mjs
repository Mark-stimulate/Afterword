import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanImages,cleanAnnotations,sourcesFor,chatRequest,applyChunk,previewMessages,ttsRequest,encodeWav,resampleVoice,validateWav} from '../src/media.mjs';
import {newChat,contextFor,importText,encryptBackup,decryptBackup} from '../src/core.mjs';
const image={name:'合成像素.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8XsAAAAASUVORK5CYII='};
const annotation={type:'url_citation',url_citation:{url:'https://example.com/',title:'示例',start_index:0,end_index:2}};
test('image-only turns retain valid images; context caps images without splitting pairs',()=>{
 const c=newChat();for(let i=0;i<6;i++)c.messages.push({role:'user',content:'',images:[image,image]},{role:'assistant',content:'说明'});
 const ctx=contextFor(c,'',{images:[image,image,image,image]});assert.equal(ctx.length,6);assert.equal(ctx[1].role,'user');assert.equal(ctx.at(-1).content.length,4);assert.equal(ctx.filter(m=>Array.isArray(m.content)).reduce((n,m)=>n+m.content.filter(p=>p.type==='image_url').length,0),8);
 c.messages.push({role:'assistant',content:'未完成',incomplete:true});assert.ok(!JSON.stringify(contextFor(c,'续写')).includes('未完成'));
});
test('invalid image types, remote tracking images and oversized lists rejected',()=>{
 for(const data of ['data:image/svg+xml;base64,PHN2Zz4=','https://example.com/pixel.png','data:image/jpeg;base64,aGVsbG8='])assert.throws(()=>cleanImages([{data}]));
 assert.throws(()=>cleanImages(Array(5).fill(image)));assert.equal(cleanImages([image])[0].data,image.data);
});
test('multimodal backup restores images, references and memories; legacy v1 still works',async()=>{
 const c=newChat('合成测试');c.memory='示例记忆';c.messages=[{role:'user',content:'',images:[image]},{role:'assistant',content:'🌸你好',annotations:[annotation],server_tool_calls:[{index:0,calls:[{status:'completed',page:{url:'https://example.com/',title:'示例'},signature:'synthetic-fixture'}]}]}];
 const backup=await encryptBackup([c],'synthetic-password');const restored=importText(await decryptBackup(backup,'synthetic-password'),'backup.json')[0];assert.deepEqual(restored.messages[0].images,[image]);assert.deepEqual(restored.messages[1].annotations,[annotation]);assert.equal(restored.memory,c.memory);assert.deepEqual(restored.messages[1].server_tool_calls,c.messages[1].server_tool_calls);
 assert.equal(importText(JSON.stringify({format:'xuye-backup',version:1,chats:[newChat()]}),'old.json').length,1);
 assert.throws(()=>importText('{"format":"xuye-backup","version":99,"chats":[]}','new.json'));
});
test('web stays opt-in; request preview hides base64 and signatures',()=>{
 const c=newChat();c.messages=[{role:'user',content:'你好'},{role:'assistant',content:'回复',server_tool_calls:[{index:0,calls:[]}]}];
 const off=contextFor(c,'new',{images:[image]});assert.ok(!off[2].server_tool_calls);assert.ok(!chatRequest(off).tools);
 const on=contextFor(c,'new',{webEnabled:true});assert.deepEqual(on[2].server_tool_calls,c.messages[1].server_tool_calls);assert.deepEqual(chatRequest(on,true).tools.map(t=>t.type),['deepseek_web_search','deepseek_read_url']);assert.equal(chatRequest(on).safety_check.level,'high');assert.ok(!JSON.stringify(previewMessages(off)).includes('iVBOR'));
});
test('stream handles tool status, final citations, usage and blocked responses',()=>{
 const r={content:''};applyChunk(r,{choices:[{server_tool_event:{type:'call_started'}}]});assert.match(r.toolStatus,/查找/);
 const tools=[{index:0,calls:[{status:'completed',sources:[{url:'https://example.com/',title:'示例'}]}]}];
 assert.equal(applyChunk(r,{choices:[{delta:{content:'你好',annotations:[annotation],server_tool_calls:tools},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:2}}),true);assert.equal(r.toolStatus,undefined);assert.deepEqual(r.server_tool_calls,tools);assert.equal(sourcesFor(r).length,1);assert.equal(r.usage.prompt_tokens,3);
 assert.throws(()=>applyChunk(r,{choices:[{delta:{},finish_reason:'content_filter'}]}));assert.equal(r.content,'');assert.deepEqual(r.annotations,[]);
});
test('sources never create script links or silently load third-party media',()=>{
 assert.equal(cleanAnnotations([{type:'url_citation',url_citation:{url:'javascript:alert(1)'}}]).length,0);
 const m={annotations:[annotation],server_tool_calls:[null,{calls:[null,{status:'completed',sources:[{url:'data:text/html,hi'},{url:'https://u:p@example.com'},{url:'https://example.com/'}]}]}]};assert.deepEqual(sourcesFor(m),[{url:'https://example.com/',title:'示例'}]);
});
test('TTS limits account for Chinese characters and normalize voice',()=>{
 assert.throws(()=>ttsRequest(''));assert.throws(()=>ttsRequest('语'.repeat(5001)));assert.equal(ttsRequest('语'.repeat(5000),'tide').voice_id,'tide');assert.equal(ttsRequest('hi','unknown').voice_id,'stella');
});
test('microphone output is mono 16-bit PCM WAV with bounded duration',()=>{
 const raw=new Float32Array(48000).fill(.5),samples=resampleVoice(raw,48000);assert.equal(samples.length,16000);const wav=encodeWav(samples,16000),v=new DataView(wav);assert.equal(wav.byteLength,32044);assert.equal(v.getUint32(24,true),16000);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),16);assert.equal(v.getInt16(44,true),16383);assert.ok(44+16000*115*2<8*1024*1024);
});

test('truncated or non-audio TTS results are rejected before playback',()=>{const wav=encodeWav(new Float32Array(100),16000);assert.doesNotThrow(()=>validateWav(wav));assert.throws(()=>validateWav(wav.slice(0,-20)),/未完成/);assert.throws(()=>validateWav(new TextEncoder().encode('not an audio file').buffer));});
