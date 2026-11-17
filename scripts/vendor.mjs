// Bundle the pinned parser locally; browsers never load a third-party CDN.
import {mkdir,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await mkdir(new URL('src/vendor/',root),{recursive:true});
try{await copyFile(new URL('node_modules/marked/lib/marked.esm.js',root),new URL('src/vendor/marked.mjs',root));await copyFile(new URL('node_modules/marked/LICENSE.md',root),new URL('src/vendor/marked-LICENSE.txt',root));}catch{throw Error('缺少 Markdown 构建依赖，请先运行 npm install');}
