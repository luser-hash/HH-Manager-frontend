import {ApiError,request} from './api.ts';
export interface RecoveryBackup {id:string;created_at:string;kind:'complete'|'database';size_bytes:number;sha256:string;engine:string;counts:Record<string,number>;scope:string[]|string;encrypted:boolean}
export interface RestorePreview {id:string;state:'validated'|'incompatible'|'ready'|'restored';created_at:string;expires_at:string;archive_sha256:string;backup_created_at:string;engine:string;counts:Record<string,number>;problems:string[];reason:string;command?:string}
export interface RecoveryStatus {latest:RecoveryBackup|null;backups:RecoveryBackup[];last_restore:{id:string;restored_at:string;safety_backup:string;reason:string}|null;scope:string;max_upload_bytes:number;restore_mode:'offline'}
export const RESTORE_CONFIRMATION='RESTORE HH MANAGER';
export const loadRecovery=()=>request<RecoveryStatus>('/api/v1/recovery/');
export const createRecovery=()=>request<RecoveryBackup>('/api/v1/recovery/backups/','POST',undefined,660000);
async function responseError(response:Response) {const value=await response.json().catch(()=>null);const explain=(v:unknown):string=>typeof v==='string'?v:Array.isArray(v)?v.map(explain).join(' '):v&&typeof v==='object'?Object.values(v).map(explain).join(' '):'Recovery request failed.';return new ApiError(explain(value),response.status);}
export async function downloadRecovery(backup:RecoveryBackup) {
  if(backup.kind!=='complete')throw new Error('Create a complete recovery copy before downloading.');
  const response=await fetch(`/api/v1/recovery/backups/${encodeURIComponent(backup.id)}/download/`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw await responseError(response);
  const blob=await response.blob();if(!response.headers.get('content-type')?.includes('application/zip')||(await blob.slice(0,2).text())!=='PK')throw new Error('The server did not return a recovery ZIP.');
  return {blob,filename:`hill-horizon-recovery-${backup.id.replace(/[^\w-]/g,'_')}.zip`};
}
export async function validateRecovery(file:File,maxBytes=256*1024*1024) {
  if(!file.size||file.size>maxBytes||!file.name.toLowerCase().endsWith('.zip'))throw new Error('Choose a complete recovery ZIP no larger than 256 MB.');
  const {csrfToken}=await request<{csrfToken:string}>('/api/v1/auth/csrf/');
  const form=new FormData();form.append('archive',file);
  const response=await fetch('/api/v1/recovery/restore/validate/',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'X-CSRFToken':csrfToken},body:form,signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw await responseError(response);
  return response.json() as Promise<RestorePreview>;
}
export function prepareRecovery(preview:RestorePreview,password:string,reason:string,confirmation:string) {
  if(preview.problems.length||!['validated','ready'].includes(preview.state))throw new Error('Validate a compatible recovery archive before preparing a restore.');
  if(!password||!reason.trim()||confirmation!==RESTORE_CONFIRMATION)throw new Error('Enter your owner password, restore reason and exact confirmation phrase.');
  return request<RestorePreview>(`/api/v1/recovery/restore/${encodeURIComponent(preview.id)}/prepare/`,'POST',{password,reason:reason.trim(),confirmation,archive_sha256:preview.archive_sha256});
}
