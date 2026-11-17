import {cleanDocuments,documentParts} from './documents.mjs';
import {cleanImages,cleanAnnotations} from './media.mjs';
export const uid=()=>crypto.randomUUID();
export function newChat(title='新的篇章'){return {id:uid(),title,memory:'',memoryEnabled:true,messages:[],created:Date.now()};}
export function normalizeSession(obj,title='导入的对话',allowEmpty=false,preserveMedia=false){
 if(!obj||!Array.isArray(obj.messages))throw Error('没有找到 messages 消息列表');
 let source=obj.messages;
 if(source.length>10000)throw Error('单个对话最多支持 10000 条消息');
 if(source.some(m=>Array.isArray(m.fragments))){
  const map=new Map(source.map(m=>[m.id,m]));const branch=[];const seen=new Set();let id=obj.current_message_id;
  if(id==null)throw Error('官方会话缺少 current_message_id，无法确定当前分支');
  while(id!=null){if(seen.has(id)||!map.has(id))throw Error('消息分支损坏，未导入');seen.add(id);const m=map.get(id);branch.unshift(m);id=m.parent_id;}source=branch;
 }
 const c=newChat(String(obj.title||title).slice(0,120));
 c.pinned=obj.pinned===true;
 c.replyName=typeof obj.replyName==='string'?obj.replyName.trim().slice(0,40):'';
 c.memory=typeof obj.memory==='string'?obj.memory.slice(0,20000):'';c.memoryEnabled=obj.memoryEnabled!==false;
 if(Array.isArray(obj.memoryCards))c.memoryCards=obj.memoryCards.slice(0,50).filter(x=>x&&typeof x.title==='string'&&typeof x.content==='string').map(x=>({id:uid(),title:x.title.slice(0,80),content:x.content.slice(0,20000)}));
 c.messages=source.flatMap(m=>{
  const role=String(m.role||'').toLowerCase();if(!['user','assistant'].includes(role))return [];
  let content=typeof m.content==='string'?m.content:Array.isArray(m.fragments)?m.fragments.filter(f=>['REQUEST','RESPONSE'].includes(f.type)).map(f=>f.content||'').join('\n'):'';
  const images=preserveMedia&&role==='user'?cleanImages(m.images):[],documents=preserveMedia&&role==='user'?cleanDocuments(m.documents):[];
  if(!content&&!images.length&&!documents.length)return [];if(content.length>500000)throw Error('单条消息过长');
  const failed=m.incomplete===true||(m.status&&!['FINISHED','INCOMPLETE'].includes(m.status));
  const message={role,content,incomplete:!!failed};
  if(images.length)message.images=images;if(documents.length)message.documents=documents;
  if(preserveMedia&&role==='assistant'){if(typeof m.reasoning_content==='string'&&m.reasoning_content.length<=500000)message.reasoning_content=m.reasoning_content;message.annotations=cleanAnnotations(m.annotations);if(Array.isArray(m.server_tool_calls)&&JSON.stringify(m.server_tool_calls).length<=500000)message.server_tool_calls=m.server_tool_calls;if(m.usage&&typeof m.usage==='object')message.usage=m.usage;}
  return [message];
 });
 if(!c.messages.length&&!c.memory&&!allowEmpty)throw Error('没有识别到可导入的文本消息');return c;
}
export function importText(text,name){
 if(/\.txt$|\.md$/i.test(name)){const c=newChat(name.replace(/\.[^.]+$/,''));c.messages=[{role:'user',content:text}];return [c];}
 let data;try{data=JSON.parse(text);}catch{throw Error('JSON 格式无效；纯文本请使用 .txt 文件');}
 if(data.format==='xuye-backup'&&![1,2].includes(data.version))throw Error('不支持此备份版本');
 const list=Array.isArray(data)?(data[0]?.role?[{messages:data}]:data):data.chats||data.conversations||[data];
 if(!Array.isArray(list)||list.length>500)throw Error('最多导入 500 段对话');
 return list.map(c=>normalizeSession(c,name,data.format==='xuye-backup',data.format==='xuye-backup'));
}
export function deviceTimeContext(now=new Date(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){
 const fields=new Intl.DateTimeFormat('en-GB',{timeZone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(now);
 const part=name=>fields.find(p=>p.type===name)?.value;
 const local=`${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
 return `本次请求的设备时间：${local}；时区：${timeZone}（${part('timeZoneName')}）；UTC：${now.toISOString()}。询问现实中的今天、现在或日期时，以此设备时间为依据；设备时钟可能有误。故事内的日期遵循剧情设定，不与现实日期混淆。联网工具可用不代表已经检索，不要声称执行了未发生的搜索。`;
}
export function contextFor(chat,prompt,options={}){
 const images=cleanImages(options.images),documents=cleanDocuments(options.documents),now=options.now||new Date(),memory=chat.memoryEnabled?chat.memory:'';
 const system='你是一个中文 AI 助手。诚实说明记忆和能力边界，不假装拥有未提供的历史。\n'+deviceTimeContext(now,options.timeZone)+'\n以下记忆由用户编辑，可能不准确，仅作背景参考。\n'+memory;
 const history=chat.messages.filter(m=>!m.incomplete&&(m.content||m.images?.length||m.documents?.length));
 let recent=history.slice(-20);while(recent[0]?.role==='assistant')recent.shift();
 const tooLarge=()=>recent.reduce((n,m)=>n+m.content.length+(options.webEnabled&&options.thinkingEnabled?(m.reasoning_content?.length||0):0),0)>40000||recent.reduce((n,m)=>n+(m.images?.length||0),images.length)>8||recent.reduce((n,m)=>n+(m.documents?.length||0),documents.length)>20;
 while(recent.length&&tooLarge()){recent.shift();while(recent[0]?.role==='assistant')recent.shift();}
 const message=m=>({role:m.role,content:m.images?.length||m.documents?.length?[...(m.content?[{type:'text',text:m.content}]:[]),...cleanImages(m.images).map(i=>({type:'image_url',image_url:{url:i.data}})),...documentParts(m.documents,now.getTime())]:m.content,...(options.webEnabled&&options.thinkingEnabled&&m.role==='assistant'?{reasoning_content:m.reasoning_content||''}:{}),...(options.webEnabled&&m.role==='assistant'&&m.server_tool_calls?{server_tool_calls:m.server_tool_calls}:{})});
 return [{role:'system',content:system},...recent.map(message),...(prompt||images.length||documents.length?[message({role:'user',content:prompt,images,documents})]:[])];
}
export async function readSSE(body,onData){
 const reader=body.getReader();const decoder=new TextDecoder();let buffer='',doneSignal=false;
 function process(block){const lines=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart());if(!lines.length)return;const s=lines.join('\n').trim();if(s==='[DONE]'){doneSignal=true;return;}onData(JSON.parse(s));}
 try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});buffer=buffer.replace(/\r\n/g,'\n');let i;while((i=buffer.indexOf('\n\n'))>=0){process(buffer.slice(0,i));buffer=buffer.slice(i+2);}if(done){if(buffer.trim())process(buffer);break;}}}finally{reader.releaseLock();}return doneSignal;
}
function b64(a){let s='';for(const b of new Uint8Array(a))s+=String.fromCharCode(b);return btoa(s);}
function unb64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function derive(password,salt,usage){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,usage);}
export async function encryptBackup(chats,password){
 if(password.length<10)throw Error('备份密码至少 10 个字符');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(password,salt,['encrypt']);const data=JSON.stringify({format:'xuye-backup',version:2,exported:new Date().toISOString(),chats});
 return {format:'xuye-encrypted',version:1,salt:b64(salt),iv:b64(iv),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(data)))};
}
export async function decryptBackup(obj,password){
 if(obj.format!=='xuye-encrypted'||obj.version!==1)throw Error('不支持的加密备份');
 try{const key=await derive(password,unb64(obj.salt),['decrypt']);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(obj.iv)},key,unb64(obj.data)));}catch{throw Error('密码不正确或备份文件损坏');}
}
