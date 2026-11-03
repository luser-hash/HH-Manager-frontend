'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Booking, PaymentIntent } from '@/lib/types';
import { cents, request, today, type Segment } from '@/lib/api';
import { formatMoney, moneyInput, parseMoney, shortDate, summary } from '@/lib/booking';
import { Button, Tag } from './ui';
import { useWorkspace } from './workspace';

interface Readiness {errors:string[];warnings:string[];conflicts?:string[];ready_for_confirmation:boolean;requires_override:boolean;advance_outstanding_bdt:string;supplier_verified:boolean;advance_received:boolean;advance_received_bdt:string}
const localTime = (value?:string|null) => value ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replace(' ','T') : '';
const states:Record<string,string> = {requested:'Waiting for reply',not_checked:'Not checked',available:'Available when checked',held:'Held',expired:'Hold expired',confirmed:'Supplier availability verified',unavailable:'Unavailable',cancelled:'Cancelled'};

export function BookingWorkflow({booking,onEdit,onPay,onCancel,onDocuments}:{booking:Booking;onEdit:()=>void;onPay:(intent?:PaymentIntent)=>void;onCancel:()=>void;onDocuments?:()=>void}) {
  const {user,mutate,saving,notify}=useWorkspace();
  const [readiness,setReadiness]=useState<Readiness|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const lock=useRef(false),finished=['Completed','Cancelled'].includes(booking.status)||!!booking.record?.closed_at;
  const pending=['Inquiry','Pending confirmation'].includes(booking.status),stays=booking.record?.segments.filter(s=>!s.is_cancelled)||[],totals=summary(booking);
  const can=(p:string)=>!!user?.permissions.includes(p)&&(!['bookings.amend_booking','bookings.cancel_booking','finance.post_transaction','bookings.override_booking_rules'].includes(p)||!!user?.is_superuser);
  useEffect(()=>{let active=true;setReadiness(null);void request<Readiness>(`/api/v1/bookings/${booking.apiId}/readiness/`).then(r=>{if(active)setReadiness(r);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not check this booking.');});return()=>{active=false;};},[booking.apiId,booking.version,retry]);
  async function transition(action:string){if(lock.current)return;lock.current=true;setError('');try{await mutate(()=>request(`/api/v1/bookings/${booking.apiId}/${action}/`,'POST',{version:booking.version}));notify(action==='confirm'?'Booking confirmed. You can now issue the guest documents.':'Booking updated.');}catch(e){setError(e instanceof Error?e.message:'Could not update the booking.');}finally{lock.current=false;}}
  function readable(message:string){for(const [i,s] of (booking.record?.segments||[]).entries())message=message.replaceAll(s.id,`Stay ${i+1} (${s.resort_name_snapshot})`);return message;}
  const step=!readiness?.supplier_verified?0:!readiness.advance_received?1:2;
  const blocked=!readiness||readiness.errors.length>0||!!readiness.conflicts?.length||(readiness.requires_override&&!can('bookings.override_booking_rules'));
  return <>
    <section className="section-card booking-overview"><p>{booking.phone} · {booking.record?.guest_count||booking.guests} guests</p><div className="booking-figures"><div><small>Guest total</small><strong>{formatMoney(totals.guestTotal)}</strong></div><div><small>Advance received</small><strong>{formatMoney(totals.advance)}</strong></div><div><small>Guest balance</small><strong>{formatMoney(totals.guestBalance)}</strong></div></div>{booking.notes&&<p className="customer-note">{booking.notes}</p>}</section>
    {pending&&<section className="section-card booking-next">
      <ol className="booking-progress" aria-label="Booking progress">{['Availability','Advance','Confirm'].map((label,i)=><li key={label} aria-current={i===step?'step':undefined} className={i<step?'done':i===step?'current':''}><span>{i<step?'✓':i+1}</span>{label}</li>)}</ol>
      {!readiness?<><p role="status">Checking the next step…</p>{error&&<Button secondary onClick={()=>{setError('');setRetry(n=>n+1);}}>Try again</Button>}</>:step===0?<>
        <h3>Check room availability</h3><p>Contact the supplier, then save their reply below.</p>
        {!stays.length&&<p>Add a room and stay dates to continue.</p>}
        {stays.map(s=>s.availability?.state==='confirmed'?<p key={s.id}>✓ {s.resort_name_snapshot} — availability verified</p>:<div key={s.id} className="supplier-step"><strong>{s.resort_name_snapshot}</strong><p>{shortDate(s.check_in)} – {shortDate(s.check_out)} · {s.items.map(i=>`${i.quantity} × ${i.description_snapshot}`).join(', ')}</p><AvailabilityForm key={s.id+':'+booking.version} booking={booking} stay={s} simple disabled={saving||!can('bookings.change_booking')}/></div>)}
      </>:step===1?<>
        <h3>Record the customer advance</h3><p>Room availability is verified. {cents(readiness.advance_outstanding_bdt)>0?<>Collect <strong>{formatMoney(cents(readiness.advance_outstanding_bdt))}</strong> from the customer, then record the payment.</>:'Enter the actual advance received from the customer.'}</p>
        {can('finance.post_transaction')?<AdvanceForm key={booking.apiId+':'+booking.version} booking={booking} outstanding={cents(readiness.advance_outstanding_bdt)}/>:<p className="hint">Ask the owner to record the advance. This booking will update when the payment is saved.</p>}
      </>:<>
        <h3>Ready to confirm</h3><p>Supplier availability is verified and the advance is recorded.</p><Button disabled={saving||blocked||!can('bookings.confirm_booking')} onClick={()=>void transition('confirm')}>{saving?'Confirming…':'Confirm booking'}</Button>
        {!can('bookings.confirm_booking')&&<p>Ask an authorized booking officer or the owner to confirm.</p>}
      </>}
      {readiness&&(readiness.conflicts?.length||readiness.warnings.length||step===2&&readiness.errors.length>0)?<div className="hint"><strong>Needs attention</strong><ul>{[...(readiness.conflicts||[]),...readiness.warnings,...(step===2?readiness.errors:[])].map((e,i)=><li key={i}>{readable(e)}</li>)}</ul>{readiness.requires_override&&<p>Review the guest capacity in More options → Edit booking.</p>}</div>:null}
    </section>}
    {booking.status==='Confirmed'&&<section className="section-card booking-next"><h3>Booking confirmed</h3><p>The room is verified and the customer advance is recorded.</p>{onDocuments&&<Button onClick={onDocuments}>Guest documents</Button>}</section>}
    <section className="section-card"><h3>Your stay{stays.length===1?'':'s'}</h3>{booking.record?.segments.map(s=><div className="booking-stay" key={s.id}><strong>{s.resort_name_snapshot}</strong><p>{shortDate(s.check_in,true)} – {shortDate(s.check_out,true)}</p><p>{s.items.map(i=>`${i.quantity} × ${i.description_snapshot}`).join(', ')} · {s.guest_count} guests</p><Tag>{s.is_cancelled?'Cancelled':states[s.availability?.state||'not_checked']||'Not checked'}</Tag>{!s.is_cancelled&&!finished&&<details className="booking-more"><summary>Supplier reply & changes</summary><AvailabilityForm key={s.id+':details:'+booking.version} booking={booking} stay={s} disabled={saving||!can('bookings.change_booking')}/></details>}{s.policy_snapshot&&<details className="booking-more"><summary>Stay policy</summary><p className="customer-note">{s.policy_snapshot}</p></details>}</div>)}</section>
    <details className="section-card booking-more"><summary>More options</summary><div className="actions">{!finished&&can('bookings.amend_booking')&&<Button secondary onClick={onEdit}>Edit booking</Button>}{can('finance.post_transaction')&&<Button secondary disabled={!!booking.record?.closed_at} onClick={()=>onPay()}>Other payments</Button>}{!finished&&can('bookings.cancel_booking')&&<Button secondary onClick={onCancel}>Cancel booking</Button>}{booking.status==='Confirmed'&&<p className="editor-help">This booking completes automatically on its final checkout date.</p>}<Button secondary disabled={saving} onClick={()=>setRetry(n=>n+1)}>Refresh booking checks</Button></div></details>
    {error&&<p className="error" role="alert">{error}</p>}
  </>;
}

function AvailabilityForm({booking,stay,disabled,simple=false}:{booking:Booking;stay:Segment;disabled:boolean;simple?:boolean}) {
  const {mutate,saving,notify} = useWorkspace();
  const current = stay.availability?.state || 'requested';
  const [response,setResponse] = useState(simple?'confirmed':['available','held','confirmed','unavailable'].includes(current)?current:'requested');
  const [error,setError] = useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError('');const form=new FormData(event.currentTarget);
    const time=String(form.get('responded_at') || ''),hold=String(form.get('hold_expires_at') || '');
    try {await mutate(()=>request(`/api/v1/bookings/${booking.apiId}/availability/`,'POST',{version:booking.version,segment:stay.id,response,responded_by:String(form.get('responded_by') || ''),responded_at:time?time+':00+06:00':simple?new Date().toISOString():null,hold_expires_at:hold?hold+':00+06:00':null,reference:String(form.get('reference') || ''),channel:'phone',notes:String(form.get('notes') || '')}));notify('Supplier verification saved for this stay.');}
    catch(e){setError(e instanceof Error?e.message:'Could not save supplier verification.');}
  }
  return <form className="availability-form" onSubmit={submit}><fieldset className="directory-fields" disabled={disabled || saving}><div className="form-grid">{!simple&&<label className="field">Supplier response<select value={response} onChange={e=>setResponse(e.target.value)}><option value="requested">Waiting for reply</option><option value="available">Available when checked</option><option value="held">Held</option><option value="confirmed">Room availability verified by supplier</option><option value="unavailable">Unavailable</option></select></label>}<label className="field">Who replied?<input name="responded_by" required={response!=='requested'} maxLength={150} defaultValue={stay.availability?.responded_by || ''}/></label>{!simple&&<label className="field">Reply time · Dhaka<input name="responded_at" type="datetime-local" required={response!=='requested'} defaultValue={localTime(stay.availability?.responded_at)}/></label>}<label className="field">Reference or confirmation note<input name="reference" maxLength={200} required={response==='confirmed'} defaultValue={stay.availability?.reference || ''}/></label>{response==='held' && <label className="field full">Hold expires · Dhaka<input name="hold_expires_at" type="datetime-local" required defaultValue={localTime(stay.availability?.hold_expires_at)}/></label>}{!simple&&<label className="field full">Verification note<input name="notes" maxLength={1000}/></label>}</div><div className="actions"><Button secondary type="submit" disabled={disabled || saving}>{saving?'Saving…':simple?'Supplier says the room is available':'Save supplier reply'}</Button></div></fieldset>{error && <p className="error" role="alert">{error}</p>}</form>;
}

function AdvanceForm({booking,outstanding}:{booking:Booking;outstanding:number}) {
  const {mutate,saving,notify}=useWorkspace(),stays=booking.record?.segments.filter(s=>!s.is_cancelled)||[];
  const [segment,setSegment]=useState(stays[0]?.id||''),[amount,setAmount]=useState(outstanding>0?moneyInput(Math.min(outstanding,cents(stays[0]?.financial_summary?.guest_balance_at_resort))):''),[error,setError]=useState('');
  const [key]=useState(()=>crypto.randomUUID());const lock=useRef(false);
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(lock.current)return;setError('');const form=new FormData(event.currentTarget);
    try{if(parseMoney(amount)<=0)throw new Error('Enter the actual advance received.');lock.current=true;await mutate(()=>request('/api/v1/transactions/','POST',{segment,kind:'guest_receipt',amount:moneyInput(parseMoney(amount)),method:String(form.get('method')),payment_date:String(form.get('payment_date')||today()),reference:String(form.get('reference')||''),note:'',idempotency_key:key}));notify('Advance recorded. Next: confirm the booking.');}catch(e){setError(e instanceof Error?e.message:'Could not record the advance.');}finally{lock.current=false;}}
  return <form onSubmit={save}><fieldset className="directory-fields" disabled={saving}><div className="form-grid">
    {stays.length>1&&<label className="field full">Payment for<select required value={segment} onChange={e=>{setSegment(e.target.value);setAmount('');}}>{stays.map((s,i)=><option key={s.id} value={s.id}>Stay {i+1} · {s.resort_name_snapshot}</option>)}</select></label>}
    <label className="field">Advance received · BDT<input type="number" required min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Actual amount received"/></label>
    <label className="field">Payment method<select name="method"><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="bank">Bank transfer</option><option value="cash">Cash</option></select></label>
    <label className="field full">Transaction reference (optional)<input name="reference" maxLength={100}/></label>
  </div><details className="booking-more"><summary>Payment date</summary><label className="field">Date received<input name="payment_date" type="date" required max={today()} defaultValue={today()}/></label></details><div className="actions"><Button type="submit" disabled={saving}>{saving?'Saving…':'Save advance'}</Button></div></fieldset>{error&&<p className="error" role="alert">{error}</p>}</form>;
}
