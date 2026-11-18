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

export async function verifySiteLicense(envelope,publicKey,{channel,verifyUrl='',request=fetch}={}){
 const license=await verifyLicense(envelope,publicKey,{channel});
 if(!verifyUrl||channel!=='official')return license;
 let response,result;
 try{
  response=await request(verifyUrl,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({format:envelope.format,payload:envelope.payload,signature:envelope.signature}),
   credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(response.ok)result=await response.json();
 }catch{throw Error('暂时连不上授权服务，请稍后重试。');}
 if(response.status===403)throw Error('这份授权已撤销或未登记，请联系站点运营者。');
 if(!response.ok||result?.active!==true||result.id!==license.id)throw Error('暂时无法确认授权状态，请稍后重试。');
 return license;
}
