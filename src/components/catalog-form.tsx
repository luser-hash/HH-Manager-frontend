'use client';
import { useState, type FormEvent } from 'react';
import { request } from '@/lib/api';
import { useWorkspace } from './workspace';
import { Button, Overlay } from './ui';
export function CatalogForm({onClose}:{onClose:()=>void}) {
  const {resorts,refresh,notify}=useWorkspace();
  const [resortId,setResortId]=useState(resorts[0]?.id || ''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget);setBusy(true);setError('');
    try {
      let id=resortId;
      if(!id) { const resort=await request<{id:string}>('/api/v1/resorts/','POST',{name:String(form.get('resortName')).trim(),location:String(form.get('location') || '')});id=resort.id;setResortId(id); }
      await request('/api/v1/rooms/','POST',{resort:id,name:String(form.get('roomName')).trim(),max_occupancy:Number(form.get('occupancy'))});
      await refresh();notify('Resort and room are ready for bookings.');onClose();
    } catch(e) {setError(e instanceof Error ? e.message : 'Could not save.');try {await refresh();}catch{}}
    finally{setBusy(false);}
  }
  return <Overlay title="Set up a resort and room" onClose={onClose}><form onSubmit={submit}><div className="form-body"><div className="form-grid"><label className="field full">Resort<select value={resortId} onChange={e=>setResortId(e.target.value)}><option value="">Add a new resort</option>{resorts.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{!resortId && <><label className="field">Resort name<input name="resortName" required maxLength={150}/></label><label className="field">Location<input name="location" maxLength={150}/></label></>}<label className="field">Room category name<input name="roomName" required maxLength={150}/></label><label className="field">Maximum guests per room<input name="occupancy" type="number" min="1" max="100" defaultValue="2" required/></label></div>{error && <p className="error" role="alert">{error}</p>}</div><div className="form-foot"><Button secondary disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy?'Saving…':'Save resort and room'}</Button></div></form></Overlay>;
}
