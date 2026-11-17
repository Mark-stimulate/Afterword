const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function verifyLicense(envelope,publicKey,now=Date.now()){
 try{
  if(!envelope||envelope.format!=='xuye-license-v1'||typeof envelope.payload!=='string'||typeof envelope.signature!=='string'||envelope.payload.length>10000)throw Error();
  const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unb64(envelope.signature),new TextEncoder().encode(envelope.payload)))throw Error();
  const p=JSON.parse(envelope.payload);
  if(p.product!=='xuye'||p.tier!=='pro'||p.major!==0||!['test','paid'].includes(p.kind)||typeof p.id!=='string'||!p.id||p.id.length>120)throw Error();
  const start=Date.parse(p.notBefore),end=Date.parse(p.expires);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error();
  if(now<start)throw Error('授权尚未生效');
  if(now>=end)throw Error('授权已到期；你的记录、主题和备份仍可使用');
  return p;
 }catch(e){if(e.message?.startsWith('授权'))throw e;throw Error('授权无效、内容被修改，或不是本发行版的许可证');}
}
