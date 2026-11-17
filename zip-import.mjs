// Read only the expected session files in a DeepSeek export. Nothing is written to disk.
const MAX_ZIP=64*1024*1024, MAX_ENTRY=20*1024*1024, MAX_TOTAL=100*1024*1024, MAX_ENTRIES=3000, MAX_SESSIONS=500;
const utf8=new TextDecoder('utf-8',{fatal:true});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
async function inflate(data,expected){
 let stream;try{stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw Error('当前浏览器不支持 ZIP 解压，请更新浏览器或先解压后导入 JSON');}
 const reader=stream.getReader(),chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_ENTRY||size>expected){await reader.cancel();throw Error('解压后的文件超出大小限制');}chunks.push(value);}}finally{reader.releaseLock();}
 if(size!==expected)throw Error('解压长度不符');const out=new Uint8Array(size);let p=0;for(const c of chunks){out.set(c,p);p+=c.length;}return out;
}
export async function readDeepSeekZip(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>MAX_ZIP)throw Error('ZIP 超过 64 MB，请先解压并分批导入 JSON');
 if(bytes.length<22)throw Error('ZIP 文件不完整');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=p=>v.getUint16(p,true),u32=p=>v.getUint32(p,true);
 let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length){end=p;break;}}
 if(end<0)throw Error('无法识别 ZIP 或文件不完整');
 const count=u16(end+10),dirSize=u32(end+12),dirOffset=u32(end+16);
 if(u16(end+4)||u16(end+6)||u16(end+8)!==count||count===65535||dirOffset===0xffffffff||dirSize===0xffffffff)throw Error('暂不支持分卷或 ZIP64 压缩包，请解压后导入');
 if(count>MAX_ENTRIES||dirOffset+dirSize>end)throw Error('ZIP 文件目录过大或已损坏');
 const sessions=[],warnings=[];let p=dirOffset,total=0,found=0;
 for(let n=0;n<count;n++){
  if(p+46>dirOffset+dirSize||u32(p)!==0x02014b50)throw Error('ZIP 文件目录损坏');
  const flags=u16(p+8),method=u16(p+10),crc=u32(p+16),compressed=u32(p+20),size=u32(p+24),nl=u16(p+28),xl=u16(p+30),cl=u16(p+32),offset=u32(p+42),next=p+46+nl+xl+cl;
  if(next>dirOffset+dirSize)throw Error('ZIP 文件目录损坏');let name;try{name=utf8.decode(bytes.subarray(p+46,p+46+nl));}catch{name='';}p=next;
  if(!/(^|\/)chat_sessions\/[^/]+\.json$/i.test(name))continue;
  found++;if(found>MAX_SESSIONS)throw Error('ZIP 中会话超过 500 个，请先解压并分批导入');
  if((flags&1)||![0,8].includes(method)||compressed===0xffffffff||size===0xffffffff||offset===0xffffffff){warnings.push(`${name}：不支持加密、ZIP64 或此压缩方式`);continue;}
  if(size>MAX_ENTRY||total+size>MAX_TOTAL){warnings.push(`${name}：解压后超过大小限制`);continue;}total+=size;
  try{
   if(offset+30>dirOffset||u32(offset)!==0x04034b50)throw Error('本地文件头损坏');
   const localFlags=u16(offset+6),localMethod=u16(offset+8),localNameLength=u16(offset+26),localExtraLength=u16(offset+28),start=offset+30+localNameLength+localExtraLength;
   if(localFlags!==flags||localMethod!==method||start+compressed>dirOffset)throw Error('文件位置或压缩信息不一致');
   const localName=utf8.decode(bytes.subarray(offset+30,offset+30+localNameLength));if(localName!==name)throw Error('文件名不一致');
   const data=bytes.subarray(start,start+compressed);const raw=method===0?data:await inflate(data,size);
   if(raw.length!==size||crc32(raw)!==crc)throw Error('文件校验失败');sessions.push({name,text:utf8.decode(raw)});
  }catch(e){warnings.push(`${name}：${e.message||'无法读取'}`);}
 }
 if(p!==dirOffset+dirSize)throw Error('ZIP 文件目录长度不符');
 if(!found)throw Error('没有找到 chat_sessions 文件夹中的 JSON；请确认选择的是 DeepSeek 原始导出包');
 return {sessions,warnings,found};
}
