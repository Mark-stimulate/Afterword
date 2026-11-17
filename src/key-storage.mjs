const slot='xuye-key-storage',legacy='xuye-key-vault';
export function readKeyState(storage){
 try{const raw=storage.getItem(slot);if(raw!==null){const v=JSON.parse(raw);if(v?.mode==='plain'&&typeof v.key==='string'&&v.key.trim()&&v.key.length<=2048)return {mode:'plain',key:v.key.trim()};if(v?.mode==='encrypted'&&v.vault?.format==='afterword-key-vault')return {mode:'encrypted',vault:v.vault};return {mode:'none'};}const vault=JSON.parse(storage.getItem(legacy));return vault?.format==='afterword-key-vault'?{mode:'encrypted',vault}:{mode:'none'};}catch{return {mode:'none'};}
}
export function savePlainKey(storage,value){
 const key=typeof value==='string'?value.trim():'';if(key.length>2048)throw Error('API Key 过长');if(!key){clearSavedKey(storage);return '';}
 storage.setItem(slot,JSON.stringify({mode:'plain',key}));storage.removeItem(legacy);return key;
}
export function saveEncryptedKey(storage,vault){
 if(vault?.format!=='afterword-key-vault')throw Error('加密 Key 格式无效');storage.setItem(slot,JSON.stringify({mode:'encrypted',vault}));storage.removeItem(legacy);
}
export function clearSavedKey(storage){storage.removeItem(slot);storage.removeItem(legacy);}
