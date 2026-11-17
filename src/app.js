import {createMediaUI} from './media-ui.mjs';
import {chatRequest,applyChunk,previewMessages} from './media.mjs';
import {readDeepSeekZip} from './zip-import.mjs';
import {newChat,importText,contextFor,readSSE,encryptBackup,decryptBackup} from './core.mjs';
import {verifyLicense,licenseActive} from './license.mjs';
import {LICENSE_CHANNEL,PUBLIC_KEY} from './build-config.mjs';
import {palettes,fonts,defaultAppearance,cleanAppearance,themeVars} from './appearance.mjs';
const $=s=>document.querySelector(s), el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;};
let db,chats=[],current=null,key='',busy=false,controller=null,toastTimer;
let mediaUI,dialogReturn=null;
let licenseInfo=null,appearance={...defaultAppearance},fullSearch=false;
function isPro(){return licenseActive(licenseInfo);}
function loadLocal(name,fallback){try{return JSON.parse(localStorage.getItem('xuye-'+name))??fallback;}catch{return fallback;}}
function storeLocal(name,value){try{localStorage.setItem('xuye-'+name,JSON.stringify(value));}catch{throw Error('浏览器无法保存设置，请检查本地空间或权限');}}
function applyAppearance(value){appearance=cleanAppearance(value);for(const [name,v]of Object.entries(themeVars(appearance)))document.documentElement.style.setProperty(name,v);document.documentElement.dataset.night=String(appearance.night);}
applyAppearance(loadLocal('appearance',defaultAppearance));
async function loadLicense(){const saved=loadLocal('license',null);if(saved)try{licenseInfo=await verifyLicense(saved,PUBLIC_KEY,{channel:LICENSE_CHANNEL});}catch{licenseInfo=null;}updatePlan();}
function updatePlan(){const b=$('#licenseBtn');if(b)b.textContent=isPro()?(licenseInfo.kind==='community'?'已解锁 · 社区免费授权':'已解锁 · 站点授权'):'免费基础版 · 高级功能';const toggle=$('#fullSearch');if(toggle)toggle.checked=fullSearch&&isPro();}
const chat=()=>chats.find(c=>c.id===current);
function toast(t){($('#dialog').open?$('#dialog'):document.body).append($('#toast'));$('#toast').textContent=t;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
async function initDB(){db=await new Promise((resolve,reject)=>{const r=indexedDB.open('xuye-local-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const data=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('chats');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});chats=Array.isArray(data)?data:[];current=chats[0]?.id||null;render();}
function persist(){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(chats,'chats');tx.oncomplete=resolve;tx.onerror=()=>reject(Error('本地保存失败，请立即导出备份。浏览器可能没有足够空间。'));});}
async function save(){try{await persist();}catch(e){toast(e.message);throw e;}}
function modal(title){mediaUI?.cleanup();closeSidebar();$('#dialogTitle').textContent=title;$('#dialogBody').replaceChildren();if(!$('#dialog').open)$('#dialog').showModal();$('#dialog').scrollTop=0;return $('#dialogBody');}
function close(){$('#dialog').close();}
function button(parent,text,fn,cls=''){const b=el('button',text,cls);b.type='button';b.onclick=async()=>{try{await fn();}catch(e){toast(e.message||'操作失败');}};parent.append(b);return b;}
function field(parent,label,type='text',value=''){const id='f'+crypto.randomUUID();const l=el('label',label);l.htmlFor=id;const i=el(type==='textarea'?'textarea':'input');i.id=id;if(type!=='textarea')i.type=type;i.value=value;parent.append(l,i);return i;}
function note(parent,text,cls='subtle'){parent.append(el('p',text,cls));}
function setBusy(v){busy=v;$('#sendBtn').hidden=v;$('#stopBtn').hidden=!v;$('#prompt').disabled=v;for(const id of ['newChat','deleteBtn','memoryBtn','importBtn','backupBtn','settingsBtn','manageBtn','demoBtn','welcomeImport','libraryBtn','imageBtn','voiceBtn','webBtn'])$('#'+id).disabled=v;}
function render(){
 const c=chat();$('#chatTitle').textContent=c?.title||'新的篇章';$('#count').textContent=chats.length;$('#welcome').hidden=!!c?.messages.length;$('#connection').textContent=key?'Key 已配置':'未配置 API';
 const query=$('#search').value.trim().toLocaleLowerCase();const nav=$('#conversations');nav.replaceChildren();for(const c of chats.filter(c=>c.title.toLocaleLowerCase().includes(query)||(fullSearch&&isPro()&&(c.memory.toLocaleLowerCase().includes(query)||c.messages.some(m=>m.content.toLocaleLowerCase().includes(query)))))){const item=button(nav,c.title,()=>{if(busy)return toast('请先停止当前生成');current=c.id;$('#prompt').value='';mediaUI.resetDraft();render();closeSidebar();},c.id===current?'selected':'');item.setAttribute('aria-label',c.title);item.title=c.title;item.replaceChildren(el('span',c.title,'conversation-title'));if(query&&!c.title.toLocaleLowerCase().includes(query)){const match=c.messages.find(m=>m.content.toLocaleLowerCase().includes(query))?.content||c.memory;const p=match.toLocaleLowerCase().indexOf(query);item.append(el('small','…'+match.slice(Math.max(0,p-12),p+45),'search-excerpt'));}}
 requestAnimationFrame(updateTitleOverflow);updatePlan();
 const list=$('#messages');list.replaceChildren();for(const m of c?.messages||[]){
  const article=el('article',undefined,'message '+m.role),head=el('div',m.role==='user'?'你 / YOU':'拾语 · Afterword / AI 生成','who');
  if(m.content)button(head,'复制',async()=>{await navigator.clipboard.writeText(m.content);toast('已复制');},'copy');
  if(m.role==='assistant'&&m.content&&!m.incomplete){const read=button(head,'朗读',()=>mediaUI.readAloud(m),'copy');read.disabled=busy;}
  const content=el('div',undefined,'content');if(m.content)mediaUI.renderContent(content,m);else if(m.role==='assistant')content.textContent=m.error?'这次没有生成可显示的回复。':'正在等待回复…';
  article.append(head,content);mediaUI.renderExtras(article,m);
  if(m.incomplete)article.append(el('div','未完成回复，不会作为后续上下文发送。','meta'));if(m.error)article.append(el('p',m.error,'error'));list.append(article);
 }
 $('#contextLine').textContent=`发送内容：当前消息 + 最近最多 20 条完整消息（历史最多 4 万字符，含本轮最多 8 张图片）${c?.memoryEnabled&&c.memory?' + 当前记忆卡':''}。`;
 mediaUI?.draw();
}
async function makeChat(){mediaUI?.resetDraft();const c=newChat();chats.unshift(c);current=c.id;await save();render();$('#prompt').focus();}
function preview(){mediaUI.assertReady();const c=chat()||newChat(),options=mediaUI.options(),b=modal('本次会发送什么');note(b,'以下消息将从浏览器直接发送至 DeepSeek。图片数据在此用占位说明代替；实际请求包含图片。','notice');note(b,options.webEnabled?'联网已开启：模型可搜索、读取网页，可能额外计费。':'联网关闭：本次不启用搜索或读取网页工具。');const msgs=contextFor(c,$('#prompt').value.trim(),options);b.append(el('pre',JSON.stringify(previewMessages(msgs),null,2)));note(b,'这不是全部历史。官方 ZIP 中的附件与其他分支不会自动导入。');}

function managePanel(){dialogReturn=null;const b=modal('设置与管理');$('#closeDialog').setAttribute('aria-label','关闭');note(b,'连接、外观和数据管理都在这里。');const menu=el('div',undefined,'manage-menu');b.append(menu);for(const [label,open]of [['连接与 API 设置',settings],['颜色与阅读',appearancePanel],['图片、语音与联网',()=>mediaUI.settings()],['用量与余额',usagePanel],['备份与恢复',backup],['高级功能 · 授权',licensePanel],['使用指南与数据说明',guide]])button(menu,label,()=>{open();dialogReturn=managePanel;$('#closeDialog').setAttribute('aria-label','返回设置与管理');});}
function usagePanel(){
 const b=modal('用量与余额');note(b,'只有打开本页才显示用量；余额仅在你点击查询后，通过浏览器直连 DeepSeek 官方 API。','notice');
 let input=0,output=0,count=0;for(const c of chats)for(const m of c.messages||[]){const u=m.usage;if(u&&Number.isFinite(u.prompt_tokens)&&Number.isFinite(u.completion_tokens)&&u.prompt_tokens>=0&&u.completion_tokens>=0){input+=u.prompt_tokens;output+=u.completion_tokens;count++;}}
 note(b,`本设备当前保存的用量：${count} 次有记录的回复，输入 ${input.toLocaleString()} / 输出 ${output.toLocaleString()} token。`,'test-result');note(b,'这是聊天文字与图片的 token 记录，不包含语音识别、朗读、搜索和网页读取的工具费用，也并非账户总用量；导入、删除、停止生成或未返回用量的请求可能不计入，不能据此计算账单。');
 const status=el('p','点击下方按钮查询当前账号余额。','test-result');status.setAttribute('role','status');status.setAttribute('aria-live','polite');b.append(status);
 button(b,'查询官方余额',async()=>{if(!key){status.textContent='请先在「连接与 API 设置」中填写并使用 Key。';return;}status.textContent='正在查询官方余额…';const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);try{const r=await fetch('https://api.deepseek.com/user/balance',{headers:{Authorization:'Bearer '+key},signal:ctl.signal});if(!r.ok)throw Error(apiError(r.status));const data=await r.json();if(!Array.isArray(data.balance_infos)||!data.balance_infos.length)throw Error('官方未返回可显示的余额信息。');status.textContent=data.balance_infos.map(x=>`${String(x.currency||'货币')}：可用 ${String(x.total_balance??'—')}（赠金 ${String(x.granted_balance??'—')}，充值 ${String(x.topped_up_balance??'—')}）`).join('；');}catch(e){status.textContent=e.name==='AbortError'?'查询超时，请检查网络。':e.message==='Failed to fetch'?'无法直连官方余额接口，请检查网络或浏览器跨域限制。':e.message;}finally{clearTimeout(timer);}});
 const a=el('a','前往 DeepSeek 开放平台查看账户用量与账单');a.href='https://platform.deepseek.com/';a.target='_blank';a.rel='noopener noreferrer';b.append(a);
}
function settings(){const b=modal('连接你的 DeepSeek');note(b,'Key 默认只保存在当前页面内存，刷新或关闭后需要重新填写。不要把 Key 发给我们。','notice');const k=field(b,'API Key','password',key);k.autocomplete='off';k.spellcheck=false;
 const row=el('div',undefined,'row');b.append(row);button(row,'显示 / 隐藏',()=>k.type=k.type==='password'?'text':'password');button(row,'使用此 Key',()=>{key=k.value.trim();k.value='';render();close();toast(key?'Key 已在当前页面配置':'Key 已移除');},'primary');button(row,'清除 Key',()=>{key='';k.value='';render();toast('Key 已从本页面移除');});
 const result=el('p','连接测试只请求官方模型列表，不生成回复。','test-result');result.setAttribute('role','status');result.setAttribute('aria-live','polite');b.append(result);button(b,'测试连接',async()=>{if(!k.value.trim()){result.textContent='请先填写 Key，再测试连接。';return;}result.textContent='正在连接官方 API…';const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),15000);try{const r=await fetch('https://api.deepseek.com/models',{headers:{Authorization:'Bearer '+k.value.trim()},signal:ctl.signal});if(!r.ok)throw Error(apiError(r.status));await r.json();result.textContent='连接成功。点击「使用此 Key」后可开始聊天。';}catch(e){result.textContent=e.name==='AbortError'?'连接超时，请检查网络。':e.message==='Failed to fetch'?'未能直连：请检查网络或浏览器跨域限制。本工具不会自动转发 Key。':e.message;}finally{clearTimeout(timer);}});
 const a=el('a','打开 DeepSeek 官方开放平台');a.href='https://platform.deepseek.com/';a.target='_blank';a.rel='noopener noreferrer';b.append(a);note(b,'固定连接官方 API，使用 deepseek-flash，非思考模式，单次最多 4096 输出 token。费用以 DeepSeek 官方账单为准。');}
