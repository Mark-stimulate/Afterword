import {createDocumentUI} from './document-ui.mjs';
import {createSpeech} from './speech.mjs';
import {prepareImage,startRecording} from './browser-media.mjs';
import {IMAGE_LIMIT,ttsRequest,sourcesFor,cleanAnnotations,validateWav} from './media.mjs';

export function createMediaUI({$,el,button,field,note,modal,toast,getKey,isBusy,apiError,loadLocal,storeLocal,save}) {
 let images=[],webEnabled=false,thinkingEnabled=false,generation=0,preparing=false,dispose=()=>{};
 const documents=createDocumentUI({$,el,button,field,note,modal,toast,getKey,isBusy,save});
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
  const chars=[...(message.content||'')],annotations=cleanAnnotations(message.annotations),sources=sourcesFor(message),marks=new Map();
  for(const a of annotations){const c=a.url_citation;if(c.end_index<1||c.end_index>chars.length||c.start_index<0||c.start_index>=c.end_index)continue;const number=sources.findIndex(s=>s.url===c.url)+1;if(!number)continue;const list=marks.get(c.end_index)||new Set();list.add(number);marks.set(c.end_index,list);}
  let start=0;for(const end of [...marks.keys()].sort((a,b)=>a-b)){container.append(document.createTextNode(chars.slice(start,end).join('')));for(const n of marks.get(end)){const source=sources[n-1],a=el('a',`[${n}]`,'citation');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','来源 '+n+'：'+source.title);container.append(a);}start=end;}container.append(document.createTextNode(chars.slice(start).join('')));
 }
 function renderExtras(article,message){
  documents.render(article,message);
  if(message.images?.length){const grid=el('div',undefined,'message-images');for(const image of message.images){const a=button(grid,'',()=>{const b=modal('查看图片'),img=el('img');img.src=image.data;img.alt=image.name;img.className='image-viewer';b.append(img);note(b,'这是保存在此浏览器中的处理后图片。');});const img=el('img');img.src=image.data;img.alt=image.name;a.append(img);a.setAttribute('aria-label','查看图片 '+image.name);}article.append(grid);}
  const sources=sourcesFor(message);if(sources.length){const details=el('details',undefined,'source-list');details.append(el('summary',`来源与参考 · ${sources.length}`));sources.forEach((s,i)=>{const a=el('a',`${i+1}. ${s.title}`);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';details.append(a);});article.append(details);}
  if(message.toolStatus)article.append(el('p',message.toolStatus,'subtle'));
 }
 $('#voiceBtn').onclick=voicePanel;
 return {draw,cleanup,stopSpeech:()=>speech.stop(true),resetDraft,readAloud,renderContent,renderExtras,uploadDocuments:signal=>documents.upload(signal),options:()=>({images:[...images],webEnabled,thinkingEnabled,...documents.options()}),assertReady(){if(preparing)throw Error('图片正在处理，请稍候再发送');},sent(){images=[];documents.reset();draw();},settings(){const b=modal('文件、图片、语音与联网');note(b,'这些功能的入口免费开放，调用费用由 DeepSeek 按你的账户计收。');const label=el('label','朗读声音'),select=el('select');select.id='speechVoice';label.htmlFor=select.id;for(const [id,name]of [['stella','Stella · 女声'],['tide','Tide · 男声']]){const option=el('option',name);option.value=id;select.append(option);}select.value=loadLocal('voice','tide')==='stella'?'stella':'tide';select.onchange=()=>{try{storeLocal('voice',select.value);speech.stop(true);toast('朗读声音已保存');}catch(e){toast(e.message);}};b.append(label,select);for(const [title,text]of [['文件','点击「文件」选择 PDF、Word、PPT、表格、电子书或文本 / 代码。每条消息最多 4 个，每个不超过 20 MB。确认后加入草稿，点击发送才直传 DeepSeek。解析可能按页计费；官方最长保留 30 天，删除或过期后需重加原件。聊天只备份名称与引用，不含原文件。'],['图片','输入框下方点击「图片」。每次最多 4 张，原图每张不超过 8 MB；本地缩放至最长边 1536 像素并重新编码，不保留原图元数据；GIF 仅取一帧。历史与本轮合计最多 8 张，超出时移除最早的完整对话轮次。'],['语音输入','点击「语音」录音，试听后转成文字，检查再发送。关闭窗口会停止录音或请求并释放音频。'],['回复朗读','完整回复旁点击「朗读」即生成并播放，再点可停止。朗读文字会发送给 DeepSeek 并单独计费；声音在上方选择。同一段音频在本页可重复播放，切换对话、重新渲染消息或关闭页面后释放。'],['深度思考','默认关闭，点击输入区的开关直接切换。开启后模型先思考再回答，可能增加等待时间和 API 用量；可与联网同时开启。切换对话或刷新后关闭。'],['联网','默认关闭，点击开关直接切换；开启后由模型决定搜索和读取网页。答案显示引用，来源链接只在你点击时访问。切换对话或刷新后关闭。'],['本地数据','发送的处理后图片和引用随对话保存在本机，并包含在 v2 备份中；麦克风录音、朗读音频和 Key 不进入备份。']]){b.append(el('h3',title));note(b,text);}}};
}
