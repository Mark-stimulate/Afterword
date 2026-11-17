import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {PUBLIC_KEY} from '../src/build-config.mjs';
async function checkImports(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){const file=new URL(entry.name+(entry.isDirectory()?'/':''),directory);if(entry.isDirectory()){await checkImports(file);continue;}if(!entry.name.endsWith('.js'))continue;const source=await readFile(file,'utf8');for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))await access(new URL(match[1],file));}
}
const root=new URL('../',import.meta.url),build=new URL('scripts/build-pages.mjs',root);
test('build outputs share app code while official build excludes community trust and credential',async()=>{
 const run=(args=[],key)=>{const env={...process.env};delete env.AFTERWORD_LICENSE_PUBLIC_KEY;if(key)env.AFTERWORD_LICENSE_PUBLIC_KEY=JSON.stringify(key);return spawnSync(process.execPath,[build.pathname,...args],{cwd:root,env,encoding:'utf8'});};
 assert.notEqual(run().status,0);assert.notEqual(run([],PUBLIC_KEY).status,0);
 assert.equal(run(['--community']).status,0);const files=await readdir(new URL('dist/',root)),code=new Map();
 for(const file of files.filter(f=>f.endsWith('.js')&&f!=='build-config.js'))code.set(file,await readFile(new URL('dist/'+file,root),'utf8'));
 await access(new URL('dist/community.license',root));await access(new URL('dist/vendor/marked.js',root));await checkImports(new URL('dist/',root));
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
 try{const result=run([],publicKey);assert.equal(result.status,0,result.stderr);const config=await readFile(new URL('dist/build-config.js',root),'utf8');assert.ok(config.includes('official'));assert.ok(!config.includes(PUBLIC_KEY.x));await assert.rejects(access(new URL('dist/community.license',root)));for(const [file,text]of code)assert.equal(await readFile(new URL('dist/'+file,root),'utf8'),text);}
 finally{assert.equal(run(['--community']).status,0);}
});
