import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/media-ui.mjs':'media-ui.mjs','/media.mjs':'media.mjs','/browser-media.mjs':'browser-media.mjs','/recorder-worklet.js':'recorder-worklet.js','/zip-import.mjs':'zip-import.mjs','/license.mjs':'license.mjs','/appearance.mjs':'appearance.mjs','/build-config.mjs':'build-config.mjs','/':'index.html','/index.html':'index.html','/app.js':'app.js','/core.mjs':'core.mjs','/style.css':'style.css'};
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'||!files[path]){res.writeHead(404);res.end('Not found');return;}
 try{const data=await readFile(new URL('../src/'+files[path],import.meta.url));res.writeHead(200,{'Content-Type':path.endsWith('.css')?'text/css; charset=utf-8':/\.(js|mjs)$/.test(path)?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.deepseek.com; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});res.end(data);}catch{res.writeHead(500);res.end('Unable to load application');}
}).listen(4173,'127.0.0.1',()=>console.log('拾语 · Afterword 已启动：http://127.0.0.1:4173 （仅本机）'));
