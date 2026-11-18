import {sealKey,openKey} from './key-vault.mjs';
import {readKeyState,savePlainKey,saveEncryptedKey,clearSavedKey} from './key-storage.mjs';
import {createMediaUI} from './media-ui.mjs';
import {chatRequest,applyChunk,previewMessages} from './media.mjs';
import {readDeepSeekZip} from './zip-import.mjs';
import {newChat,editedBranch,importText,contextFor,readSSE,encryptBackup,decryptBackup} from './core.mjs';
import {verifySiteLicense,licenseActive} from './license.mjs';
import {LICENSE_CHANNEL,PUBLIC_KEY,LICENSE_VERIFY_URL} from './build-config.mjs';
import {palettes,fonts,defaultAppearance,cleanAppearance,themeVars} from './appearance.mjs';
const $=s=>document.querySelector(s), el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;};
function savedKeyState(){try{return readKeyState(localStorage);}catch{return {mode:'none'};}}
const initialKey=savedKeyState();
let db,chats=[],current=null,key=initialKey.mode==='plain'?initialKey.key:'',busy=false,controller=null,toastTimer;
let mediaUI,dialogReturn=null,editing=null;
let licenseInfo=null,appearance={...defaultAppearance},fullSearch=false;
let licenseRevision=0,licenseNotice='',licenseSubmitting=false;
function isPro(){return licenseActive(licenseInfo);}
function loadLocal(name,fallback){try{return JSON.parse(localStorage.getItem('xuye-'+name))??fallback;}catch{return fallback;}}
function storeLocal(name,value){try{localStorage.setItem('xuye-'+name,JSON.stringify(value));}catch{throw Error('浏览器无法保存设置，请检查本地空间或权限');}}
function applyAppearance(value){appearance=cleanAppearance(value);for(const [name,v]of Object.entries(themeVars(appearance)))document.documentElement.style.setProperty(name,v);document.documentElement.dataset.night=String(appearance.night);}
applyAppearance(loadLocal('appearance',defaultAppearance));
function checkLicense(envelope){return verifySiteLicense(envelope,PUBLIC_KEY,{channel:LICENSE_CHANNEL,verifyUrl:LICENSE_VERIFY_URL});}
async function loadLicense(){
 const saved=loadLocal('license',null);
 if(!saved||licenseSubmitting)return;
 const revision=++licenseRevision;
 let verified=null,message='';
 try{verified=await checkLicense(saved);}catch(error){message=error.message;}
 if(revision!==licenseRevision)return;
 licenseInfo=verified;
 licenseNotice=message;
 if(!verified&&fullSearch){fullSearch=false;if(!busy)render();}
 updatePlan();
}
function updatePlan(){const b=$('#licenseBtn');if(b)b.textContent=isPro()?(licenseInfo.kind==='community'?'已解锁 · 社区免费授权':'已解锁 · 站点授权'):'免费基础版 · 高级功能';const toggle=$('#fullSearch');if(toggle)toggle.checked=fullSearch&&isPro();}
const chat=()=>chats.find(c=>c.id===current);
function toast(t){($('#dialog').open?$('#dialog'):document.body).append($('#toast'));$('#toast').textContent=t;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
async function initDB(){db=await new Promise((resolve,reject)=>{const r=indexedDB.open('xuye-local-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const data=await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('chats');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});chats=Array.isArray(data)?data:[];current=chats[0]?.id||null;render();}
function persist(){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(chats,'chats');tx.oncomplete=resolve;tx.onerror=()=>reject(Error('本地保存失败，请立即导出备份。浏览器可能没有足够空间。'));});}
async function save(){try{await persist();}catch(e){toast(e.message);throw e;}}
function modal(title){
 mediaUI?.cleanup();closeSidebar();
 const dialog=$('#dialog'),heading=$('#dialogTitle'),body=$('#dialogBody'),back=$('#closeDialog');
 heading.textContent=title;
 back.textContent=dialogReturn?'‹ 返回':'×';
 back.setAttribute('aria-label',dialogReturn?'返回上一级':'关闭');
 back.classList.toggle('dialog-back',!!dialogReturn);
 body.replaceChildren();
 if(!dialog.open)dialog.showModal();
 heading.focus({preventScroll:true});
 body.scrollTop=0;
 return body;
}
function openChild(open,parent){
 const previous=dialogReturn;
 dialogReturn=()=>{dialogReturn=previous;parent();};
 open();
}
function close(){$('#dialog').close();}
function button(parent,text,fn,cls=''){const b=el('button',text,cls);b.type='button';b.onclick=async()=>{try{await fn();}catch(e){toast(e.message||'操作失败');}};parent.append(b);return b;}
function field(parent,label,type='text',value=''){const id='f'+crypto.randomUUID();const l=el('label',label);l.htmlFor=id;const i=el(type==='textarea'?'textarea':'input');i.id=id;if(type!=='textarea')i.type=type;i.value=value;parent.append(l,i);return i;}
function note(parent,text,cls='subtle'){parent.append(el('p',text,cls));}
function settingSection(parent,title,description){
 const section=el('section',undefined,'setting-section');
 section.append(el('h3',title));
 if(description)note(section,description);
 parent.append(section);
 return section;
}
function settingActions(parent){
 const row=el('div',undefined,'row setting-actions');parent.append(row);return row;
}
function settingDetails(parent,title){
 const details=el('details',undefined,'setting-details');details.append(el('summary',title));parent.append(details);return details;
}
function settingStatus(parent,text=''){
 const status=el('div',text,'setting-status');status.setAttribute('role','status');parent.append(status);return status;
}
function filePicker(parent,label,accept){
 const picker=el('label',undefined,'file-picker');
 const input=el('input',undefined,'file-picker-input');input.type='file';input.accept=accept;
 input.setAttribute('aria-label',label);
 const name=el('span','尚未选择文件','file-picker-name');
 input.addEventListener('change',()=>{name.textContent=input.files[0]?.name||'尚未选择文件';});
 picker.append(input,el('strong',label),name);parent.append(picker);
 return {input,clear(){input.value='';name.textContent='尚未选择文件';}};
}
function setBusy(v){busy=v;$('#cancelEdit').disabled=v;$('#sendBtn').hidden=v;$('#stopBtn').hidden=!v;$('#prompt').disabled=v;for(const id of ['newChat','deleteBtn','memoryBtn','importBtn','backupBtn','settingsBtn','manageBtn','demoBtn','welcomeImport','libraryBtn','fileBtn','imageBtn','voiceBtn','webBtn','thinkingBtn'])$('#'+id).disabled=v;}
function render(){
 document.querySelector('.conversation-menu')?.remove();mediaUI?.stopSpeech();
 const c=chat();$('#chatTitle').textContent=c?.title||'新的篇章';$('#count').textContent=chats.length;$('#welcome').hidden=!!c?.messages.length;$('#connection').textContent=key?'Key 已配置':savedKeyState().mode==='encrypted'?'Key 待解锁':'未配置 API';
 const query=$('#search').value.trim().toLocaleLowerCase();const nav=$('#conversations');nav.replaceChildren();for(const c of [...chats].sort((a,b)=>Number(b.pinned===true)-Number(a.pinned===true)).filter(c=>c.title.toLocaleLowerCase().includes(query)||(fullSearch&&isPro()&&(c.memory.toLocaleLowerCase().includes(query)||c.messages.some(m=>m.content.toLocaleLowerCase().includes(query)))))){const row=el('div',undefined,'conversation-row'+(c.id===current?' selected':''));nav.append(row);const item=button(row,c.title,()=>{if(busy)return toast('请先停止当前生成');current=c.id;$('#prompt').value='';mediaUI.resetDraft();render();closeSidebar();},c.id===current?'selected':'');item.classList.add('conversation-select');item.setAttribute('aria-current',String(c.id===current));item.setAttribute('aria-label',c.title);item.title=(c.pinned?'已置顶 · ':'')+c.title;item.replaceChildren(el('span',c.title,'conversation-title'));if(query&&!c.title.toLocaleLowerCase().includes(query)){const match=c.messages.find(m=>m.content.toLocaleLowerCase().includes(query))?.content||c.memory;const p=match.toLocaleLowerCase().indexOf(query);item.append(el('small','…'+match.slice(Math.max(0,p-12),p+45),'search-excerpt'));}const more=button(row,'…',()=>conversationMenu(c,more),'conversation-more');more.setAttribute('aria-label','管理对话：'+c.title);more.setAttribute('aria-haspopup','menu');more.disabled=busy;centerMenuDots(more);}
 requestAnimationFrame(updateTitleOverflow);updatePlan();
 const composer=$('#composer');$('footer').append(composer);if(editing&&editing.chatId!==c?.id)finishEdit(false);
 const list=$('#messages');list.replaceChildren();for(const [index,m] of (c?.messages||[]).entries()){
  const article=el('article',undefined,'message '+m.role),head=el('div',m.role==='user'?'你 / YOU':c?.replyName||'拾语 · Afterword','who');article.dataset.messageIndex=index;
  const isEditing=editing?.chatId===c.id&&editing.index===index;article.append(head);
  if(isEditing){article.classList.add('editing-message');article.append(composer);}
  else{
   const content=el('div',undefined,'content');if(m.content)mediaUI.renderContent(content,m);else if(m.role==='assistant')content.textContent=m.error?'这次没有生成可显示的回复。':m.thinking?'正在思考…':'正在等待回复…';
   article.append(content);mediaUI.renderExtras(article,m);
   if(m.incomplete)article.append(el('div','未完成回复，不会作为后续上下文发送。','meta'));if(m.error)article.append(el('p',m.error,'error'));
   const actions=el('div',undefined,'message-actions');actions.setAttribute('aria-label',m.role==='user'?'你的消息操作':'回复操作');
   if(m.content)button(actions,'复制',async()=>{await navigator.clipboard.writeText(m.content);toast('已复制');});
   if(m.role==='user'){const edit=button(actions,'编辑',()=>startEdit(c,index));edit.disabled=busy;}
   if(m.role==='assistant'&&m.content&&!m.incomplete){const status=el('span','','speech-status');status.hidden=true;status.setAttribute('role','status');const read=button(actions,'朗读',()=>mediaUI.readAloud(m,read,status));read.title='生成语音并播放，API 单独计费';read.setAttribute('aria-pressed','false');read.disabled=busy;actions.append(status);}
   if(actions.childElementCount)article.append(actions);
  }
  list.append(article);
 }

 mediaUI?.draw();
}
function finishEdit(restore=true){if(!editing)return;const previous=editing.previous;editing=null;$('footer').append($('#composer'));$('#composer').classList.remove('is-editing');$('#cancelEdit').hidden=true;$('#editHint').hidden=true;$('#sendBtn').textContent='发送';if(restore){$('#prompt').value=previous.text;mediaUI.restoreDraft(previous.media);}}
function startEdit(c,index){if(busy)return toast('请先停止当前生成');mediaUI.assertReady();if(editing)finishEdit(true);editing={chatId:c.id,index,previous:{text:$('#prompt').value,media:mediaUI.snapshotDraft()}};mediaUI.loadMessage(c.messages[index]);$('#prompt').value=c.messages[index].content;$('#composer').classList.add('is-editing');$('#cancelEdit').hidden=false;$('#editHint').hidden=false;$('#sendBtn').textContent='重新发送';render();$('#prompt').focus();}
function previewChat(c){return editing?.chatId===c.id?{...c,messages:c.messages.slice(0,editing.index)}:c;}
function revisionPanel(c){const b=modal('这段对话的历史版本');note(b,'编辑后重新发送前的内容保存在本机，也包含在聊天备份中。可查看、复制，或作为新对话继续。');for(const revision of [...(c.revisions||[])].reverse()){const card=el('div',undefined,'template-card');card.append(el('h3',new Date(revision.created).toLocaleString()));note(card,revision.messages.length+' 条消息');const row=el('div',undefined,'row');card.append(row);button(row,'查看',()=>{const detail=modal('历史版本');const text=revision.messages.map(m=>(m.role==='user'?'你':c.replyName||'拾语 · Afterword')+'：\n'+m.content+(m.images?.length?'\n[图片 '+m.images.length+' 张]':'')+(m.documents?.length?'\n[文件：'+m.documents.map(d=>d.name).join('、')+']':'')).join('\n\n');detail.append(el('pre',text));const actions=el('div',undefined,'row');detail.append(actions);button(actions,'复制正文',()=>navigator.clipboard.writeText(text));button(actions,'返回历史版本',()=>revisionPanel(c));});button(row,'作为新对话打开',async()=>{const fresh={...newChat(c.title+' · 历史版本'),memory:c.memory,memoryEnabled:c.memoryEnabled,replyName:c.replyName||'',memoryCards:structuredClone(c.memoryCards||[]),messages:structuredClone(revision.messages)};chats.unshift(fresh);try{await save();}catch(e){chats=chats.filter(x=>x!==fresh);throw e;}current=fresh.id;mediaUI.resetDraft();$('#prompt').value='';close();render();});b.append(card);}}
function centerMenuDots(button){button.textContent='';const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');for(const x of [5,12,19]){const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy','12');dot.setAttribute('r','1.6');dot.setAttribute('fill','currentColor');svg.append(dot);}button.append(svg);}
function conversationMenu(c,anchor){
 if(busy)return toast('请先停止当前生成');document.querySelector('.conversation-menu')?.remove();
 const menu=el('div',undefined,'conversation-menu');menu.setAttribute('popover','auto');menu.setAttribute('role','menu');document.body.append(menu);
 const action=(label,fn,cls='')=>{const item=button(menu,label,()=>{menu.hidePopover();menu.remove();return fn();},cls);item.setAttribute('role','menuitem');};
 action('重命名',()=>{const b=modal('重命名对话'),input=field(b,'对话名称','text',c.title);input.maxLength=120;const row=el('div',undefined,'row');b.append(row);button(row,'保存名称',async()=>{const title=input.value.trim();if(!title)throw Error('请填写对话名称');const previous=c.title;c.title=title;try{await save();}catch(e){c.title=previous;throw e;}close();render();},'primary');});
 action(c.pinned?'取消置顶':'置顶',async()=>{const previous=c.pinned;c.pinned=!c.pinned;try{await save();}catch(e){c.pinned=previous;throw e;}render();});
 action('导出这段对话',()=>{const b=modal('导出这段对话');note(b,'包含此对话的正文、图片、记忆、模板和文档引用，不包含 API Key 或原始文档。');const pwd=field(b,'加密备份密码（至少 10 个字符）','password');pwd.autocomplete='new-password';const again=field(b,'再次输入密码','password');again.autocomplete='new-password';const row=el('div',undefined,'row');b.append(row);button(row,'导出加密备份',async()=>{if(pwd.value!==again.value)throw Error('两次密码不一致');download('afterword-conversation-encrypted.json',JSON.stringify(await encryptBackup([c],pwd.value)));pwd.value=again.value='';},'primary');button(row,'导出明文 JSON',()=>{if(confirm('明文文件包含此对话的全部内容，请妥善保管。确定导出？'))download('afterword-conversation.json',JSON.stringify({format:'xuye-backup',version:2,chats:[c]},null,2));});});
 if(c.revisions?.length)action('历史版本',()=>revisionPanel(c));
 action('删除',async()=>{if(!confirm('删除「'+c.title+'」及其记忆和模板？此操作不能撤销。'))return;const previous=chats;chats=chats.filter(x=>x.id!==c.id);try{await save();}catch(e){chats=previous;throw e;}if(current===c.id){current=chats[0]?.id||null;$('#prompt').value='';mediaUI.resetDraft();}render();},'danger');
 const rect=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(rect.right+6,window.innerWidth-188))+'px';menu.style.top=Math.max(8,Math.min(rect.top,window.innerHeight-210))+'px';menu.showPopover();menu.style.top=Math.max(8,Math.min(rect.top,window.innerHeight-menu.getBoundingClientRect().height-8))+'px';
}
async function makeChat(){mediaUI?.resetDraft();const c=newChat();chats.unshift(c);current=c.id;await save();render();$('#prompt').focus();}
function preview(){mediaUI.assertReady();const c=chat()||newChat(),options=mediaUI.options(),b=modal('本次会发送什么');note(b,'以下消息将从浏览器直接发送至 DeepSeek。图片数据在此用占位说明代替；实际请求包含图片。','notice');note(b,options.thinkingEnabled?'深度思考已开启，本次最多 8192 输出 token（含思考），可能增加等待时间与用量。':'深度思考关闭，本次最多 4096 输出 token。');note(b,options.webEnabled?'联网已开启：模型可搜索、读取网页，可能额外计费。':'联网关闭：本次不启用搜索或读取网页工具。');if(options.pendingDocuments.length)note(b,'待上传文件：'+options.pendingDocuments.map(d=>d.name).join('、')+'。点击发送后先直传 DeepSeek，再将返回的文件引用加入本条消息；解析可能单独计费。','notice');const msgs=contextFor(previewChat(c),$('#prompt').value.trim(),options);b.append(el('pre',JSON.stringify(previewMessages(msgs),null,2)));note(b,'发送范围：当前消息 + 最近最多 20 条完整消息（历史最多 4 万字符，含本轮最多 8 张图片）'+(c.memoryEnabled&&c.memory?' + 当前记忆卡':'')+'。上传文档按完整内容参与上下文，不计入上述 4 万字符；文档引用最多 20 个。这不是全部历史；思考与联网同时开启时，回传的历史思考也计入字符上限。官方 ZIP 中的附件与其他分支不会自动导入。');}

