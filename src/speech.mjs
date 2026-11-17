import {ttsRequest,validateWav} from './media.mjs';
// One playback and one in-memory audio cache; no persistent audio storage.
export function createSpeech({getKey,getVoice,apiError,fetcher=fetch,makeAudio=()=>new Audio(),createURL=b=>URL.createObjectURL(b),revokeURL=u=>URL.revokeObjectURL(u),timeout=120000}){
 let active=null,cache=null;
 function stop(clear=false){const old=active;active=null;if(old){old.ctl.abort();clearTimeout(old.timer);old.audio?.pause();if(old.audio){old.audio.removeAttribute('src');old.audio.load();}old.notify('idle');}if(clear&&cache){revokeURL(cache.url);cache=null;}}
 async function toggle(message,notify){
  if(active?.message===message){stop();return;}
  stop();const token={message,notify,ctl:new AbortController()};active=token;
  try{
   const voice=getVoice(),body=ttsRequest(message.content,voice);const identity=JSON.stringify(body);
   if(cache?.identity!==identity){
    if(!getKey())throw Error('请先在连接与 API 设置中填写 Key，再使用朗读。');
    if(cache){revokeURL(cache.url);cache=null;}notify('loading');token.timer=setTimeout(()=>token.ctl.abort(),timeout);
    const response=await fetcher('https://api.deepseek.com/v1/tools/tts',{method:'POST',headers:{Authorization:'Bearer '+getKey(),'Content-Type':'application/json'},body:identity,signal:token.ctl.signal});
    if(!response.ok)throw Error(apiError(response.status));const blob=await response.blob();if(blob.size<44||blob.size>32*1024*1024||!response.headers.get('content-type')?.includes('audio/'))throw Error('服务未返回有效音频，请重试');validateWav(await blob.arrayBuffer());
    if(active!==token||token.ctl.signal.aborted)return;
    cache={identity,url:createURL(blob)};clearTimeout(token.timer);
   }
   if(active!==token)return;const audio=makeAudio();token.audio=audio;audio.src=cache.url;
   audio.onended=()=>{if(active===token)stop();};audio.onerror=()=>{if(active===token){stop(true);notify('error','这段音频无法播放，请重试。');}};
   notify('playing');await audio.play();
  }catch(e){if(active!==token)return;stop();notify('error',e.name==='NotAllowedError'?'浏览器阻止了播放，请再点一次朗读。':e.name==='AbortError'?'朗读请求超时，请重试；已发生的用量仍可能计费。':e.message==='Failed to fetch'?'无法连接官方语音服务，请检查网络。':e.message);}
 }
 return {toggle,stop};
}
