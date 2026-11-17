// Pure helpers shared by the UI, backup validation and offline tests.
export const IMAGE_LIMIT = 4;
export const IMAGE_BYTES = 1024 * 1024;
export function cleanImages(value) {
 if (value == null) return [];
 if (!Array.isArray(value) || value.length > IMAGE_LIMIT) throw Error('每条消息最多保存 4 张图片');
 return value.map(x => {
  if (!x || typeof x.data !== 'string' || x.data.length > Math.ceil(IMAGE_BYTES / 3) * 4 + 64 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(x.data)) throw Error('图片格式无效或超过本地大小限制');
  const bytes = Uint8Array.from(atob(x.data.split(',')[1]), c => c.charCodeAt(0));
  if (bytes.length > IMAGE_BYTES || !imageMime(bytes) || imageMime(bytes) !== x.data.slice(5, x.data.indexOf(';'))) throw Error('图片内容与格式不一致');
  return {data:x.data, name:String(x.name || '图片').slice(0,120)};
 });
}
export function imageMime(b) {
 if (b[0]===255 && b[1]===216 && b[2]===255) return 'image/jpeg';
 if ([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)) return 'image/png';
 const s=String.fromCharCode(...b.slice(0,12));
 if(s.startsWith('RIFF') && s.slice(8)==='WEBP') return 'image/webp';
 if(s.startsWith('GIF87a') || s.startsWith('GIF89a')) return 'image/gif';
 return '';
}
export function safeURL(value) {
 try { const u=new URL(value); return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.href.length<=8192 ? u.href : ''; } catch { return ''; }
}
export function cleanAnnotations(value) {
 if(!Array.isArray(value))return [];
 return value.slice(0,200).flatMap(a=>{const c=a?.url_citation,url=safeURL(c?.url);if(a?.type!=='url_citation'||!url)return [];
 return [{type:'url_citation',url_citation:{url,title:String(c.title||url).slice(0,300),start_index:Number.isSafeInteger(c.start_index)?c.start_index:0,end_index:Number.isSafeInteger(c.end_index)?c.end_index:0}}];});
}
export function sourcesFor(message) {
 const out=[],seen=new Set();
 const add=x=>{const url=safeURL(x?.url);if(!url||seen.has(url)||out.length>=100)return;seen.add(url);out.push({url,title:String(x.title||url).slice(0,300)});};
 for(const a of cleanAnnotations(message.annotations))add(a.url_citation);
 for(const step of Array.isArray(message.server_tool_calls)?message.server_tool_calls:[])for(const call of Array.isArray(step?.calls)?step.calls:[]){if(call?.status==='completed'){for(const source of Array.isArray(call.sources)?call.sources:[])add(source);add(call.page);}}
 return out;
}
export function chatRequest(messages, webEnabled=false, thinkingEnabled=false) {
 return {model:'deepseek-flash',messages,thinking:{type:thinkingEnabled?'enabled':'disabled'},safety_check:{level:'high'},stream:true,stream_options:{include_usage:true},max_tokens:thinkingEnabled?8192:4096,...(webEnabled?{tools:[{type:'deepseek_web_search'},{type:'deepseek_read_url'}]}:{})};
}
export function applyChunk(reply,data) {
 if(data.usage)reply.usage=data.usage;
 if(data.error)throw Error('官方服务返回错误，已保留收到的内容。');
 const choice=data.choices?.[0],delta=choice?.delta||{};
 if(typeof delta.reasoning_content==='string'){reply.reasoning_content=(reply.reasoning_content||'')+delta.reasoning_content;reply.thinking=true;}
 if(typeof delta.content==='string'&&delta.content)delete reply.thinking;
 if(typeof delta.content==='string')reply.content+=delta.content;
 if(Array.isArray(delta.annotations))reply.annotations=cleanAnnotations(delta.annotations);
 if(Array.isArray(delta.server_tool_calls))reply.server_tool_calls=delta.server_tool_calls;
 const event=choice?.server_tool_event;
 if(event?.type==='call_started')reply.toolStatus='正在查找网页资料…';
 if(event?.type==='call_completed')reply.toolStatus=event.call?.status==='failed'?'部分网页资料未能读取，正在继续…':'资料已返回，正在整理回复…';
 if(choice?.finish_reason){delete reply.toolStatus;delete reply.thinking;if(choice.finish_reason==='length')reply.error='已达到本次输出上限，回复可能未完整。';if(choice.finish_reason==='content_filter'||delta.refusal){reply.content='';reply.reasoning_content='';reply.annotations=[];if(reply.server_tool_calls)reply.server_tool_calls=reply.server_tool_calls.map(step=>({...step,reasoning_content:''}));throw Error('官方服务未能提供这次回复。请调整内容后重试。');}}
 return !!choice?.finish_reason;
}
export function previewMessages(messages) {
 return messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(p=>p.type==='image_url'?{type:'image_url',image_url:{url:'[本地图片：发送时包含图片数据]'}}:p):m.content,...(m.server_tool_calls?{server_tool_calls:'[上次搜索与网页读取记录，将随上下文发送]'}:{})}));
}
export function ttsRequest(text,voice='stella') {
 text=text.trim();
 // Count conservatively: every non-ASCII code point costs at most two here.
 const count=[...text].reduce((n,c)=>n+(c.codePointAt(0)>127?2:1),0);
 if(!text)throw Error('请先填写要朗读的文字');
 if(count>10000)throw Error('本次文字太长，请在预览中缩短到约 5000 个汉字以内');
 const body={text,voice_id:voice==='tide'?'tide':'stella',format:'wav',filter_markdown:true};
 if(new TextEncoder().encode(JSON.stringify(body)).length>64*1024)throw Error('朗读文字过长，请缩短后重试');
 return body;
}
export function encodeWav(samples,sampleRate) {
 const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer);
 const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const n=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,n<0?n*32768:n*32767,true);}
 return buffer;
}

export function resampleVoice(input,rate) {
 if(rate===16000)return input;
 const ratio=rate/16000,out=new Float32Array(Math.floor(input.length/ratio));
 for(let i=0;i<out.length;i++){const start=Math.floor(i*ratio),end=Math.min(input.length,Math.max(start+1,Math.floor((i+1)*ratio)));let sum=0;for(let j=start;j<end;j++)sum+=input[j];out[i]=sum/(end-start);}
 return out;
}

export function validateWav(buffer) {
 const v=new DataView(buffer),text=(at,n)=>String.fromCharCode(...new Uint8Array(buffer,at,n));
 if(buffer.byteLength<44||text(0,4)!=='RIFF'||text(8,4)!=='WAVE')throw Error('返回的音频不是有效 WAV');
 const size=v.getUint32(4,true);if(size!==0xffffffff&&size+8>buffer.byteLength)throw Error('音频传输未完成，请重新生成');
 let pos=12,format=false,data=false;
 while(pos+8<=buffer.byteLength){const id=text(pos,4),n=v.getUint32(pos+4,true),available=buffer.byteLength-pos-8;
  if(n!==0xffffffff&&n>available)throw Error('音频传输未完成，请重新生成');
  if(id==='fmt ')format=n>=16;
  if(id==='data'){data=available>0&&(n===0xffffffff||n>0);break;}
  if(n===0xffffffff)break;pos+=8+n+(n%2);
 }
 if(!format||!data)throw Error('音频内容不完整，请重新生成');
}
