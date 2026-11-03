import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadRecovery,prepareRecovery,validateRecovery,RESTORE_CONFIRMATION,type RecoveryBackup,type RestorePreview} from '../src/lib/recovery.ts';
const backup:RecoveryBackup={id:'20261026T080000Z-12345678',created_at:'2026-10-26',kind:'complete',size_bytes:100,sha256:'a'.repeat(64),engine:'django.db.backends.sqlite3',counts:{customers:1},scope:['database'],encrypted:false};
const preview:RestorePreview={id:'request-id',state:'validated',created_at:'2026-10-26',expires_at:'2026-10-27',archive_sha256:'a'.repeat(64),backup_created_at:'2026-10-26',engine:backup.engine,counts:{customers:1},problems:[],reason:''};
test('ZIP download checks type and signature and rejects database-only copies',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>new Response('PK sample',{headers:{'Content-Type':'application/zip'}});
 assert.equal((await downloadRecovery(backup)).filename,'hill-horizon-recovery-20261026T080000Z-12345678.zip');
 await assert.rejects(()=>downloadRecovery({...backup,kind:'database'}),/complete recovery/);
 globalThis.fetch=async()=>new Response('<html>',{headers:{'Content-Type':'application/zip'}});
 await assert.rejects(()=>downloadRecovery(backup),/did not return/);
 globalThis.fetch=async()=>Response.json({detail:'Owner access required'},{status:403});
 await assert.rejects(()=>downloadRecovery(backup),/Owner access/);
});
test('invalid uploads fail before any network request',async()=>{
 await assert.rejects(()=>validateRecovery(new File(['x'],'bad.txt')),/Choose/);
 await assert.rejects(()=>validateRecovery(new File([],'empty.zip')),/Choose/);
 await assert.rejects(()=>validateRecovery(new File(['123'],'big.zip'),2),/Choose/);
});
test('archive validation uploads multipart with CSRF and returns a preview',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let checked=false;
 globalThis.fetch=async(input,init)=>{if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'csrf-test'});assert.equal(String(input),'/api/v1/recovery/restore/validate/');assert.equal((init?.headers as Record<string,string>)['X-CSRFToken'],'csrf-test');assert.ok(init?.body instanceof FormData);assert.equal((init.body.get('archive') as File).name,'copy.zip');checked=true;return Response.json(preview);};
 assert.deepEqual(await validateRecovery(new File(['PK'],'copy.zip')),preview);assert.equal(checked,true);
});
test('prepare requires a compatible preview and explicit restore requirements',()=>{
 assert.throws(()=>prepareRecovery({...preview,state:'incompatible',problems:['Code differs']},'secret','Reason',RESTORE_CONFIRMATION),/compatible/);
 for(const [password,reason,phrase] of [['','Reason',RESTORE_CONFIRMATION],['secret',' ',RESTORE_CONFIRMATION],['secret','Reason','restore']])assert.throws(()=>prepareRecovery(preview,password,reason,phrase),/owner password/);
});
test('preparation sends the reviewed checksum and reason only to the prepare endpoint',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const calls:string[]=[];
 globalThis.fetch=async(input,init)=>{if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'test'});calls.push(String(input));assert.deepEqual(JSON.parse(String(init?.body)),{password:'owner-secret',reason:'Recovery drill',confirmation:RESTORE_CONFIRMATION,archive_sha256:preview.archive_sha256});return Response.json({...preview,state:'ready'});};
 assert.equal((await prepareRecovery(preview,'owner-secret',' Recovery drill ',RESTORE_CONFIRMATION)).state,'ready');assert.deepEqual(calls,['/api/v1/recovery/restore/request-id/prepare/']);
});