function apiError(s){return ({401:'Key 无效或已撤销，请检查配置。',402:'API 账户余额不足，请前往官方平台核实。',429:'请求过于频繁或触及 API 限制，请稍后重试。',400:'API 参数或上下文不被接受，请减少内容后重试。',403:'API 拒绝访问，请检查账号权限。'}[s]||`官方 API 返回 HTTP ${s}，请稍后重试。`);}
async function send(event){event?.preventDefault();if(busy)return;mediaUI.assertReady();const text=$('#prompt').value.trim(),options=mediaUI.options();if(!text&&!options.images.length)return;if(!key){settings();return;}
 setBusy(true);if(!chat()){const fresh=newChat();chats.unshift(fresh);current=fresh.id;}const c=chat(),oldTitle=c.title,payload=contextFor(c,text,options);c.messages.push({role:'user',content:text,...(options.images.length?{images:options.images}:{})});if(c.title==='新的篇章')c.title=text.slice(0,24)||'图片里的故事';try{await save();}catch(e){c.messages.pop();c.title=oldTitle;setBusy(false);throw e;}$('#prompt').value='';mediaUI.sent();
 const reply={role:'assistant',content:'',incomplete:true};c.messages.push(reply);setBusy(true);render();controller=new AbortController();let timeout=setTimeout(()=>controller.abort(),90000);let finished=false;let lastPaint=0;
 try{const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(chatRequest(payload,options.webEnabled)),signal:controller.signal});if(!r.ok)throw Error(apiError(r.status));if(!r.body)throw Error('浏览器未返回响应流');
 const done=await readSSE(r.body,data=>{clearTimeout(timeout);timeout=setTimeout(()=>controller.abort(),90000);if(applyChunk(reply,data))finished=true;if(Date.now()-lastPaint>90){render();$('#chatScroll').scrollTop=$('#chatScroll').scrollHeight;lastPaint=Date.now();}});
 if(!done&&!finished)throw Error('连接提前结束，已保留收到的部分回复。');if(!reply.content)throw Error('未收到可显示的文本回复。');reply.incomplete=false;
 }catch(e){reply.error=e.name==='AbortError'?'已停止或连接超时。部分回复已保留；已发生的 API 用量仍可能计费。':e.message==='Failed to fetch'?'直连失败：检查网络或浏览器跨域限制。未使用代理转发。':e.message;}finally{clearTimeout(timeout);delete reply.toolStatus;controller?.abort();controller=null;try{await save();}catch{}setBusy(false);render();$('#chatScroll').scrollTop=$('#chatScroll').scrollHeight;}
}
async function memory(){if(!chat())await makeChat();const c=chat(),b=modal('这段对话的记忆');note(b,'由你编辑和确认。启用后，整张记忆卡会随本轮消息发送给 DeepSeek。记忆可能不完整，请及时修正。','notice');const input=field(b,'人物、经历、故事设定或交流偏好','textarea',c.memory);input.maxLength=20000;input.placeholder='例如：小说主人公叫林舟，故事发生在沿海小镇…';const label=el('label');const check=el('input');check.type='checkbox';check.checked=c.memoryEnabled;label.append(check,document.createTextNode(' 在当前对话启用这张记忆卡'));b.append(label);button(b,'保存记忆',async()=>{c.memory=input.value;c.memoryEnabled=check.checked;await save();close();render();toast('记忆卡已保存到当前设备');},'primary');note(b,'本版仅提供手动记忆编辑，不会在导入后自动调用 API 总结，也不会暗中上传历史。');}
function importer(){
 const b=modal('带来一段对话');note(b,'直接选择 DeepSeek 导出的 ZIP，也可以选择单个 JSON、TXT、MD 或拾语 · Afterword 备份。文件只在本设备解析，不会因导入调用 API。','notice');
 note(b,'ZIP 中仅导入当前分支的文字问答；图片、附件、工具调用、思考过程及其他分支不会导入。请保留原始导出包。ZIP 最大 64 MB，最多 500 段会话。');
 const file=field(b,'选择文件','file');file.accept='.zip,.txt,.md,.json';const results=el('div');b.append(results);let generation=0;
 file.onchange=async()=>{const run=++generation;try{const f=file.files[0];if(!f)return;results.replaceChildren();note(results,'正在本地读取，请稍候…');let candidates=[],warnings=[];
 if(/\.zip$/i.test(f.name)){if(f.size>64*1024*1024)throw Error('ZIP 超过 64 MB，请先解压并分批导入 JSON');const archive=await readDeepSeekZip(await f.arrayBuffer());warnings=archive.warnings;for(const item of archive.sessions){try{candidates.push(...importText(item.text,item.name.split('/').pop()));}catch(e){warnings.push(`${item.name}：${e.message}`);}if(candidates.length>500)throw Error('最多一次导入 500 段对话');}}
 else{if(f.size>128*1024*1024)throw Error('单个文件超过 128 MB，请分批备份或导入');const raw=await f.text();let json;try{json=JSON.parse(raw);}catch{}if(json?.format==='xuye-encrypted'){if(run===generation&&file.isConnected)restorePrompt(raw);return;}candidates=importText(raw,f.name);}
 if(run!==generation||!file.isConnected)return;results.replaceChildren();note(results,`识别到 ${candidates.length} 段对话，${warnings.length} 个文件未能读取。选择后新增导入，不覆盖已有记录。`,'test-result');
 if(warnings.length){const d=el('details'),summary=el('summary','查看未能读取的文件');d.append(summary);for(const warning of warnings)note(d,warning,'error');results.append(d);}
 const checked=[];for(const c of candidates){const l=el('label',undefined,'importitem'),i=el('input');i.type='checkbox';i.checked=true;l.append(i,document.createTextNode(`${c.title} · ${c.messages.length} 条`));results.append(l);checked.push({i,c});}
 if(candidates.length)button(results,'确认导入所选对话',async()=>{const chosen=checked.filter(x=>x.i.checked).map(x=>x.c);if(!chosen.length)throw Error('请至少选择一段对话');const previous=[...chats];chats.unshift(...chosen);try{await save();}catch(e){chats=previous;throw e;}current=chosen[0].id;mediaUI.resetDraft();close();render();toast('已导入，原有对话保留');},'primary');
 }catch(e){if(run===generation&&file.isConnected)results.replaceChildren(el('p',e.message,'error'));}};
}
function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function backup(){const b=modal('备份与恢复');note(b,'记录只存在此浏览器的当前站点中。清理浏览器、更换地址或更换设备可能导致记录不可访问。备份不含 API Key。','notice');const pwd=field(b,'加密备份密码（至少 10 个字符）','password');pwd.autocomplete='new-password';const again=field(b,'再次输入密码','password');again.autocomplete='new-password';button(b,'导出加密备份',async()=>{if(!chats.length)throw Error('目前没有可备份的对话');if(pwd.value!==again.value)throw Error('两次密码不一致');const obj=await encryptBackup(chats,pwd.value);download('afterword-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(obj));pwd.value='';again.value='';toast('已请求浏览器下载备份，请检查下载文件');},'primary');note(b,'使用 AES-GCM 加密。密码丢失无法由我们恢复。浏览器内的聊天数据库本身未进行应用级加密，请保护你的设备。');const row=el('div',undefined,'row');b.append(row);button(row,'导入 / 恢复备份',importer);button(row,'导出明文备份',()=>{if(!confirm('明文备份包含全部聊天正文和记忆。确认导出到本机？'))return;download('afterword-plaintext.json',JSON.stringify({format:'xuye-backup',version:2,chats},null,2));});button(row,'清除本地全部数据',async()=>{if(!confirm('这将删除本设备此站点的所有对话、记忆、主题设置、本地授权和当前 Key。请先备份。确定删除？'))return;const previous=chats;chats=[];try{await save();}catch(e){chats=previous;throw e;}current=null;key='';licenseInfo=null;fullSearch=false;mediaUI.resetDraft();for(const item of ['license','appearance','voice'])localStorage.removeItem('xuye-'+item);applyAppearance(defaultAppearance);close();render();toast('本地对话、记忆、设置和授权已清除；已下载文件不受影响');},'danger');}
function restorePrompt(raw){const b=modal('恢复加密备份');note(b,'恢复将新增导入，不覆盖已有对话。备份不包含 API Key。');const pwd=field(b,'备份密码','password');button(b,'解密并导入',async()=>{const text=await decryptBackup(JSON.parse(raw),pwd.value);const imported=importText(text,'backup.json');const previous=[...chats];chats.unshift(...imported);try{await save();}catch(e){chats=previous;throw e;}current=imported[0]?.id||current;mediaUI.resetDraft();pwd.value='';close();render();toast(`已恢复 ${imported.length} 段对话`);},'primary');}
function guide(){const b=modal('使用指南与数据说明');for(const [title,text] of [
 ['01 · 先体验','点击「先看看示例」无需 Key 即可检查对话、记忆卡和备份；示例完全是虚构的本地内容。'],
 ['02 · 接入 API','到 DeepSeek 官方开放平台注册、了解价格、充值并创建 Key。打开「连接与设置」，在你自己的页面填写 Key。刷新页面后需重新填写。'],
 ['03 · 导入与续聊','导入支持的记录，在「记忆卡」手动补充重要内容。发送前可查看实际请求内容。此版本只发送最近最多 20 条完整消息，历史总长度最多 4 万字符；更早内容需整理进记忆卡。'],
 ['04 · 备份','记录保存在此浏览器此地址的 IndexedDB，未作应用级加密。导出可选择加密备份，Key 不在备份中。请保留密码并测试恢复。'],
 ['数据流','静态服务器仅向浏览器提供应用文件。API 请求从浏览器直连 api.deepseek.com，包含 Key、当前消息及所选上下文；DeepSeek 按其条款处理这些数据。应用无分析统计、无云同步、无自动网络请求。'],
 ['边界','拾语 · Afterword 是第三方测试工具，与 DeepSeek 无隶属或代理关系。API 单独计费；开源不等于已通过独立安全审计。本版支持图片输入、按需联网、语音转写与回复朗读；不含图片生成、支付和自动记忆总结。续聊不能保证恢复原来的风格和全部记忆。'],
 ['遇到问题','不要提交真实 Key 或完整私密聊天。只提供错误类型、浏览器版本和脱敏样例。出现连接失败时，本工具不会自动改用代理。']]){b.append(el('h3',title));note(b,text);}}
$('#closeDialog').onclick=close;$('#dialog').addEventListener('close',()=>{const returnTo=dialogReturn;dialogReturn=null;mediaUI?.cleanup();document.body.append($('#toast'));$('#dialogBody').replaceChildren();$('#closeDialog').setAttribute('aria-label','关闭');if(returnTo)queueMicrotask(returnTo);});$('#newChat').onclick=()=>{closeSidebar();makeChat().catch(e=>toast(e.message));};$('#search').oninput=render;$('#settingsBtn').onclick=settings;$('#memoryBtn').onclick=()=>memory().catch(e=>toast(e.message));$('#previewBtn').onclick=preview;$('#importBtn').onclick=importer;$('#welcomeImport').onclick=importer;$('#backupBtn').onclick=backup;$('#guideBtn').onclick=guide;$('#composer').onsubmit=e=>send(e).catch(e=>toast(e.message));$('#stopBtn').onclick=()=>controller?.abort();$('#menu').onclick=openSidebar;$('#closeSidebar').onclick=()=>closeSidebar(true);$('#sidebarBackdrop').onclick=()=>closeSidebar(true);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#sidebar').classList.contains('open')&&!$('#dialog').open)closeSidebar(true);});window.matchMedia('(max-width: 650px)').addEventListener('change',e=>{if(!e.matches)closeSidebar();});$('#prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send().catch(e=>toast(e.message));}};
$('#deleteBtn').onclick=async()=>{if(!chat()||!confirm('删除当前对话及它的记忆卡？此操作不能撤销。'))return;const previous=chats;chats=chats.filter(c=>c.id!==current);try{await save();}catch{chats=previous;return;}current=chats[0]?.id||null;mediaUI.resetDraft();render();};
$('#demoBtn').onclick=async()=>{mediaUI.resetDraft();const c=newChat('海边书店 · 虚构示例');c.memory='这是虚构的小说创作示例。主角林舟在沿海小镇开了一家旧书店。偏好温暖、克制的叙述。上一幕：她在一本旧航海日志里发现了一张没有寄出的明信片。';c.messages=[{role:'user',content:'我们来写一个关于海边旧书店的故事。主角叫林舟，叙述温暖一点，不要过度煽情。'},{role:'assistant',content:'【本地虚构示例，未调用 API】\n\n黄昏时，林舟把门口的木牌翻到「营业中」。海风吹动桌上的纸页，一张褪色的明信片从旧航海日志里滑了出来。\n\n背面只有一句话：等潮水退去，我们就能看见那条路。\n\n——你可以打开右上角「记忆卡」查看设定，或备份这段对话。配置自己的 Key 后，发送消息即可真正续写。'}];chats.unshift(c);current=c.id;try{await save();render();}catch{}};
function appearancePanel(){
 const original={...appearance},b=modal('给文字，选一种心情');
 note(b,'颜色与阅读设置免费使用。选你喜欢的氛围，不必迎合任何一种风格。');
 const grid=el('div',undefined,'palette-grid');b.append(grid);let draft={...appearance};
 const sample=el('div',undefined,'reading-sample');sample.append(el('small','此刻，只留给文字'),el('p','窗边的灯还亮着。\n你慢慢说，这一页不着急写完。'));
 function refresh(){applyAppearance(draft);for(const item of grid.children)item.setAttribute('aria-pressed',String(item.dataset.palette===draft.palette));}
 for(const p of palettes){const card=button(grid,'',()=>{draft={...draft,palette:p.id,color:p.color,night:p.night};custom.value=p.color;night.checked=p.night;refresh();},'palette');card.dataset.palette=p.id;card.setAttribute('aria-label',p.name);const swatch=el('span',undefined,'swatch');swatch.style.background=p.color;card.append(swatch,el('b',p.name),el('small',p.description));}
 const custom=field(b,'自选主题色','color',draft.color);custom.oninput=()=>{draft.color=custom.value;draft.palette='custom';refresh();};
 const nightlabel=el('label',undefined,'inline-check'),night=el('input');night.type='checkbox';night.checked=draft.night;nightlabel.append(night,document.createTextNode(' 使用深色背景'));b.append(nightlabel);night.onchange=()=>{draft.night=night.checked;refresh();};
 const controls=el('div',undefined,'reading-controls');b.append(controls);
 function select(label,values,value,onchange){const wrap=el('div'),l=el('label',label),input=el('select');input.id='s'+crypto.randomUUID();l.htmlFor=input.id;for(const [v,text]of values){const o=el('option',text);o.value=v;input.append(o);}input.value=String(value);input.onchange=()=>{onchange(input.value);refresh();};wrap.append(l,input);controls.append(wrap);}
 select('文字风格',Object.entries(fonts).map(([k,v])=>[k,v.name]),draft.font,v=>draft.font=v);
 select('聊天字号',[15,17,19,21].map(v=>[v,v+' px']),draft.size,v=>draft.size=+v);
 select('阅读行距',[[1.7,'紧凑'],[2,'舒展'],[2.3,'宽松']],draft.spacing,v=>draft.spacing=+v);
 b.append(sample);note(b,'字体使用设备自带字体，实际效果因设备而异，不下载远程字体。自选色会自动调整按钮对比度。');
 let committed=false;const revert=()=>{if(!committed)applyAppearance(original);};$('#dialog').addEventListener('close',revert,{once:true});
 const row=el('div',undefined,'row');b.append(row);button(row,'保存这份心情',()=>{storeLocal('appearance',draft);committed=true;applyAppearance(draft);close();toast('颜色与阅读设置已保存在本设备');},'primary');button(row,'取消预览',close);button(row,'恢复默认',()=>{draft={...defaultAppearance};custom.value=draft.color;night.checked=draft.night;const selects=controls.querySelectorAll('select');selects[0].value=draft.font;selects[1].value=draft.size;selects[2].value=draft.spacing;refresh();});refresh();
}
function licensePanel(){const b=modal('高级功能 · 本地授权');
 const community=LICENSE_CHANNEL==='community';
 note(b,isPro()?(community?'已解锁 · 社区免费授权':'已解锁 · 站点授权'):'当前为免费基础版','notice');
 note(b,'全文与记忆搜索、保存与套用记忆模板需要有效授权。聊天、图片、语音、联网、阅读设置，以及查看、复制、删除、导出和加密备份始终免费。API 费用由服务方单独收取。');
 if(community){note(b,'这是自行部署版本。下载公开的社区免费授权文件，再在下方导入即可解锁；无需购买。该授权不适用于运营者提供的站点。');const a=el('a','下载社区免费授权');a.href='community.license';a.download='社区免费授权.license';b.append(a);}
 else note(b,'此站点只接受运营者签发的授权，不能使用公开的社区免费授权。请向站点运营者获取 license；本应用没有内置支付入口。');
 if(isPro())note(b,`授权编号：${licenseInfo.id}。适用：0.x 版本。${licenseInfo.expires===null?'无到期日':`有效期至 ${new Date(licenseInfo.expires).toLocaleDateString('zh-CN')}`}。离线验证，不上传设备或聊天数据。`);
 const text=field(b,'粘贴授权文件内容（JSON）','textarea');text.placeholder='粘贴 .license 文件中的完整内容';text.maxLength=20000;
 const file=field(b,'或选择 .license 授权文件','file');file.accept='.license,.json';file.onchange=async()=>{try{const f=file.files[0];if(!f)return;if(f.size>20000)throw Error('授权文件过大');text.value=await f.text();}catch(e){toast(e.message);}};
 const row=el('div',undefined,'row');b.append(row);button(row,'验证并解锁',async()=>{let envelope;try{envelope=JSON.parse(text.value);}catch{throw Error('请粘贴完整的授权 JSON 或选择授权文件');}const verified=await verifyLicense(envelope,PUBLIC_KEY,{channel:LICENSE_CHANNEL});storeLocal('license',envelope);licenseInfo=verified;text.value='';close();render();toast('高级功能已解锁，无需上传聊天数据');},'primary');
 button(row,'移除本机授权',()=>{localStorage.removeItem('xuye-license');licenseInfo=null;fullSearch=false;close();render();toast('已切回免费基础版，记录和已保存模板保留');});
 note(b,'更新或切换站点后，会按当前站点的验签配置重新校验已保存的授权。授权不匹配时，仅关闭高级操作，已有聊天和模板仍保留。');
}

async function libraryPanel(){if(busy)return toast('请先停止当前生成');if(!chat())await makeChat();const c=chat(),b=modal('记忆模板 · '+c.title);note(b,'为同一段对话保留不同的人物设定或故事阶段。套用时替换当前记忆卡；原有模板仍会保留。');
 const cards=c.memoryCards||[];
 if(!cards.length)note(b,'还没有模板。可以先在「记忆卡」里写好设定，再保存成模板。','notice');
 for(const card of cards){const box=el('section',undefined,'template-card');box.append(el('h3',card.title),el('pre',card.content));const row=el('div',undefined,'row');box.append(row);button(row,'复制内容',async()=>{await navigator.clipboard.writeText(card.content);toast('已复制，可粘贴到记忆卡中');});button(row,'套用模板',async()=>{if(!isPro()){licensePanel();return;}if(c.memory&&c.memory!==card.content&&!confirm('这会替换当前记忆卡；尚未保存为模板的内容将被覆盖。继续？'))return;c.memory=card.content;c.memoryEnabled=true;await save();close();render();toast('已套用模板');});button(row,'删除模板',async()=>{if(!confirm('删除此模板？不会删除当前记忆卡。'))return;c.memoryCards=cards.filter(x=>x.id!==card.id);await save();libraryPanel();},'danger');b.append(box);}
 if(!isPro()){button(b,'查看高级解锁方式',licensePanel,'primary');note(b,'模板的查看、复制、删除和备份不受授权限制。');return;}
 const name=field(b,'新模板名称','text');name.maxLength=80;const actions=el('div',undefined,'row');b.append(actions);button(actions,'把当前记忆保存为模板',async()=>{if(!isPro()){licensePanel();return;}if(!name.value.trim())throw Error('请给模板起一个名字');if(!c.memory.trim())throw Error('先到记忆卡写入内容，再保存模板');if(cards.length>=50)throw Error('每段对话最多保存 50 个模板');c.memoryCards=[...cards,{id:crypto.randomUUID(),title:name.value.trim(),content:c.memory}];await save();libraryPanel();toast('模板已保存到本地');},'primary');
}
$('#manageBtn').onclick=managePanel;$('#appearanceBtn').onclick=appearancePanel;$('#quickTheme').onclick=appearancePanel;$('#licenseBtn').onclick=licensePanel;$('#libraryBtn').onclick=()=>libraryPanel().catch(e=>toast(e.message));$('#fullSearch').onchange=e=>{if(e.target.checked&&!isPro()){e.target.checked=false;licensePanel();return;}fullSearch=e.target.checked;render();};
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
mediaUI=createMediaUI({$,el,button,field,note,modal,toast,getKey:()=>key,isBusy:()=>busy,apiError,loadLocal,storeLocal});
loadLicense();
initDB().catch(()=>{modal('本地存储不可用');note($('#dialogBody'),'无法打开浏览器本地数据库。请使用允许本地存储的普通浏览模式后刷新；不要在此状态下输入重要记录。','notice');for(const b of document.querySelectorAll('button'))if(b.id!=='closeDialog')b.disabled=true;});

function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').hidden=false; $('#menu').setAttribute('aria-expanded','true'); $('#closeSidebar').focus(); requestAnimationFrame(updateTitleOverflow); }
function closeSidebar(restoreFocus=false) { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').hidden=true; $('#menu').setAttribute('aria-expanded','false'); if(restoreFocus) $('#menu').focus(); }

function updateTitleOverflow(){for(const title of document.querySelectorAll('.conversation-title')){const distance=Math.max(0,title.scrollWidth-title.parentElement.clientWidth+26);title.style.setProperty('--title-distance',distance+'px');title.classList.toggle('scrolling',distance>1);}}
window.addEventListener('resize',updateTitleOverflow);

// Tapping the reading area dismisses the compact mobile composer without clearing drafts.
$('#chatScroll').addEventListener('pointerdown',()=>{if(window.matchMedia('(max-width: 650px)').matches&&$('#composer').contains(document.activeElement))document.activeElement.blur();});
