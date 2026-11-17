// Builds the unrestricted community edition without any signing secret.
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
const target=new URL('./community/',import.meta.url);await mkdir(target,{recursive:true});
for(const name of ['index.html','style.css','app.js','core.mjs','zip-import.mjs','appearance.mjs','license.mjs','server.mjs','LICENSE','README.md','SECURITY.md'])await copyFile(new URL(name,import.meta.url),new URL(name,target));
const config=await readFile(new URL('./build-config.mjs',import.meta.url),'utf8');
await writeFile(new URL('build-config.mjs',target),config.replace("EDITION='standard'","EDITION='community'"));
console.log('已生成 community 完整版。在该目录运行 node server.mjs；请先停止占用 4173 端口的其他版本。');
