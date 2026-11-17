import {DOCUMENT_LIMIT,describeDocument,uploadDocument,cleanDocuments} from './documents.mjs';
export function createDocumentUI({$,el,button,note,modal,toast,getKey,isBusy,save}){
 let draft=[],uploading=false,uploadKey='';
 const size=n=>n<1024*1024?`${Math.ceil(n/1024)} KB`:`${(n/1024/1024).toFixed(1)} MB`;
 function draw(){const tray=$('#documents');tray.replaceChildren();tray.hidden=!draft.length;
  for(const [i,d] of draft.entries()){const card=el('div',undefined,'document-card');card.append(el('span',d.spec.name),el('small',`${size(d.spec.bytes)} · ${d.status|| (d.uploaded?'已上传，待发送':'待发送')}`));const remove=button(card,'×',()=>{draft.splice(i,1);draw();});remove.setAttribute('aria-label','移除文件 '+d.spec.name);remove.disabled=isBusy()||uploading;tray.append(card);}
  $('#fileBtn').disabled=isBusy()||uploading;
 }
 $('#fileBtn').onclick=()=>{if(!isBusy()&&!uploading)$('#fileInput').click();};
 $('#fileInput').onchange=()=>{const files=[...$('#fileInput').files];$('#fileInput').value='';if(!files.length||isBusy()||uploading)return;
  try{if(draft.length+files.length>DOCUMENT_LIMIT)throw Error('每条消息最多 4 个文件');const selected=files.map(file=>({file,spec:describeDocument(file)}));const b=modal('添加到这条消息');
   note(b,'点击「发送」后，文件将由浏览器直传 DeepSeek 官方账户，并保留最多 30 天。文档解析可能按页计费，问答按输入量计费；中断后解析仍可能完成并计费。拾语只保存名称和引用，备份不含原文件，请保留原件。','notice');
   const list=el('div',undefined,'document-list');b.append(list);for(const d of selected)note(list,`${d.spec.name} · ${size(d.spec.bytes)}`);
   const hasParsed=selected.some(d=>d.spec.purpose!=='user_data');let figures;
   if(hasParsed){const label=el('label','PDF / Word / PPT 读取方式');figures=el('select');figures.id='documentMode';label.htmlFor=figures.id;for(const [value,text]of [['text','只读取文字'],['figures','文字与图表（可能增加用量）']]){const o=el('option',text);o.value=value;figures.append(o);}b.append(label,figures);}
   const row=el('div',undefined,'row');b.append(row);button(row,'添加到消息',()=>{if(isBusy())return;for(const d of selected){d.spec=describeDocument(d.file,figures?.value==='figures');draft.push(d);}draw();$('#dialog').close();$('#prompt').focus();},'primary');button(row,'取消',()=>$('#dialog').close());
  }catch(e){toast(e.message);}
 };
 async function upload(signal){uploading=true;try{const key=getKey();if(uploadKey&&uploadKey!==key)for(const d of draft)d.uploaded=null;uploadKey=key;
   for(const d of draft){if(signal.aborted)throw new DOMException('已停止','AbortError');if(d.uploaded&&d.uploaded.expiresAt*1000>Date.now())continue;d.status='正在上传并解析…';draw();try{d.uploaded=await uploadDocument(d.file,key,{withFigures:d.spec.purpose==='rich_layout_recognition',signal});d.status='已上传，待发送';}catch(e){d.status='上传未完成，可移除或重试';throw e;}finally{draw();}}
  }finally{uploading=false;draw();}}
 function render(article,message){if(!message.documents?.length)return;const list=el('div',undefined,'message-documents');
  for(const d of cleanDocuments(message.documents)){const expired=d.deleted||d.expiresAt*1000<=Date.now();const view=button(list,`${d.name} · ${expired?'不可读取':size(d.bytes)}`,()=>{const b=modal('文件信息');note(b,d.name,'notice');note(b,`${size(d.bytes)} · ${d.purpose==='rich_layout_recognition'?'文字与图表':d.purpose==='text_recognition'?'仅文字':'文本 / 表格 / 电子书'}`);note(b,expired?'此引用已删除或过期，请重新添加原文件。':`此文件保存在上传时使用的 DeepSeek 账户中，有效期至 ${new Date(d.expiresAt*1000).toLocaleString()}。拾语没有原文件副本，备份只含引用；换 API 账户后此引用可能无法读取。`);
    if(!expired)button(b,'从 DeepSeek 删除这个文件',async()=>{if(isBusy())throw Error('请先停止生成');if(!getKey())throw Error('请先配置上传此文件时使用的账户 Key');if(!confirm('删除官方账户中的此文件？使用同一文件引用的对话都将无法再读取它。请先保留原件。'))return;const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);try{const r=await fetch('https://api.deepseek.com/files/'+encodeURIComponent(d.id),{method:'DELETE',headers:{Authorization:'Bearer '+getKey()},signal:ctl.signal});if(!r.ok)throw Error(`官方删除失败（HTTP ${r.status}），请确认当前 Key 属于上传账户`);const data=await r.json();if(data.deleted!==true)throw Error('官方尚未确认删除，请稍后重试');for(const item of message.documents)if(item.id===d.id)item.deleted=true;await save(d.id);$('#dialog').close();view.textContent=d.name+' · 已删除';toast('官方已确认删除。其他对话中的同一引用也将无法使用。');}finally{clearTimeout(timer);}},'danger');
   });}
  article.append(list);
 }
 return {draw,upload,render,reset(){draft=[];uploadKey='';$('#fileInput').value='';draw();},options:()=>({documents:draft.flatMap(d=>d.uploaded?[d.uploaded]:[]),pendingDocuments:draft.filter(d=>!d.uploaded).map(d=>({...d.spec}))})};
}
