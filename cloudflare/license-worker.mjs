import {verifyLicense} from '../src/license.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_BODY = 20_000;
const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
const base64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64Url = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const json = (body, status = 200, headers = {}) => Response.json(body, {status, headers: {...securityHeaders, ...headers}});
const error = (status, code, headers) => json({error: code}, status, headers);

async function readJSON(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '') || !request.body) throw new Error('body');
  const reader = request.body.getReader();
  const bytes = new Uint8Array(MAX_BODY);
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    if (size + value.length > MAX_BODY) {
      await reader.cancel();
      throw new Error('body');
    }
    bytes.set(value, size);
    size += value.length;
  }
  return JSON.parse(decoder.decode(bytes.subarray(0, size)));
}

async function authorizeAdmin(request, env) {
  try {
    const jwt = request.headers.get('Cf-Access-Jwt-Assertion') ?? '';
    if (jwt.length > 8000) return false;
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    const [header, claims] = parts.slice(0, 2).map(part => JSON.parse(decoder.decode(fromBase64Url(part))));
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claims.iss !== env.ACCESS_ISSUER ||
        !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD) ||
        !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now)) ||
        claims.email?.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return false;
    const response = await fetch(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`, {redirect: 'error', signal: AbortSignal.timeout(4000)});
    if (!response.ok) return false;
    const {keys} = await response.json();
    const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), encoder.encode(parts.slice(0, 2).join('.')));
  } catch {
    return false;
  }
}

async function issue(env) {
  const id = crypto.randomUUID();
  const notBefore = new Date().toISOString();
  const payload = JSON.stringify({product: 'xuye', tier: 'pro', major: 0, kind: 'paid', id, notBefore, expires: null});
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.SIGNING_KEY), {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const signature = base64(await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, encoder.encode(payload)));
  const license = {format: 'xuye-license-v1', payload, signature};
  await verifyLicense(license, JSON.parse(env.PUBLIC_KEY), {channel: 'official'});
  await env.LICENSE_DB.prepare('INSERT INTO licenses (id, issued_at) VALUES (?, ?)').bind(id, notBefore).run();
  return json({id, license}, 201);
}

async function check(request, env, headers) {
  let license;
  try {
    license = await verifyLicense(await readJSON(request), JSON.parse(env.PUBLIC_KEY), {channel: 'official'});
    if (license.expires !== null) return error(403, 'invalid_license', headers);
  } catch {
    return error(403, 'invalid_license', headers);
  }
  const row = await env.LICENSE_DB.prepare('SELECT revoked_at FROM licenses WHERE id = ?').bind(license.id).first();
  if (!row || row.revoked_at) return error(403, 'inactive_license', headers);
  return json({active: true, id: license.id, notBefore: license.notBefore, expires: null}, 200, headers);
}

const adminPage = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾语 · 授权管理</title><style>
:root{color-scheme:light;font:16px system-ui,sans-serif;color:#2b2328;background:#faf5f2}main{max-width:44rem;margin:8vh auto;padding:1.5rem}h1{font:2rem Georgia,serif}button{padding:.75rem 1rem;border:1px solid #b87965;border-radius:.65rem;background:#a75d46;color:#fff;font:inherit;cursor:pointer}button:disabled{opacity:.55}ul{padding-left:1.2rem}li{margin:1rem 0;overflow-wrap:anywhere}li button{margin:.4rem .4rem 0 0;background:white;color:#773f31}#notice{min-height:1.5em}a{color:#773f31}</style><main><h1>拾语 · 授权管理</h1><p>签发永久商用授权，并下载授权文件。</p><button id="issue">签发并下载授权</button><p id="notice" role="status"></p><section><h2>近期授权</h2><ul id="licenses"></ul></section></main><script src="/admin/ui.js" defer></script></html>`;

const adminScript = `const notice=document.querySelector('#notice');
const issue=document.querySelector('#issue');
const list=document.querySelector('#licenses');
async function api(path, body) {
  const response=await fetch('/admin/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok) throw new Error('操作未成功，请检查登录状态后重试。');
  return response.json();
}
function download(data) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data.license,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='Afterword-'+data.id+'.license';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function refresh() {
  const {licenses}=await api('licenses');
  list.replaceChildren(...licenses.map(row=>{
    const item=document.createElement('li');
    item.textContent=row.id+' · '+new Date(row.issued_at).toLocaleString('zh-CN')+' · '+(row.revoked_at?'已撤销':'可用');
    if(!row.revoked_at){
      const revoke=document.createElement('button');revoke.textContent='撤销授权';
      revoke.onclick=async()=>{if(!confirm('撤销后，这份授权将无法通过在线校验。确认撤销？'))return;
        revoke.disabled=true;try{await api('revoke',{id:row.id});await refresh();notice.textContent='授权已撤销。';}catch(e){notice.textContent=e.message;revoke.disabled=false;}};
      item.append(document.createElement('br'),revoke);
    }
    return item;
  }));
  if(!licenses.length)list.textContent='尚无授权。';
}
issue.onclick=async()=>{issue.disabled=true;try{
  const data=await api('issue',{});download(data);notice.textContent='已签发。请妥善保管下载的授权文件。';
  const retry=document.createElement('button');retry.textContent='再次下载本次授权';retry.onclick=()=>download(data);notice.append(' ',retry);
  await refresh();
}catch(e){notice.textContent=e.message;}finally{issue.disabled=false;}};
refresh().catch(e=>{notice.textContent=e.message;});`;

async function admin(request, env, url) {
  if (!await authorizeAdmin(request, env)) return error(401, 'admin_required');
  if (request.method === 'GET') {
    if (url.pathname === '/admin' || url.pathname === '/admin/') return new Response(adminPage, {headers: {...securityHeaders, 'Content-Type': 'text/html; charset=utf-8'}});
    if (url.pathname === '/admin/ui.js') return new Response(adminScript, {headers: {...securityHeaders, 'Content-Type': 'text/javascript; charset=utf-8'}});
    if (url.pathname === '/admin/licenses') {
      const rows = await env.LICENSE_DB.prepare('SELECT id, issued_at, revoked_at FROM licenses ORDER BY issued_at DESC LIMIT 100').all();
      return json({licenses: rows.results});
    }
  }
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return error(403, 'origin');
    let body;
    try { body = await readJSON(request); } catch { return error(400, 'input'); }
    if (url.pathname === '/admin/issue') return issue(env);
    if (url.pathname === '/admin/revoke') {
      if (typeof body?.id !== 'string' || !/^[\da-f-]{36}$/i.test(body.id)) return error(400, 'input');
      const result = await env.LICENSE_DB.prepare('UPDATE licenses SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?').bind(new Date().toISOString(), body.id).run();
      return result.meta.changes ? json({revoked: true}) : error(404, 'unknown_license');
    }
  }
  return error(404, 'not_found');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== env.LICENSE_HOST) return error(404, 'not_found');
    const cors = url.pathname === '/verify' && request.headers.get('Origin') === env.APP_ORIGIN
      ? {'Access-Control-Allow-Origin': env.APP_ORIGIN, 'Vary': 'Origin'} : {};
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        await env.LICENSE_DB.prepare('SELECT id FROM licenses LIMIT 1').first();
        return json({ready: true});
      }
      if (url.pathname === '/verify') {
        if (request.method === 'OPTIONS' && cors.Vary) return new Response(null, {status: 204, headers: {...securityHeaders, ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}});
        if (request.method === 'POST') return await check(request, env, cors);
      }
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await admin(request, env, url);
      return error(404, 'not_found', cors);
    } catch {
      console.error(JSON.stringify({event: 'license_request_failed', endpoint: url.pathname.startsWith('/admin') ? 'admin' : url.pathname === '/verify' ? 'verify' : 'health'}));
      return error(503, 'service_unavailable', cors);
    }
  },
};
