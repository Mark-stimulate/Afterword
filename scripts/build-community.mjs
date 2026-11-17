// Generate a standalone community edition; no signing secret is needed.
import {mkdir,cp,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
const root=new URL('../',import.meta.url),target=new URL('community/',root);
await rm(target,{recursive:true,force:true});await mkdir(new URL('scripts/',target),{recursive:true});
await cp(new URL('src/',root),new URL('src/',target),{recursive:true});
await copyFile(new URL('scripts/server.mjs',root),new URL('scripts/server.mjs',target));
await copyFile(new URL('LICENSE',root),new URL('LICENSE',target));
const config=await readFile(new URL('src/build-config.mjs',target),'utf8');
await writeFile(new URL('src/build-config.mjs',target),config.replace("EDITION='standard'","EDITION='community'"));
await writeFile(new URL('package.json',target),JSON.stringify({name:'afterword-community',private:true,type:'module',scripts:{start:'node scripts/server.mjs'}},null,2));
await writeFile(new URL('README.md',target),'# 拾语 · Afterword 社区版\n\n在此目录运行 `npm start`，访问 http://127.0.0.1:4173。完整文档见源码仓库。\n');
console.log('已生成 community 完整版。在该目录运行 npm start。请先停止占用 4173 端口的其他版本。');
