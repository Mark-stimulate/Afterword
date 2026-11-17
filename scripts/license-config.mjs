import {PUBLIC_KEY as COMMUNITY_KEY} from '../src/build-config.mjs';
const sameKey=(a,b)=>a?.kty===b?.kty&&a?.crv===b?.crv&&a?.x===b?.x&&a?.y===b?.y;
const LEGACY_KEY={kty:'EC',crv:'P-256',x:'83vmd6ywKa-41VBl6nQix14jCiiP1Tjls7TDOh17MS8',y:'JngXGvStU3CaQI9W8BPJJVUJzx8gSNBN-oORY5i9NzQ'};
export async function buildLicenseConfig({community=false,publicKeyText}={}){
 if(community)return {channel:'community',publicKey:COMMUNITY_KEY};
 if(!publicKeyText)throw Error('正式构建缺少 AFTERWORD_LICENSE_PUBLIC_KEY；已停止，避免误用社区授权配置。');
 let key;try{key=JSON.parse(publicKeyText);}catch{throw Error('正式公钥必须是有效的 JWK JSON');}
 if(!key||key.kty!=='EC'||key.crv!=='P-256'||typeof key.x!=='string'||typeof key.y!=='string'||key.d)throw Error('仅接受 ECDSA P-256 公钥，禁止传入私钥');
 if(sameKey(key,COMMUNITY_KEY)||sameKey(key,LEGACY_KEY))throw Error('正式构建不能使用社区或旧测试公钥');
 const publicKey={kty:'EC',crv:'P-256',x:key.x,y:key.y};
 try{await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);}catch{throw Error('正式公钥不是有效的 P-256 验签公钥');}
 return {channel:'official',publicKey};
}
export const configSource=config=>`// Public verification configuration only.\nexport const LICENSE_CHANNEL=${JSON.stringify(config.channel)};\nexport const PUBLIC_KEY=${JSON.stringify(config.publicKey)};\n`;
