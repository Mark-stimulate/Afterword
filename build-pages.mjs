// Produce a static-only directory for Cloudflare Pages / 1Panel.
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
const root=new URL('./',import.meta.url),out=new URL('./dist/',root);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const community=process.argv.includes('--community');
for(const name of ['index.html','style.css','app.js','core.mjs','zip-import.mjs','appearance.mjs','license.mjs','build-config.mjs','LICENSE']){
 let text=await readFile(new URL(name,root),'utf8');
 if(/\.(mjs|js)$/.test(name))text=text.replace(/\.mjs(['"])/g,'.js$1');
 if(name==='build-config.mjs'&&community)text=text.replace("EDITION='standard'","EDITION='community'");
 await writeFile(new URL(name.replace(/\.mjs$/,'.js'),out),text);
}
await writeFile(new URL('_headers',out),`/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.deepseek.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Cache-Control: no-cache
  X-Robots-Tag: noindex, nofollow
`);
await writeFile(new URL('robots.txt',out),'User-agent: *\nDisallow: /\n');
console.log(`Generated dist (${community?'community':'standard'}).`);
