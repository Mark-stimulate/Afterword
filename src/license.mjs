const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function licenseActive(info,now=Date.now()){
 return !!info&&now>=Date.parse(info.notBefore)&&(info.expires===null||now<Date.parse(info.expires));
}
export async function verifyLicense(envelope,publicKey,{now=Date.now(),channel='community'}={}){
 try{
  if(!['community','official'].includes(channel)||publicKey?.d)throw Error();
  if(!envelope||envelope.format!=='xuye-license-v1'||typeof envelope.payload!=='string'||typeof envelope.signature!=='string'||envelope.payload.length>10000||envelope.signature.length>200)throw Error();
  const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unb64(envelope.signature),new TextEncoder().encode(envelope.payload)))throw Error();
  const p=JSON.parse(envelope.payload);
  if(p.product!=='xuye'||p.tier!=='pro'||p.major!==0||p.kind!==(channel==='community'?'community':'paid')||typeof p.id!=='string'||!p.id||p.id.length>120)throw Error();
  if(typeof p.notBefore!=='string'||(p.expires!==null&&typeof p.expires!=='string'))throw Error();
  const start=Date.parse(p.notBefore),end=p.expires===null?Infinity:Date.parse(p.expires);
  if(!Number.isFinite(start)||!(Number.isFinite(end)||p.expires===null)||end<=start)throw Error();
  if(now<start)throw Error('授权尚未生效');
  if(now>=end)throw Error('授权已到期；你的记录、主题和备份仍可使用');
  return p;
 }catch(e){if(e.message?.startsWith('授权'))throw e;throw Error('授权无效、内容被修改，或不适用于此站点。社区免费授权不能用于运营站点。');}
}