function managePanel(){
 dialogReturn=null;
 const b=modal('设置与管理');
 const groups=[
  ['连接与使用',[
   ['连接与 API 设置','管理本机保存的 DeepSeek API Key',settings],
   ['用量与余额','查看本机用量或查询官方余额',usagePanel],
   ['文件、图片、语音与联网','设置朗读声音和文档读取方式',()=>mediaUI.settings()],
  ]],
  ['外观与数据',[
   ['颜色与阅读','调节主题、字号和阅读行距',appearancePanel],
   ['备份与恢复','导出记录，或从文件恢复对话',backup],
   ['高级功能 · 授权','查看状态或导入授权',licensePanel],
  ]],
 ];
 for(const [label,items] of groups){
  const group=el('section',undefined,'manage-group');
  group.append(el('h3',label));
  const menu=el('div',undefined,'manage-menu');
  for(const [title,description,open] of items){
   const item=button(menu,'',()=>openChild(open,managePanel));
   item.setAttribute('aria-label',title);
   const copy=el('span',undefined,'manage-label');
   copy.append(el('strong',title),el('small',description));
   const chevron=el('span','›','manage-chevron');chevron.setAttribute('aria-hidden','true');
   item.append(copy,chevron);
  }
  group.append(menu);b.append(group);
 }
 button(b,'使用指南与数据说明',()=>openChild(guide,managePanel),'settings-help');
}
async function requestDeepSeek(path,apiKey){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
 try{
  const response=await fetch('https://api.deepseek.com'+path,{headers:{Authorization:'Bearer '+apiKey},signal:ctl.signal});
  if(!response.ok)throw Error(apiError(response.status));
  return await response.json();
 }catch(error){
  if(error.name==='AbortError')throw Error('请求超时，请稍后重试。');
  if(error instanceof TypeError)throw Error('无法连接 DeepSeek，请检查网络后重试。');
  throw error;
 }finally{clearTimeout(timer);}
}
function platformLink(parent,text){
 const link=el('a',text);link.href='https://platform.deepseek.com/';link.target='_blank';link.rel='noopener noreferrer';parent.append(link);
}
function usagePanel(){
 const b=modal('用量与余额');
 let input=0,output=0,count=0;
 for(const c of chats)for(const m of c.messages||[]){
  const u=m.usage;
  if(u&&Number.isFinite(u.prompt_tokens)&&Number.isFinite(u.completion_tokens)&&u.prompt_tokens>=0&&u.completion_tokens>=0){
   input+=u.prompt_tokens;output+=u.completion_tokens;count++;
  }
 }
 const balance=settingSection(b,'DeepSeek 账户余额');
 const status=settingStatus(balance,'查询后，余额会显示在这里。');
 const actions=settingActions(balance);
 const query=button(actions,'查询官方余额',async()=>{
  if(!key){status.textContent='请先在「连接与 API 设置」中配置或解锁 Key。';return;}
  query.disabled=true;status.textContent='正在查询…';
  try{
   const data=await requestDeepSeek('/user/balance',key);
   if(!Array.isArray(data.balance_infos)||!data.balance_infos.length)throw Error('官方未返回余额信息。');
   const list=el('dl',undefined,'usage-stats');
   for(const item of data.balance_infos){
    const group=el('div');
    group.append(el('dt',String(item.currency||'可用余额')),el('dd',String(item.total_balance??'—')));
    list.append(group);
   }
   status.replaceChildren(list);
   const breakdown=data.balance_infos.map(item=>
    [item.currency,item.granted_balance==null?'':'赠金 '+item.granted_balance,item.topped_up_balance==null?'':'充值 '+item.topped_up_balance].filter(Boolean).join(' · ')
   ).filter(Boolean).join('；');
   if(breakdown)note(status,breakdown);
  }catch(error){status.textContent=error.message;}
  finally{query.disabled=false;}
 },'primary');
 const bill=el('p',undefined,'subtle');platformLink(bill,'在 DeepSeek 开放平台查看详细账单 ↗');balance.append(bill);
 const local=settingSection(b,'本机用量','仅统计当前设备已保存的文字与图片回复。');
 const stats=el('dl',undefined,'usage-stats');
 for(const [label,value] of [['有记录的回复',count],['输入 token',input],['输出 token',output]]){
  const item=el('div');item.append(el('dt',label),el('dd',value.toLocaleString()));stats.append(item);
 }
 local.append(stats);
 note(settingDetails(local,'统计范围'),'导入、删除、停止生成或未返回用量的请求可能影响统计。语音、搜索和网页读取等工具费用以官方账单为准。');
}
function settings(){
 const b=modal('连接与 API 设置'),saved=savedKeyState();
 if(saved.mode==='encrypted'&&!key){
  const locked=settingSection(b,'解锁已保存的 Key','输入之前设置的本机密码。');
  const password=field(locked,'本机保存密码','password');password.autocomplete='current-password';
  const feedback=settingStatus(locked);
  const unlock=button(settingActions(locked),'解锁',async()=>{
   unlock.disabled=true;
   try{
    const state=savedKeyState();
    if(state.mode!=='encrypted')throw Error('本机没有加密保存的 Key。');
    key=await openKey(state.vault,password.value);password.value='';
    render();if(feedback.isConnected){settings();toast('Key 已解锁');}
   }catch(error){feedback.textContent=error.message;}
   finally{unlock.disabled=false;}
  },'primary');
 }
 const connection=settingSection(b,'DeepSeek API Key','Key 保存在当前浏览器，聊天备份不包含它。');
 const k=field(connection,'API Key','password',key);k.autocomplete='off';k.spellcheck=false;k.maxLength=2048;k.placeholder=saved.mode==='encrypted'&&!key?'或在此填写新的 Key':'粘贴你的 DeepSeek API Key';
 const controls=settingActions(connection);
 const reveal=button(controls,'显示 Key',()=>{
  const visible=k.type==='password';
  k.type=visible?'text':'password';reveal.textContent=visible?'隐藏 Key':'显示 Key';reveal.setAttribute('aria-pressed',String(visible));
 },'secondary');
 reveal.setAttribute('aria-pressed','false');
 const result=settingStatus(connection);
 const test=button(controls,'测试连接',async()=>{
  const candidate=k.value.trim()||key;
  if(!candidate){result.textContent='请先填写或解锁 Key。';return;}
  test.disabled=true;result.textContent='正在测试连接…';
  try{await requestDeepSeek('/models',candidate);result.textContent='连接成功，可以开始聊天。';}
  catch(error){result.textContent=error.message;}
  finally{test.disabled=false;}
 },'secondary');
 const help=el('p',undefined,'subtle');platformLink(help,'到 DeepSeek 开放平台管理 API Key ↗');connection.append(help);
 const storage=settingSection(b,'本机保存');
 const label=el('label','保存方式'),mode=el('select');mode.id='keySaveMode';label.htmlFor=mode.id;
 for(const [value,text] of [['plain','自动保存'],['encrypted','密码加密保存']]){
  const option=el('option',text);option.value=value;mode.append(option);
 }
 mode.value=saved.mode==='encrypted'?'encrypted':'plain';storage.append(label,mode);
 const status=settingStatus(storage);
 const encrypted=el('div');storage.append(encrypted);
 const password=field(encrypted,'新密码（至少 12 个字符）','password'),again=field(encrypted,'再次输入新密码','password');
 password.autocomplete=again.autocomplete='new-password';
 note(encrypted,'刷新后用此密码解锁。请妥善保管密码。');
 const actions=settingActions(b);
 function describeMode(){
  encrypted.hidden=mode.value!=='encrypted';
  const actual=savedKeyState().mode;
  commit.textContent=mode.value==='plain'?'完成保存':'加密保存';
  status.textContent=mode.value==='plain'
   ? actual==='encrypted'?'已保存的 Key 仍受密码保护。确认后才会切换为未加密保存。':'填写后自动保存在当前浏览器，刷新后继续使用。'
   : actual==='encrypted'?'当前已加密保存。可以设置新密码来更新 Key。':'设置密码后点击「加密保存」，加密才会生效。';
 }
 function autoSave(){
  const candidate=k.value.trim();
  if(mode.value!=='plain'||savedKeyState().mode==='encrypted'||!candidate)return true;
  try{key=savePlainKey(localStorage,candidate);status.textContent='已自动保存到当前浏览器（未加密）。';$('#connection').textContent='Key 已配置';return true;}
  catch(error){key=candidate;status.textContent='只能在本页使用，未能保存：'+error.message;return false;}
 }
 const commit=button(actions,'完成保存',async()=>{
  const candidate=k.value.trim()||key;
  if(mode.value==='plain'){
   if(savedKeyState().mode==='encrypted'){
    if(!candidate){status.textContent='请先解锁已保存的 Key，或填写新的 Key。';return;}
    if(!confirm('确认改为自动保存？保存的 API Key 将不再受密码保护。'))return;
    key=savePlainKey(localStorage,candidate);
   }else if(!autoSave())return;
   render();close();return;
  }
  if(!candidate){status.textContent='请先填写或解锁 Key。';return;}
  if(password.value!==again.value){status.textContent='两次密码不一致。';return;}
  commit.disabled=true;
  try{
   const vault=await sealKey(candidate,password.value);
   saveEncryptedKey(localStorage,vault);key=candidate;k.value=password.value=again.value='';
   render();if(commit.isConnected){close();toast('Key 已加密保存');}
  }catch(error){status.textContent=error.message;}
  finally{commit.disabled=false;}
 },'primary');
 if(saved.mode!=='none'||key){
  const maintenance=settingDetails(storage,'移除已保存的 Key');
  note(maintenance,'移除后需要重新填写 Key 才能继续调用 DeepSeek。');
  button(settingActions(maintenance),'移除本机 Key',()=>{
   if(!confirm('移除此浏览器保存的 API Key？'))return;
   clearSavedKey(localStorage);key='';render();settings();toast('本机 Key 已移除');
  },'danger');
 }
 k.addEventListener('input',autoSave);k.addEventListener('change',autoSave);
 mode.onchange=()=>{describeMode();autoSave();};
 describeMode();
}
function apiError(s){return ({401:'Key 无效或已撤销，请检查配置。',402:'API 账户余额不足，请前往官方平台核实。',429:'请求过于频繁或触及 API 限制，请稍后重试。',400:'API 参数或上下文不被接受，请减少内容后重试。',403:'API 拒绝访问，请检查账号权限。'}[s]||`官方 API 返回 HTTP ${s}，请稍后重试。`);}
async function send(event){event?.preventDefault();if(busy)return;mediaUI.assertReady();const text=$('#prompt').value.trim(),options=mediaUI.options();if(!text&&!options.images.length&&!options.documents.length&&!options.pendingDocuments.length)return;if(!key){settings();return;}
 setBusy(true);controller=new AbortController();let c,oldTitle,payload;
 const editState=editing;
 try{await mediaUI.uploadDocuments(controller.signal);Object.assign(options,mediaUI.options());if(!chat()){const fresh=newChat();chats.unshift(fresh);current=fresh.id;}c=chat();oldTitle=c.title;payload=contextFor(previewChat(c),text,options);const message={role:'user',content:text,...(options.images.length?{images:options.images}:{}),...(options.documents.length?{documents:options.documents}:{})},oldMessages=c.messages,oldRevisions=c.revisions;
  if(editState){if(editState.chatId!==c.id)throw Error('当前对话已改变，请重新编辑');Object.assign(c,editedBranch(c,editState.index,message));}else c.messages=[...c.messages,message];
  if(c.title==='新的篇章')c.title=text.slice(0,24)||options.documents[0]?.name||'图片里的故事';try{await save();}catch(e){c.messages=oldMessages;c.revisions=oldRevisions;c.title=oldTitle;throw e;}}
 catch(e){controller?.abort();controller=null;setBusy(false);mediaUI.draw();throw Error(e.name==='AbortError'?'已停止文件上传。官方仍可能完成解析并计费；草稿保留，可移除附件或重试。':e.message==='Failed to fetch'?'文件未能直传官方，请检查网络或浏览器跨域限制。草稿已保留，未使用代理。':e.message);}
 $('#prompt').value='';mediaUI.sent();if(editState)finishEdit(true);

 const reply={role:'assistant',content:'',incomplete:true};c.messages.push(reply);setBusy(true);render();let timeout=setTimeout(()=>controller.abort(),90000);let finished=false;let lastPaint=0;
 try{const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(chatRequest(payload,options.webEnabled,options.thinkingEnabled)),signal:controller.signal});if(!r.ok)throw Error(apiError(r.status));if(!r.body)throw Error('浏览器未返回响应流');
 const done=await readSSE(r.body,data=>{clearTimeout(timeout);timeout=setTimeout(()=>controller.abort(),90000);if(applyChunk(reply,data))finished=true;if(Date.now()-lastPaint>90){render();$('#chatScroll').scrollTop=$('#chatScroll').scrollHeight;lastPaint=Date.now();}});
 if(!done&&!finished)throw Error('连接提前结束，已保留收到的部分回复。');if(!reply.content)throw Error('未收到可显示的文本回复。');reply.incomplete=false;
 }catch(e){reply.error=e.name==='AbortError'?'已停止或连接超时。部分回复已保留；已发生的 API 用量仍可能计费。':e.message==='Failed to fetch'?'直连失败：检查网络或浏览器跨域限制。未使用代理转发。':e.message;}finally{clearTimeout(timeout);delete reply.toolStatus;delete reply.thinking;controller?.abort();controller=null;try{await save();}catch{}setBusy(false);render();$('#chatScroll').scrollTop=$('#chatScroll').scrollHeight;}
}
async function memory(){if(!chat())await makeChat();const c=chat(),b=modal('这段对话的记忆');const replyName=field(b,'回复显示名称','text',c.replyName||'');replyName.maxLength=40;replyName.placeholder='留空显示「拾语 · Afterword」';note(b,'仅修改这段对话的回复署名，不会自动改变模型的人物设定。');note(b,'由你编辑和确认。启用后，整张记忆卡会随本轮消息发送给 DeepSeek。记忆可能不完整，请及时修正。','notice');const input=field(b,'人物、经历、故事设定或交流偏好','textarea',c.memory);input.maxLength=20000;input.placeholder='例如：小说主人公叫林舟，故事发生在沿海小镇…';const label=el('label');const check=el('input');check.type='checkbox';check.checked=c.memoryEnabled;label.append(check,document.createTextNode(' 在当前对话启用这张记忆卡'));b.append(label);button(b,'保存记忆',async()=>{c.replyName=replyName.value.trim().slice(0,40);c.memory=input.value;c.memoryEnabled=check.checked;await save();close();render();toast('记忆卡已保存到当前设备');},'primary');note(b,'本版仅提供手动记忆编辑，不会在导入后自动调用 API 总结，也不会暗中上传历史。');}
function importer(){
 const b=modal('带来一段对话');note(b,'直接选择 DeepSeek 导出的 ZIP，也可以选择单个 JSON、TXT、MD 或拾语 · Afterword 备份。文件只在本设备解析，不会因导入调用 API。','notice');
 note(b,'ZIP 中仅导入当前分支的文字问答；图片、附件、工具调用、思考过程及其他分支不会导入。请保留原始导出包。ZIP 最大 64 MB，最多 500 段会话。');
 const {input:file}=filePicker(b,'选择文件','.zip,.txt,.md,.json');const results=el('div');b.append(results);let generation=0;
 file.onchange=async()=>{const run=++generation;try{const f=file.files[0];if(!f)return;results.replaceChildren();note(results,'正在本地读取，请稍候…');let candidates=[],warnings=[];
 if(/\.zip$/i.test(f.name)){if(f.size>64*1024*1024)throw Error('ZIP 超过 64 MB，请先解压并分批导入 JSON');const archive=await readDeepSeekZip(await f.arrayBuffer());warnings=archive.warnings;for(const item of archive.sessions){try{candidates.push(...importText(item.text,item.name.split('/').pop()));}catch(e){warnings.push(`${item.name}：${e.message}`);}if(candidates.length>500)throw Error('最多一次导入 500 段对话');}}
 else{if(f.size>128*1024*1024)throw Error('单个文件超过 128 MB，请分批备份或导入');const raw=await f.text();let json;try{json=JSON.parse(raw);}catch{}if(json?.format==='xuye-encrypted'){if(run===generation&&file.isConnected)openChild(()=>restorePrompt(raw),importer);return;}candidates=importText(raw,f.name);}
 if(run!==generation||!file.isConnected)return;results.replaceChildren();note(results,`识别到 ${candidates.length} 段对话，${warnings.length} 个文件未能读取。选择后新增导入，不覆盖已有记录。`,'test-result');
 if(warnings.length){const d=el('details'),summary=el('summary','查看未能读取的文件');d.append(summary);for(const warning of warnings)note(d,warning,'error');results.append(d);}
 const checked=[];for(const c of candidates){const l=el('label',undefined,'importitem'),i=el('input');i.type='checkbox';i.checked=true;l.append(i,document.createTextNode(`${c.title} · ${c.messages.length} 条`));results.append(l);checked.push({i,c});}
 if(candidates.length)button(results,'确认导入所选对话',async()=>{const chosen=checked.filter(x=>x.i.checked).map(x=>x.c);if(!chosen.length)throw Error('请至少选择一段对话');const previous=[...chats];chats.unshift(...chosen);try{await save();}catch(e){chats=previous;throw e;}current=chosen[0].id;mediaUI.resetDraft();close();render();toast('已导入，原有对话保留');},'primary');
 }catch(e){if(run===generation&&file.isConnected)results.replaceChildren(el('p',e.message,'error'));}};
}
function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function backup(){
 const b=modal('备份与恢复');
 const restore=settingSection(b,'从文件恢复','恢复会新增对话，已有记录会保留。');
 button(settingActions(restore),'导入 / 恢复备份',()=>openChild(importer,backup),'primary');
 const exportPanel=settingSection(b,'导出备份','包含对话、记忆和模板，不含 API Key 或附件原件。');
 const encrypted=settingDetails(exportPanel,'导出加密备份');
 note(encrypted,'请保管备份密码。日后恢复时必须输入。');
 const pwd=field(encrypted,'备份密码（至少 10 个字符）','password');
 const again=field(encrypted,'再次输入密码','password');
 pwd.autocomplete=again.autocomplete='new-password';
 const status=settingStatus(encrypted);
 const encrypt=button(settingActions(encrypted),'下载加密备份',async()=>{
  if(!chats.length){status.textContent='目前没有可备份的对话。';return;}
  if(pwd.value!==again.value){status.textContent='两次密码不一致。';return;}
  encrypt.disabled=true;
  try{
   const data=await encryptBackup(chats,pwd.value);
   download('afterword-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(data));
   pwd.value=again.value='';status.textContent='已请求下载，请查看浏览器的下载记录。';
  }catch(error){status.textContent=error.message;}
  finally{encrypt.disabled=false;}
 },'primary');
 button(settingActions(exportPanel),'导出明文备份',()=>{
  if(!chats.length){toast('目前没有可备份的对话。');return;}
  if(!confirm('明文备份包含全部聊天正文和记忆。确认导出到本机？'))return;
  download('afterword-plaintext.json',JSON.stringify({format:'xuye-backup',version:2,chats},null,2));
 },'secondary');
 const danger=settingDetails(b,'清除本机数据');
 note(danger,'会删除此浏览器在当前站点的对话、设置、授权和 Key。建议先备份。');
 button(settingActions(danger),'清除本地全部数据',async()=>{
  if(!confirm('确定删除当前站点保存在此浏览器的对话、设置、授权和 API Key？已上传给 DeepSeek 的文件需另行管理。'))return;
  const previous=chats;chats=[];
  try{await save();}catch(error){chats=previous;throw error;}
  current=null;key='';++licenseRevision;licenseInfo=null;licenseNotice='';fullSearch=false;mediaUI.resetDraft();
  for(const item of ['license','appearance','voice','documentMode','key-vault','key-storage'])localStorage.removeItem('xuye-'+item);
  applyAppearance(defaultAppearance);close();render();toast('本机数据已清除');
 },'danger');
}
function restorePrompt(raw){
 const b=modal('恢复加密备份');
 note(b,'恢复会新增对话，已有记录会保留。');
 const pwd=field(b,'备份密码','password');pwd.autocomplete='off';
 const status=settingStatus(b);
 const restore=button(settingActions(b),'解密并导入',async()=>{
  restore.disabled=true;
  try{
   const text=await decryptBackup(JSON.parse(raw),pwd.value);
   const imported=importText(text,'backup.json');
   const previous=[...chats];chats.unshift(...imported);
   try{await save();}catch(error){chats=previous;throw error;}
   current=imported[0]?.id||current;mediaUI.resetDraft();pwd.value='';if(restore.isConnected)close();render();toast(`已恢复 ${imported.length} 段对话`);
  }catch(error){status.textContent=error.message;}
  finally{restore.disabled=false;}
 },'primary');
}
function guide(){
 const b=modal('使用指南与数据说明');
 const start=settingSection(b,'从一段对话开始');
 const steps=el('ol',undefined,'guide-steps');
 for(const [label,copy] of [
  ['体验示例','无需 API Key，可以先看看记忆卡和本地保存。'],
  ['导入记录','选择 DeepSeek 导出的 ZIP，勾选要带来的对话。ZIP 只读取当前分支的文字。'],
  ['配置并续聊','在「连接与 API 设置」填写 Key。通过记忆卡补充重要设定，发送前可预览消息范围。']
 ]){
  const step=el('li');step.append(el('strong',label),el('span',copy));steps.append(step);
 }
 start.append(steps);
 for(const [label,copy] of [
  ['记录与备份','对话存于当前浏览器和站点。换设备或清理网站数据前请先备份。备份不含 API Key 或原始附件。'],
  ['发送给 DeepSeek 的内容','聊天、文件、图片和语音按你发起的操作直连官方 API，费用以官方账单为准。每次随请求带上有限的近期对话和已启用的记忆卡，不会自动重建旧对话的全部记忆。'],
  ['授权校验',LICENSE_VERIFY_URL?'商用授权通过独立授权服务校验。请求只发送授权文件。':'授权在此浏览器离线校验。'],
  ['遇到问题','报告问题时，请提供错误类型、浏览器版本和脱敏样例，避免提交私密聊天或 API Key。']
 ])note(settingDetails(b,label),copy);
}
$('#cancelEdit').onclick=()=>{if(busy)return;finishEdit(true);render();$('#prompt').focus();};
$('#closeDialog').onclick=close;$('#dialog').addEventListener('close',()=>{const returnTo=dialogReturn;dialogReturn=null;mediaUI?.cleanup();document.body.append($('#toast'));$('#dialogBody').replaceChildren();$('#closeDialog').setAttribute('aria-label','关闭');if(returnTo)queueMicrotask(returnTo);});$('#newChat').onclick=()=>{closeSidebar();makeChat().catch(e=>toast(e.message));};$('#search').oninput=render;$('#settingsBtn').onclick=settings;$('#memoryBtn').onclick=()=>memory().catch(e=>toast(e.message));$('#previewBtn').onclick=preview;$('#importBtn').onclick=importer;$('#welcomeImport').onclick=importer;$('#backupBtn').onclick=backup;$('#guideBtn').onclick=guide;$('#composer').onsubmit=e=>send(e).catch(e=>toast(e.message));$('#stopBtn').onclick=()=>controller?.abort();$('#menu').onclick=openSidebar;$('#closeSidebar').onclick=()=>closeSidebar(true);$('#sidebarBackdrop').onclick=()=>closeSidebar(true);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#sidebar').classList.contains('open')&&!$('#dialog').open)closeSidebar(true);});window.matchMedia('(max-width: 650px)').addEventListener('change',e=>{if(!e.matches)closeSidebar();});$('#prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send().catch(e=>toast(e.message));}};
$('#deleteBtn').onclick=async()=>{if(!chat()||!confirm('删除当前对话及它的记忆卡？此操作不能撤销。'))return;const previous=chats;chats=chats.filter(c=>c.id!==current);try{await save();}catch{chats=previous;return;}current=chats[0]?.id||null;mediaUI.resetDraft();render();};
$('#demoBtn').onclick=async()=>{mediaUI.resetDraft();const c=newChat('海边书店 · 虚构示例');c.memory='这是虚构的小说创作示例。主角林舟在沿海小镇开了一家旧书店。偏好温暖、克制的叙述。上一幕：她在一本旧航海日志里发现了一张没有寄出的明信片。';c.messages=[{role:'user',content:'我们来写一个关于海边旧书店的故事。主角叫林舟，叙述温暖一点，不要过度煽情。'},{role:'assistant',content:'【本地虚构示例，未调用 API】\n\n黄昏时，林舟把门口的木牌翻到「营业中」。海风吹动桌上的纸页，一张褪色的明信片从旧航海日志里滑了出来。\n\n背面只有一句话：等潮水退去，我们就能看见那条路。\n\n——你可以打开右上角「记忆卡」查看设定，或备份这段对话。配置自己的 Key 后，发送消息即可真正续写。'}];chats.unshift(c);current=c.id;try{await save();render();}catch{}};
function appearancePanel(){
 const original={...appearance},b=modal('颜色与阅读');
 let draft={...appearance};
 const theme=settingSection(b,'主题','选择一款配色，页面会立即预览。');
 const grid=el('div',undefined,'palette-grid');theme.append(grid);
 const reading=settingSection(b,'阅读排版');
 const controls=el('div',undefined,'reading-controls');reading.append(controls);
 function refresh(){
  applyAppearance(draft);
  for(const item of grid.children)item.setAttribute('aria-pressed',String(item.dataset.palette===draft.palette));
 }
 for(const p of palettes){
  const card=button(grid,'',()=>{
   draft={...draft,palette:p.id,color:p.color,night:p.night};
   custom.value=p.color;night.checked=p.night;refresh();
  },'palette');
  card.dataset.palette=p.id;card.setAttribute('aria-label',p.name);
  const swatch=el('span',undefined,'swatch');swatch.style.background=p.color;
  card.append(swatch,el('b',p.name),el('small',p.description));
 }
 const colors=el('div',undefined,'theme-custom');theme.append(colors);
 const custom=field(colors,'自选主题色','color',draft.color);
 custom.oninput=()=>{draft.color=custom.value;draft.palette='custom';refresh();};
 const nightLabel=el('label',undefined,'inline-check'),night=el('input');
 night.type='checkbox';night.checked=draft.night;
 nightLabel.append(night,document.createTextNode('深色背景'));colors.append(nightLabel);
 night.onchange=()=>{draft.night=night.checked;refresh();};
 function select(label,values,value,onchange){
  const wrap=el('div'),l=el('label',label),input=el('select');
  input.id='s'+crypto.randomUUID();l.htmlFor=input.id;
  for(const [v,text] of values){const option=el('option',text);option.value=v;input.append(option);}
  input.value=String(value);input.onchange=()=>{onchange(input.value);refresh();};
  wrap.append(l,input);controls.append(wrap);return input;
 }
 const font=select('文字风格',Object.entries(fonts).map(([k,v])=>[k,v.name]),draft.font,v=>draft.font=v);
 const size=select('聊天字号',[15,17,19,21].map(v=>[v,v+' px']),draft.size,v=>draft.size=+v);
 const spacing=select('阅读行距',[[1.7,'紧凑'],[2,'舒展'],[2.3,'宽松']],draft.spacing,v=>draft.spacing=+v);
 const sample=el('div',undefined,'reading-sample');
 sample.append(el('small','阅读预览'),el('p','窗边的灯还亮着。\n你慢慢说，这一页不着急写完。'));
 reading.append(sample);
 let committed=false;
 $('#dialog').addEventListener('close',()=>{if(!committed)applyAppearance(original);},{once:true});
 const row=settingActions(b);
 button(row,'恢复默认',()=>{
  draft={...defaultAppearance};custom.value=draft.color;night.checked=draft.night;
  font.value=draft.font;size.value=String(draft.size);spacing.value=String(draft.spacing);refresh();
 });
 button(row,'保存外观',()=>{
  storeLocal('appearance',draft);committed=true;applyAppearance(draft);close();toast('颜色与阅读设置已保存在本设备');
 },'primary');
 refresh();
}
function licensePanel(){
 const b=modal('高级功能 · 授权');
 const community=LICENSE_CHANNEL==='community';
 const active=isPro();
 const current=settingSection(b,'授权状态');
 const badge=el('span',active?'已解锁':'基础功能可用','setting-badge');
 if(active)badge.dataset.active='true';
 current.append(badge);
 note(current,'授权可解锁全文和记忆搜索，以及保存、套用记忆模板。');
 if(active)note(current,`编号 ${licenseInfo.id} · ${licenseInfo.expires===null?'永久有效':'有效期至 '+new Date(licenseInfo.expires).toLocaleDateString('zh-CN')}`);
 const upload=settingSection(b,'导入授权文件');
 if(community){
  note(upload,'下载免费的社区授权文件，再选择该文件验证。');
  const link=el('a','下载社区免费授权');link.href='community.license';link.download='社区免费授权.license';upload.append(link);
 }else note(upload,'选择从本站获取的 .license 文件。');
 const {input:file,clear:clearFile}=filePicker(upload,'选择 .license 文件','.license,.json');
 const alternate=settingDetails(upload,'粘贴授权内容');
 const raw=field(alternate,'授权 JSON','textarea');raw.placeholder='粘贴完整的授权文件内容';raw.maxLength=20000;
 const status=settingStatus(upload,licenseNotice);
 let fileContent=null;
 file.onchange=async()=>{
  const selected=file.files[0];
  fileContent=null;status.textContent='';
  if(!selected)return;
  if(selected.size>20000){status.textContent='授权文件过大。';clearFile();return;}
  try{
   const text=await selected.text();
   if(file.files[0]!==selected)return;
   fileContent=text;raw.value='';alternate.open=false;
  }catch(error){status.textContent=error.message;}
 };
 const row=settingActions(upload);
 const apply=button(row,'验证并解锁',async()=>{
  apply.disabled=true;
  let envelope;
  try{
   const source=raw.value.trim()||fileContent||(file.files[0]&&await file.files[0].text());
   if(!source||source.length>20000)throw Error();
   envelope=JSON.parse(source);
  }catch{status.textContent='请选择授权文件，或粘贴完整的授权 JSON。';apply.disabled=false;return;}
  if(!apply.isConnected){apply.disabled=false;return;}
  const revision=++licenseRevision;
  licenseSubmitting=true;status.textContent='正在验证…';
  try{
   const verified=await checkLicense(envelope);
   if(revision!==licenseRevision)return;
   storeLocal('license',envelope);licenseInfo=verified;licenseNotice='';
   render();
   if(apply.isConnected){licensePanel();toast('高级功能已解锁');}
  }catch(error){status.textContent=error.message;}
  finally{licenseSubmitting=false;apply.disabled=false;}
 },'primary');
 if(loadLocal('license',null)){
  button(settingActions(current),'移除本机授权',()=>{
   ++licenseRevision;localStorage.removeItem('xuye-license');licenseInfo=null;licenseNotice='';fullSearch=false;
   render();licensePanel();toast('已移除本机授权，已有聊天与模板保留');
  },'secondary');
 }
 note(settingDetails(b,'校验和数据说明'),LICENSE_VERIFY_URL?'在线校验只发送授权文件。聊天、API Key 和设备标识不随授权发送。':'授权在本机校验。移除授权后，已有模板仍可查看、复制、删除和备份。');
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
mediaUI=createMediaUI({$,el,button,field,note,modal,toast,settingSection,settingDetails,getKey:()=>key,isBusy:()=>busy,apiError,loadLocal,storeLocal,save:async id=>{for(const c of chats)for(const m of [...c.messages,...(c.revisions||[]).flatMap(r=>r.messages)])for(const d of m.documents||[])if(d.id===id)d.deleted=true;await save();render();}});
loadLicense();
if(LICENSE_VERIFY_URL){
 let nextCheck=Date.now()+15*60_000;
 const refreshLicense=()=>{if(document.visibilityState==='visible'&&Date.now()>=nextCheck){nextCheck=Date.now()+15*60_000;void loadLicense();}};
 setInterval(refreshLicense,60_000);
 document.addEventListener('visibilitychange',refreshLicense);
}
initDB().catch(()=>{modal('本地存储不可用');note($('#dialogBody'),'无法打开浏览器本地数据库。请使用允许本地存储的普通浏览模式后刷新；不要在此状态下输入重要记录。','notice');for(const b of document.querySelectorAll('button'))if(b.id!=='closeDialog')b.disabled=true;});

function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').hidden=false; $('#menu').setAttribute('aria-expanded','true'); $('#closeSidebar').focus(); requestAnimationFrame(updateTitleOverflow); }
function closeSidebar(restoreFocus=false) { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').hidden=true; $('#menu').setAttribute('aria-expanded','false'); if(restoreFocus) $('#menu').focus(); }

function updateTitleOverflow(){for(const title of document.querySelectorAll('.conversation-title')){const distance=Math.max(0,title.scrollWidth-title.parentElement.clientWidth+26);title.style.setProperty('--title-distance',distance+'px');title.classList.toggle('scrolling',distance>1);}}
window.addEventListener('resize',updateTitleOverflow);

// Tapping the reading area dismisses the compact mobile composer without clearing drafts.
$('#chatScroll').addEventListener('pointerdown',()=>{if(window.matchMedia('(max-width: 650px)').matches&&$('#composer').contains(document.activeElement))document.activeElement.blur();});
