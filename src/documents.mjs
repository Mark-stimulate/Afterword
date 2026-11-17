export const DOCUMENT_LIMIT=4;
export const DOCUMENT_BYTES=20*1024*1024;
export const DOCUMENT_LIFETIME=30*24*60*60;
const parsed=/\.(pdf|docx?|pptx?)$/i;
const accepted=/\.(pdf|docx?|pptx?|xlsx?|epub|mobi|txt|md|markdown|csv|tsv|json|jsonl|log|xml|html?|css|[cm]?js|jsx|tsx?|py|java|c|cpp|h|hpp|rs|go|rb|php|sql|ya?ml|toml|ini|sh|ps1)$/i;
const purposes=new Set(['user_data','text_recognition','rich_layout_recognition']);
export function describeDocument(file,withFigures=false){
 if(!file||typeof file.name!=='string'||!accepted.test(file.name))throw Error('请选择 PDF、Office、表格、电子书或文本 / 代码文件；聊天导出 ZIP 请用侧边栏「导入对话」');
 if(!Number.isSafeInteger(file.size)||file.size<1||file.size>DOCUMENT_BYTES)throw Error('每个文件需为 1 字节至 20 MB');
 return {name:file.name.slice(0,180),bytes:file.size,purpose:parsed.test(file.name)?(withFigures?'rich_layout_recognition':'text_recognition'):'user_data'};
}
export function cleanDocuments(value){
 if(value==null)return [];
 if(!Array.isArray(value)||value.length>DOCUMENT_LIMIT)throw Error('每条消息最多 4 个文件');
 return value.map(x=>{
  if(!x||typeof x.id!=='string'||!/^file-api-[A-Za-z0-9_-]{1,180}$/.test(x.id)||typeof x.name!=='string'||!Number.isSafeInteger(x.bytes)||x.bytes<1||x.bytes>DOCUMENT_BYTES||!purposes.has(x.purpose)||!Number.isSafeInteger(x.expiresAt)||x.expiresAt<1)throw Error('文件引用无效，请重新添加原文件');
  return {id:x.id,name:x.name.slice(0,180),bytes:x.bytes,purpose:x.purpose,expiresAt:x.expiresAt,...(x.deleted===true?{deleted:true}:{})};
 });
}
export function documentParts(value,now=Date.now()){
 return cleanDocuments(value).map(d=>d.deleted||d.expiresAt*1000<=now?{type:'text',text:`[附件「${d.name}」${d.deleted?'已删除':'已过期'}，本次无法读取；需要时请用户重新附加原文件。]`}:{type:'file',file_id:d.id});
}
export async function uploadDocument(file,key,{withFigures=false,signal,fetchImpl=fetch}={}){
 const spec=describeDocument(file,withFigures);if(!key)throw Error('请先配置 API Key');
 const ctl=new AbortController(),abort=()=>ctl.abort();if(signal?.aborted)ctl.abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,spec.purpose==='user_data'?600000:270000);
 try{
  const form=new FormData();form.append('purpose',spec.purpose);form.append('expires_after[anchor]','created_at');form.append('expires_after[seconds]',String(DOCUMENT_LIFETIME));form.append('file',file,file.name);
  const r=await fetchImpl('https://api.deepseek.com/files',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:ctl.signal});
  if(!r.ok)throw Error(({400:'文件无法解析、格式不支持或受密码保护',401:'API Key 无效或已撤销',402:'API 账户余额不足',408:'上传超时',413:'文件过大',429:'官方正在处理的文件过多，请稍后重试',504:'官方文件解析超时'}[r.status]||`官方文件接口返回 HTTP ${r.status}`)+'。未自动重试；解析成功后即使中断，也可能已计费。');
  const data=await r.json();return cleanDocuments([{...spec,id:data.id,expiresAt:data.expires_at}])[0];
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
