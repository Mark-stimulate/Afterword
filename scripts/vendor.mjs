// Bundle the pinned parser locally; browsers never load a third-party CDN.
import {mkdir,copyFile,readFile,access} from 'node:fs/promises';
const root=new URL('../',import.meta.url),base=new URL('node_modules/marked/',root);
await mkdir(new URL('src/vendor/',root),{recursive:true});
async function available(names){for(const name of names){const url=new URL(name,base);try{await access(url);return url;}catch{}}throw Error('Marked 包缺少文件：'+names.join(' / '));}
try{const pkg=JSON.parse(await readFile(new URL('package.json',base),'utf8'));const moduleFile=await available([pkg.module||'lib/marked.esm.js','lib/marked.esm.js','lib/marked.esm.mjs']);await copyFile(moduleFile,new URL('src/vendor/marked.mjs',root));const license=await available(['LICENSE.md','LICENSE','LICENSE.txt']);await copyFile(license,new URL('src/vendor/marked-LICENSE.txt',root));}catch(error){throw Error('无法准备 Markdown 构建依赖，请先运行 npm install。'+error.message);}
