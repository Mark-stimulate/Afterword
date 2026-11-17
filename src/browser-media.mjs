import {imageMime,IMAGE_BYTES,encodeWav,resampleVoice} from './media.mjs';
export async function prepareImage(file) {
 if(file.size>8*1024*1024)throw Error('每张原图请小于 8 MB');
 if(!imageMime(new Uint8Array(await file.slice(0,16).arrayBuffer())))throw Error('请选择 JPEG、PNG、WebP 或 GIF 图片');
 const url=URL.createObjectURL(file),img=new Image();
 try {await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('无法读取这张图片'));img.src=url;});
 if(img.naturalWidth>8192||img.naturalHeight>8192)throw Error('图片边长请不超过 8192 像素');
 const ratio=Math.min(1,1536/Math.max(img.naturalWidth,img.naturalHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
 const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
 let data=canvas.toDataURL('image/jpeg',.85);if(data.length>IMAGE_BYTES*4/3)data=canvas.toDataURL('image/jpeg',.65);
 if(data.length>IMAGE_BYTES*4/3)throw Error('图片处理后仍太大，请换一张较小的图片');
 return {name:file.name.slice(0,120),data};
 } finally {img.src='';URL.revokeObjectURL(url);}
}
export async function startRecording(onSeconds,signal) {
 if(signal.aborted)throw new DOMException('取消录音','AbortError');
 if(!navigator.mediaDevices?.getUserMedia||!globalThis.AudioContext)throw Error('当前浏览器无法录音，请使用 HTTPS 下的新版浏览器');
 let stream,ctx,node,timer;const chunks=[];let total=0,stopped=false,resolveDone;const done=new Promise(r=>resolveDone=r);
 const release=()=>{clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());node?.disconnect();ctx?.close().catch(()=>{});};
 const abort=()=>{stopped=true;release();resolveDone();};signal.addEventListener('abort',abort,{once:true});
 try {
 stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
 if(signal.aborted)throw new DOMException('取消录音','AbortError');
 ctx=new AudioContext({sampleRate:16000});await ctx.resume();await ctx.audioWorklet.addModule(new URL('./recorder-worklet.js',import.meta.url));
 if(signal.aborted)throw new DOMException('取消录音','AbortError');
 const rate=ctx.sampleRate,max=rate*115;
 node=new AudioWorkletNode(ctx,'afterword-capture',{processorOptions:{maximum:max}});
 node.port.onmessage=e=>{if(e.data.samples&&!stopped){const part=e.data.samples.subarray(0,Math.max(0,max-total));chunks.push(part);total+=part.length;}if(e.data.done)resolveDone();if(e.data.limit)onSeconds(115);};
 const mute=ctx.createGain();mute.gain.value=0;ctx.createMediaStreamSource(stream).connect(node);node.connect(mute);mute.connect(ctx.destination);
 const started=Date.now();timer=setInterval(()=>onSeconds(Math.min(115,Math.floor((Date.now()-started)/1000))),250);
 return {async stop(){clearInterval(timer);node.port.postMessage('stop');let timeout;await Promise.race([done,new Promise(r=>timeout=setTimeout(r,1000))]);clearTimeout(timeout);stopped=true;release();signal.removeEventListener('abort',abort);if(signal.aborted)throw new DOMException('取消录音','AbortError');if(total<rate*.25)throw Error('录音太短，请至少说半秒钟');const all=new Float32Array(total);let i=0;for(const c of chunks){all.set(c,i);i+=c.length;}
 const blob=new Blob([encodeWav(resampleVoice(all,rate),16000)],{type:'audio/wav'});if(blob.size>8*1024*1024)throw Error('录音太大，请缩短后重试');return blob;},cancel:abort};
 }catch(e){release();signal.removeEventListener('abort',abort);throw e;}
}
