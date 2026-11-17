const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const decode=s=>{if(typeof s!=='string'||s.length>8192)throw Error();return Uint8Array.from(atob(s),c=>c.charCodeAt(0));};
const utf8=new TextEncoder();
function checkPassword(password){if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('解锁密码需为 12–1024 个字符');}
async function derive(password,salt){checkPassword(password);const base=await crypto.subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function sealKey(value,password){
 checkPassword(password);const key=value?.trim();if(!key||key.length>2048)throw Error('请先填写有效的 API Key');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const derived=await derive(password,salt);
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode('afterword-key-vault-v1')},derived,utf8.encode(key));
 return {format:'afterword-key-vault',version:1,iterations:600000,salt:encode(salt),iv:encode(iv),data:encode(data)};
}
export async function openKey(vault,password){
 checkPassword(password);
 try{if(vault?.format!=='afterword-key-vault'||vault.version!==1||vault.iterations!==600000)throw Error();const salt=decode(vault.salt),iv=decode(vault.iv),data=decode(vault.data);if(salt.length!==16||iv.length!==12||data.length<17||data.length>8192)throw Error();const key=await derive(password,salt);const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:utf8.encode('afterword-key-vault-v1')},key,data);const value=new TextDecoder('utf-8',{fatal:true}).decode(raw);if(!value||value.length>2048)throw Error();return value;}catch{throw Error('无法解锁：密码不正确，或本机保存的 Key 已损坏。可以删除后重新填写。');}
}
