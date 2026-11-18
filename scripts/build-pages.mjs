import './vendor.mjs';
// Produce a static-only directory for Cloudflare Pages / 1Panel.
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {buildLicenseConfig,configSource} from './license-config.mjs';
const community=process.argv.includes('--community');
const config=await buildLicenseConfig({community,publicKeyText:process.env.AFTERWORD_LICENSE_PUBLIC_KEY,verifyUrl:process.env.AFTERWORD_LICENSE_VERIFY_URL});
const licenseOrigin=config.verifyUrl?' '+new URL(config.verifyUrl).origin:'';
const root=new URL('../',import.meta.url),out=new URL('./dist/',root);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const name of ['index.html','style.css','app.js','core.mjs','media.mjs','media-ui.mjs','speech.mjs','key-vault.mjs','key-storage.mjs','markdown.mjs','documents.mjs','document-ui.mjs','browser-media.mjs','recorder-worklet.js','zip-import.mjs','appearance.mjs','license.mjs','build-config.mjs','LICENSE']){
 let text=await readFile(new URL(name==='LICENSE'?name:'src/'+name,root),'utf8');
 if(/\.(mjs|js)$/.test(name))text=text.replace(/\.mjs(['"])/g,'.js$1');
 if(name==='build-config.mjs')text=configSource(config);
 await writeFile(new URL(name.replace(/\.mjs$/,'.js'),out),text);
}
await mkdir(new URL('vendor/',out),{recursive:true});
await writeFile(new URL('vendor/marked.js',out),await readFile(new URL('src/vendor/marked.mjs',root)));
await writeFile(new URL('vendor/marked-LICENSE.txt',out),await readFile(new URL('src/vendor/marked-LICENSE.txt',root)));
if(community)await writeFile(new URL('community.license',out),await readFile(new URL('examples/社区免费授权.license',root)));
await writeFile(new URL('_headers',out),`/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.deepseek.com${licenseOrigin}; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Cache-Control: no-cache
  X-Robots-Tag: noindex, nofollow
`);
await writeFile(new URL('robots.txt',out),'User-agent: *\nDisallow: /\n');
console.log(`Generated dist (${community?'community license':'official license'}).`);
