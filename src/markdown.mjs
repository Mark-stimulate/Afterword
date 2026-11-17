import {lexer} from './vendor/marked.mjs';
import {safeURL} from './media.mjs';
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'};
const decode=text=>String(text||'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(raw,name)=>{if(name[0]!=='#')return entities[name.toLowerCase()]||raw;const point=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):parseInt(name.slice(1),10);return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):'\ufffd';});
export function renderMarkdown(container,source,{annotations=[],sources=[],copyText}={}){
 source=String(source||'');const doc=container.ownerDocument;container.replaceChildren();container.classList.remove('markdown-fallback');
 if(source.length>200000){container.textContent=source;container.classList.add('markdown-fallback');return;}
 const prefix='\ue000AW'+crypto.randomUUID().replaceAll('-','')+'X',suffix='\ue001',citations=[],positions=new Map(),chars=[...source];
 for(const item of annotations){const c=item?.url_citation;if(item?.type!=='url_citation'||!c||!Number.isInteger(c.start_index)||!Number.isInteger(c.end_index)||c.start_index<0||c.start_index>=c.end_index||c.end_index>chars.length)continue;const index=sources.findIndex(s=>s.url===c.url);if(index<0||!safeURL(c.url))continue;const list=positions.get(c.end_index)||new Set();list.add(index);positions.set(c.end_index,list);}
 let input='',last=0;for(const end of [...positions.keys()].sort((a,b)=>a-b)){input+=chars.slice(last,end).join('');for(const index of positions.get(end)){const id=citations.push({number:index+1,...sources[index]})-1;input+=prefix+id+suffix;}last=end;}input+=chars.slice(last).join('');
 const marker=new RegExp(prefix+'(\\d+)'+suffix,'g');
 const element=(tag,cls)=>{const e=doc.createElement(tag);if(cls)e.className=cls;return e;};
 function addCitation(parent,id){const ref=citations[id];if(!ref)return;const url=safeURL(ref.url);if(!url)return;const sup=element('sup','citation'),a=element('a');a.textContent='['+ref.number+']';a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','来源 '+ref.number+'：'+ref.title);sup.append(a);parent.append(sup);}
 function strip(text){return String(text||'').replace(marker,'');}
 function literal(parent,text,{entities=true,cite=true}={}){text=String(text||'');let start=0;for(const match of text.matchAll(marker)){const part=text.slice(start,match.index);parent.append(doc.createTextNode(entities?decode(part):part));if(cite)addCitation(parent,Number(match[1]));start=match.index+match[0].length;}const tail=text.slice(start);parent.append(doc.createTextNode(entities?decode(tail):tail));}
 function references(parent,text){for(const match of String(text||'').matchAll(marker))addCitation(parent,Number(match[1]));}
 function children(parent,tokens,depth=0){if(depth>32){for(const t of tokens||[])literal(parent,t.raw||t.text||'');return;}
  for(const t of tokens||[]){let node;switch(t.type){
   case 'space':break;
   case 'paragraph':node=element('p');children(node,t.tokens,depth+1);parent.append(node);break;
   case 'heading':node=element('h'+Math.max(1,Math.min(6,t.depth)));children(node,t.tokens,depth+1);parent.append(node);break;
   case 'strong':case 'em':case 'del':node=element(t.type);children(node,t.tokens,depth+1);parent.append(node);break;
   case 'text':if(t.tokens)children(parent,t.tokens,depth+1);else literal(parent,t.text);break;
   case 'escape':literal(parent,t.text);break;
   case 'br':parent.append(element('br'));break;
   case 'hr':parent.append(element('hr'));break;
   case 'blockquote':node=element('blockquote');children(node,t.tokens,depth+1);parent.append(node);break;
   case 'list':node=element(t.ordered?'ol':'ul');if(t.ordered&&Number.isSafeInteger(t.start)&&t.start!==1)node.setAttribute('start',String(t.start));for(const item of t.items||[]){const li=element('li');if(item.task){const check=element('input');check.type='checkbox';check.disabled=true;check.checked=!!item.checked;check.setAttribute('aria-label',item.checked?'已完成':'未完成');li.append(check);}children(li,item.tokens,depth+1);node.append(li);}parent.append(node);break;
   case 'codespan':node=element('code');node.textContent=strip(t.text);parent.append(node);references(parent,t.text);break;
   case 'code':{const wrap=element('div','code-block'),bar=element('div','code-toolbar'),pre=element('pre'),code=element('code'),language=strip(t.lang).split(/\s/)[0];const label=element('span');label.textContent=language||'代码';bar.append(label);const button=element('button');button.type='button';button.textContent='复制代码';button.onclick=async()=>{try{await (copyText||((value)=>navigator.clipboard.writeText(value)))(strip(t.text));button.textContent='已复制';}catch{button.textContent='复制失败';}};bar.append(button);code.textContent=strip(t.text);pre.append(code);wrap.append(bar,pre);references(wrap,t.text);parent.append(wrap);break;}
   case 'link':case 'image':{const href=safeURL(decode(strip(t.href)));node=href?element('a'):element('span');if(href){node.href=href;node.target='_blank';node.rel='noopener noreferrer';}if(t.type==='image')literal(node,'图片：'+(t.text||'查看链接'));else if(t.tokens)children(node,t.tokens,depth+1);else literal(node,t.text);parent.append(node);references(parent,t.href);break;}
   case 'table':{const wrap=element('div','table-scroll'),table=element('table'),head=element('thead'),row=element('tr'),body=element('tbody');const cell=(item,tag,i)=>{const e=element(tag);if(['left','center','right'].includes(t.align?.[i]))e.className='align-'+t.align[i];children(e,item.tokens,depth+1);return e;};(t.header||[]).forEach((v,i)=>row.append(cell(v,'th',i)));head.append(row);for(const r of t.rows||[]){const tr=element('tr');r.forEach((v,i)=>tr.append(cell(v,'td',i)));body.append(tr);}table.append(head,body);wrap.append(table);parent.append(wrap);break;}
   case 'html':literal(parent,t.raw||t.text,{entities:false});break;
   default:literal(parent,t.raw||t.text||'');
  }}
 }
 try{children(container,lexer(input,{gfm:true,breaks:true}));}catch{container.replaceChildren();container.textContent=source;container.classList.add('markdown-fallback');}
}
