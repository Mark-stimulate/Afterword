import {renderMarkdown} from './markdown.mjs';
import {createDocumentUI} from './document-ui.mjs';
import {createSpeech} from './speech.mjs';
import {prepareImage,startRecording} from './browser-media.mjs';
import {IMAGE_LIMIT,cleanImages,ttsRequest,sourcesFor,cleanAnnotations,validateWav} from './media.mjs';

export function createMediaUI({$,el,button,field,note,modal,toast,getKey,isBusy,apiError,loadLocal,storeLocal,save,settingSection,settingDetails}) {
 let images=[],webEnabled=false,thinkingEnabled=false,generation=0,preparing=false,dispose=()=>{};
 const documents=createDocumentUI({$,el,button,field,note,modal,toast,getKey,isBusy,save,loadLocal});
 const speech=createSpeech({getKey,getVoice:()=>loadLocal('voice','tide'),apiError});
 const cleanup=()=>{speech.stop(true);const fn=dispose;dispose=()=>{};fn();};
 const requestError=e=>e.name==='AbortError'?'已取消或请求超时；已发生的用量仍可能计费。':e.message==='Failed to fetch'?'无法直连官方服务，请检查网络或浏览器兼容性。不会自动使用代理。':e.message;
 function draw(){
  documents.draw();
  const tray=$('#attachments');tray.replaceChildren();tray.hidden=!images.length;
  images.forEach((img,i)=>{const card=el('div',undefined,'attachment-card'),pic=el('img');pic.src=img.data;pic.alt=img.name;card.append(pic,el('span',img.name));const remove=button(card,'×',()=>{images.splice(i,1);draw();});remove.setAttribute('aria-label','移除图片 '+img.name);remove.disabled=isBusy();tray.append(card);});
  $('#thinkingBtn').setAttribute('aria-pressed',String(thinkingEnabled));$('#thinkingBtn').textContent=thinkingEnabled?'深度思考 · 开':'深度思考 · 关';
  $('#webBtn').setAttribute('aria-pressed',String(webEnabled));$('#webBtn').textContent=webEnabled?'联网 · 开':'联网 · 关';
  $('#imageBtn').textContent=preparing?'正在处理…':'图片';$('#imageBtn').disabled=preparing||isBusy();
 }
 function resetDraft(){documents.reset();speech.stop(true);generation++;images=[];preparing=false;webEnabled=false;thinkingEnabled=false;$('#imageInput').value='';draw();}
 $('#imageBtn').onclick=()=>{if(!isBusy())$('#imageInput').click();};
 $('#imageInput').onchange=async()=>{const files=[...$('#imageInput').files];$('#imageInput').value='';if(!files.length||preparing||isBusy())return;const run=++generation;
  if(images.length+files.length>IMAGE_LIMIT){toast('每条消息最多 4 张图片，请移除一些后再添加');return;}
  preparing=true;draw();try{const prepared=[];for(const f of files)prepared.push(await prepareImage(f));if(run!==generation)return;images.push(...prepared);toast('图片已在本地处理，发送消息时才会上传；GIF 仅取静态一帧。');}catch(e){toast(e.message);}finally{if(run===generation){preparing=false;draw();}}
 };
 $('#webBtn').onclick=()=>{if(isBusy())return;webEnabled=!webEnabled;draw();};
 $('#thinkingBtn').onclick=()=>{if(isBusy())return;thinkingEnabled=!thinkingEnabled;draw();};
 function temporaryPanel(title){const b=modal(title),ctl=new AbortController(),urls=[],audios=[];let timeout;
  dispose=()=>{ctl.abort();clearTimeout(timeout);for(const a of audios){a.pause();a.removeAttribute('src');a.load();}urls.forEach(u=>URL.revokeObjectURL(u));};
  return {b,ctl,alive:()=>!ctl.signal.aborted&&b.isConnected&&$('#dialog').open,timeout(ms){clearTimeout(timeout);timeout=setTimeout(()=>ctl.abort(),ms);},clearTimeout(){clearTimeout(timeout);},audio(blob){const a=el('audio');a.controls=true;a.preload='metadata';a.setAttribute('aria-label','试听音频');const url=URL.createObjectURL(blob);urls.push(url);audios.push(a);a.src=url;b.append(a);a.onerror=()=>{if(!ctl.signal.aborted)toast('这段音频无法播放，请重新生成或更换浏览器');};return a;}};
 }
 function voicePanel(){
  if(isBusy())return;
  const p=temporaryPanel('把想说的话，慢慢说出来'),{b,ctl}=p;
  note(b,'录音先保留在本页面，可试听或丢弃。点击「转成文字」才发送给 DeepSeek，并按音频时长计费；转写后放回输入框，由你检查再发送。','notice');
  const status=el('p','每次最长 115 秒；录音与识别结果均不会自动发送为聊天。','test-result');status.setAttribute('role','status');b.append(status);
  let recorder,blob,stopping=false;
  const row=el('div',undefined,'row');b.append(row);
  const start=button(row,'开始录音',async()=>{if(!getKey()){status.textContent='请先在连接与 API 设置中填写 Key，再使用语音识别。';return;}start.disabled=true;status.textContent='正在请求麦克风…';
   try{recorder=await startRecording(seconds=>{if(!p.alive()||stopping)return;status.textContent=`正在录音 · ${seconds} / 115 秒`;if(seconds>=115)finish();},ctl.signal);if(!p.alive()){recorder.cancel();return;}stop.disabled=false;status.textContent='正在录音 · 0 / 115 秒';}
   catch(e){if(p.alive()){status.textContent=e.name==='NotAllowedError'?'未获得麦克风权限。可在浏览器站点设置允许后重试。':requestError(e);start.disabled=false;}}
  },'primary');
  const stop=button(row,'结束录音',finish);stop.disabled=true;
  const transcribe=button(row,'转成文字',async()=>{if(!blob||!getKey())return;transcribe.disabled=true;status.textContent='正在转成文字…';p.timeout(90000);
   try{const form=new FormData();form.append('file',blob,'recording.wav');const r=await fetch('https://api.deepseek.com/v1/tools/asr',{method:'POST',headers:{Authorization:'Bearer '+getKey()},body:form,signal:ctl.signal});if(!r.ok)throw Error(apiError(r.status));const data=await r.json();if(typeof data.text!=='string'||!data.text.trim())throw Error('没有识别到文字，请重新录音');if(!p.alive())return;
    const input=$('#prompt'),next=[input.value,data.text.trim()].filter(Boolean).join('\n');if(next.length>input.maxLength)throw Error('识别结果加上草稿超过输入上限，请先缩短草稿');input.value=next;$('#dialog').close();input.focus();toast('文字已放入输入框，请检查后发送');
   }catch(e){if(b.isConnected&&$('#dialog').open){status.textContent=requestError(e);transcribe.disabled=ctl.signal.aborted;}}finally{p.clearTimeout();}
  });transcribe.disabled=true;
  button(row,'丢弃并关闭',()=>$('#dialog').close());
  async function finish(){if(!recorder||stopping)return;stopping=true;stop.disabled=true;status.textContent='正在整理录音…';try{blob=await recorder.stop();if(!p.alive())return;p.audio(blob);status.textContent='录音已留在本页。可以试听，再选择是否转成文字。';transcribe.disabled=false;}catch(e){if(p.alive())status.textContent=requestError(e);}}
 }
 function readAloud(message,control,status){
  return speech.toggle(message,(state,error)=>{control.textContent=state==='loading'?'取消朗读':state==='playing'?'停止朗读':'朗读';control.setAttribute('aria-pressed',String(state==='loading'||state==='playing'));status.textContent=state==='loading'?'正在生成朗读…':state==='playing'?'正在朗读':error||'';status.hidden=!status.textContent;});
 }
 function renderContent(container,message){
  if(message.role==='assistant'){container.classList.add('markdown-body');renderMarkdown(container,message.content,{annotations:cleanAnnotations(message.annotations),sources:sourcesFor(message)});return;}
  container.textContent=message.content||'';
 }

 function renderExtras(article,message){
  documents.render(article,message);
  if(message.images?.length){const grid=el('div',undefined,'message-images');for(const image of message.images){const a=button(grid,'',()=>{const b=modal('查看图片'),img=el('img');img.src=image.data;img.alt=image.name;img.className='image-viewer';b.append(img);note(b,'这是保存在此浏览器中的处理后图片。');});const img=el('img');img.src=image.data;img.alt=image.name;a.append(img);a.setAttribute('aria-label','查看图片 '+image.name);}article.append(grid);}
  const sources=sourcesFor(message);if(sources.length){const details=el('details',undefined,'source-list');details.append(el('summary',`来源与参考 · ${sources.length}`));sources.forEach((s,i)=>{const a=el('a',`${i+1}. ${s.title}`);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';details.append(a);});article.append(details);}
  if(message.toolStatus)article.append(el('p',message.toolStatus,'subtle'));
 }
 $('#voiceBtn').onclick=voicePanel;
 return {draw,snapshotDraft:()=>({images:[...images],documents:documents.snapshot(),webEnabled,thinkingEnabled}),restoreDraft(state){speech.stop(true);generation++;preparing=false;images=[...(state?.images||[])];webEnabled=!!state?.webEnabled;thinkingEnabled=!!state?.thinkingEnabled;documents.restore(state?.documents);draw();},loadMessage(message){speech.stop(true);generation++;preparing=false;images=cleanImages(message.images);documents.loadMessage(message.documents);draw();},cleanup,stopSpeech:()=>speech.stop(true),resetDraft,readAloud,renderContent,renderExtras,uploadDocuments:signal=>documents.upload(signal),options:()=>({images:[...images],webEnabled,thinkingEnabled,...documents.options()}),assertReady(){if(preparing)throw Error('图片正在处理，请稍候再发送');},sent(){images=[];documents.reset();draw();},settings(){
  const b=modal('文件、图片、语音与联网');
  const voice=settingSection(b,'回复朗读','在回复下方点击「朗读」即可播放。');
  const label=el('label','朗读声音'),select=el('select');
  select.id='speechVoice';label.htmlFor=select.id;
  for(const [id,name] of [['tide','Tide · 男声'],['stella','Stella · 女声']]){
   const option=el('option',name);option.value=id;select.append(option);
  }
  select.value=loadLocal('voice','tide')==='stella'?'stella':'tide';
  select.onchange=()=>{
   try{storeLocal('voice',select.value);speech.stop(true);toast('朗读声音已保存');}catch(error){toast(error.message);}
  };
  voice.append(label,select);
  const documents=settingSection(b,'文档读取','设置会在下次添加文档时生效。');
  const modeLabel=el('label','PDF、Word 和 PPT 读取方式'),mode=el('select');
  mode.id='documentDefaultMode';modeLabel.htmlFor=mode.id;
  for(const [value,text] of [['text','只读取文字'],['figures','文字与图表']]){
   const option=el('option',text);option.value=value;mode.append(option);
  }
  mode.value=loadLocal('documentMode','text')==='figures'?'figures':'text';
  mode.onchange=()=>{
   try{storeLocal('documentMode',mode.value);toast('文档读取方式已保存');}catch(error){toast(error.message);}
  };
  documents.append(modeLabel,mode);
  note(documents,'读取图表可能增加用量。文件在发送消息时直传 DeepSeek。');
  const help=settingSection(b,'功能说明');
  for(const [title,text] of [
   ['文件和图片','每条消息最多 4 个文件和 4 张图片。单个原文件最多 20 MB，原图最多 8 MB。上传文件后，官方最多保留 30 天。备份只保留文档名称和引用。图片在本机缩放，GIF 仅保留一帧。'],
   ['录音和朗读','录音先留在页面，点击转成文字时才上传。点击朗读会将回复文字发送给 DeepSeek。两种音频均不写入聊天备份，费用以官方账单为准。'],
   ['联网和深度思考','这两个开关位于输入框下方，默认关闭，刷新或切换对话后会重置。联网可搜索和读取网页，打开来源链接由你决定。启用工具可能产生额外用量。']
  ])note(settingDetails(help,title),text);
 }}; 
}
