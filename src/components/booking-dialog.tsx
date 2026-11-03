'use client';
import { useState, type FormEvent } from 'react';
import type { Booking, PaymentIntent, Transaction, TransactionType } from '@/lib/types';
import { TRANSACTION_TYPES } from '@/lib/types';
import { today, request } from '@/lib/api';
import { formatMoney, moneyInput, parseMoney, paymentLimit, shortDate, summary, validateTransaction } from '@/lib/booking';
import { Button, Overlay, Tag } from './ui';
import { useWorkspace } from './workspace';
import { BookingDocuments } from './booking-documents';
import { BookingWorkflow } from './booking-workflow';
import { ProfileDetails } from './catalog-profile';
import { SavedPricing } from './booking-editor';
import { BookingPayments } from './booking-settlement';
import {BookingEditor} from './booking-editor';
import {OfficerBookingForm,OfficerBookingDrawer} from './officer-booking';
import {SimpleBookingForm} from './simple-booking';
import {expandSimpleBooking} from '@/lib/booking-editor';
import type {OfficerDraft} from '@/lib/officer-booking';
export function BookingForm(props:{booking?:Booking;onClose:()=>void;onSaved:(id:string)=>void}) {
  const {user,resorts}=useWorkspace();const [advanced,setAdvanced]=useState<OfficerDraft|null>(null);
  if(!props.booking&&!advanced)return <SimpleBookingForm {...props} onAdvanced={setAdvanced}/>;
  return user?.is_superuser?<BookingEditor {...props} initialDraft={advanced?expandSimpleBooking(advanced,resorts,today()):undefined}/>:<OfficerBookingForm {...props} initialDraft={advanced||undefined}/>;
}
export type BookingTab = 'Details' | 'Pricing' | 'Payments' | 'Documents' | 'History';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The change could not be saved.';
function PriceLine({ label, value, total = false }: { label: string; value: number; total?: boolean }) {
  return <div className={'price-line ' + (total ? 'total' : '')}><span>{label}</span><strong>{formatMoney(value)}</strong></div>;
}

export function PaymentForm({ booking, intent, onClose, onSaved }: { booking: Booking; intent?:PaymentIntent; onClose: () => void; onSaved: (id: string) => void }) {
  const { saveBooking, notify } = useWorkspace();
  const [segmentId,setSegmentId] = useState(intent?.segmentId || booking.record?.segments.find(s=>!s.is_cancelled)?.id || booking.segmentId || "");
  const segment = booking.record?.segments.find(s=>s.id===segmentId);
  const scoped = {...booking,serverSummary:segment?.financial_summary || booking.serverSummary,transactions:booking.transactions.filter(t=>!t.segmentId || t.segmentId===segmentId)};
  const [paymentKey] = useState(()=>crypto.randomUUID());
  const TODAY = today();
  const s = summary(scoped);
  const [type, setType] = useState<TransactionType>(intent?.type || (s.refundFromHH ? 'Customer refund' : s.refundFromResort ? 'Resort refunded guest' : s.referrerRefund ? 'Referrer refund' : s.resortReceivable ? s.transferred > 0 ? 'Resort refund' : 'Commission received' : s.resortDue ? 'Resort transfer' : s.referrerDue ? 'Referrer payout' : 'Advance received'));
  const external=['Guest paid resort','Resort refunded guest'].includes(type);
  const limit=paymentLimit(s,type);
  const [amount,setAmount]=useState(()=>intent?.amount!==undefined ? moneyInput(intent.amount) : intent?.type && intent.type!=='Advance received' && limit ? moneyInput(limit) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const tx: Transaction = { id: paymentKey, segmentId, type, amount: parseMoney(String(form.get('amount'))),
        date: String(form.get('date')), method: external?'Direct to resort':String(form.get('method')), reference: String(form.get('reference') || ''), note: String(form.get('note') || '') };
      validateTransaction(scoped, tx, TODAY);
      await saveBooking({ ...booking, transactions: [...booking.transactions, tx], history: [{ text: `${type} recorded · ${formatMoney(tx.amount)} · ${tx.method}`, date: TODAY }, ...booking.history] });
      notify('Transaction recorded. Balances updated.'); onSaved(booking.id);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Overlay title="Record a payment" onClose={()=>{if(!busy)onClose();}}><form onSubmit={submit}><div className="form-body"><p className="eyebrow">{booking.id} · {booking.name}</p>{intent?.type==='Advance received'&&['Inquiry','Pending confirmation'].includes(booking.status)&&<p className="hint">Record the actual customer advance received. Required advance: {formatMoney(booking.expectedAdvance)}. Saving the payment keeps the booking pending until you confirm it.</p>}<div className="form-grid"><label className="field full">Apply payment to stay<select value={segmentId} onChange={e=>{setSegmentId(e.target.value);setAmount('');}} required>{booking.record?.segments.map((s,i)=><option key={s.id} value={s.id}>Stay {i+1} · {s.resort_name_snapshot} · {shortDate(s.check_in)}–{shortDate(s.check_out)}{s.is_cancelled?" · Cancelled":""}</option>)}</select></label>
    {intent?.type?<div className="field">Payment being recorded<strong>{type==='Advance received'?'Guest payment to Hill Horizon':type==='Resort transfer'?'Money sent to resort':type==='Commission received'||type==='Resort refund'?'Money received from resort':type}</strong></div>:<label className="field">Transaction type<select name="type" aria-label="Transaction type" value={type} onChange={e=>{setType(e.target.value as TransactionType);setAmount('');}}>{TRANSACTION_TYPES.filter(t=>t!=='Guest paid resort').map(t=><option key={t}>{t}</option>)}</select></label>}
    <label className="field">Amount · BDT<input name="amount" type="number" min="0.01" step="0.01" max="10000000" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Actual amount" /></label>
    <div className="field full payment-limit">{limit !== undefined && <><span>Available for this stay: <strong>{formatMoney(limit)}</strong></span><Button secondary disabled={busy||limit<=0} onClick={()=>setAmount(moneyInput(limit))}>Use available amount</Button></>}</div>
    <label className="field">Payment date<input name="date" type="date" required defaultValue={TODAY} max={TODAY} /></label>
    {!external&&<label className="field">Payment method<select name="method" aria-label="Payment method">{['bKash', 'Nagad', 'Bank transfer', 'Cash'].map(m => <option key={m}>{m}</option>)}</select></label>}
    <label className="field full">Transaction reference<input name="reference" required={["Guest paid resort","Resort refunded guest"].includes(type)} maxLength={100} placeholder="Transaction ID or reference" /></label>
    <p className="hint field full">Use the transaction ID or reference from the payment receipt.</p>
    <label className="field full">Note<input name="note" maxLength={300} /></label>
  </div>{!intent?.type&&<div className="form-summary"><PriceLine label="Net advance received" value={s.advance} /><PriceLine label="Guest balance" value={s.guestBalance} /><PriceLine label="Resort transfer due" value={s.resortDue} /><PriceLine label="Resort receivable" value={s.resortReceivable} /><PriceLine label="Referrer payout due" value={s.referrerDue}/><PriceLine label="Recover from referrer" value={s.referrerRefund}/><PriceLine label="Guest refund from Hill Horizon" value={s.refundFromHH}/><PriceLine label="Guest refund from resort" value={s.refundFromResort}/>{s.refund > 0 && <PriceLine label="Guest refund due" value={s.refund} />}</div>}
    {['Guest paid resort', 'Resort refunded guest'].includes(type) && <p className="subtitle">This records money directly between guest and resort. It does not count as Hill Horizon cash.</p>}
    {error && <p className="error" role="alert">{error}</p>}</div><div className="form-foot"><Button secondary disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save transaction'}</Button></div></form></Overlay>;
}

export function CancellationForm({booking,onClose,onSaved}:{booking:Booking;onClose:()=>void;onSaved:(id:string)=>void}) {
  const {mutate,saving,notify} = useWorkspace();
  const [scope,setScope] = useState('all'),[reason,setReason] = useState(''),[error,setError] = useState('');
  const [rows,setRows] = useState(()=>booking.record?.segments.map(s=>({segment:s.id,guest:s.is_cancelled?s.guest_charge_on_cancellation || '0':'',supplier:s.is_cancelled?s.supplier_charge_on_cancellation || '0':'',referral:s.is_cancelled?s.referral_share_on_cancellation || '0':Number(s.referral_share)?'':'0'})) || []);
  async function submit(event:FormEvent) {
    event.preventDefault();setError('');
    try {const settlements=rows.filter(r=>scope==='all' || r.segment===scope).map(r=>({segment:r.segment,guest_charge:(parseMoney(r.guest)/100).toFixed(2),supplier_charge:(parseMoney(r.supplier)/100).toFixed(2),referral_share:(parseMoney(r.referral)/100).toFixed(2)}));await mutate(()=>request(`/api/v1/bookings/${booking.apiId}/${scope==='all'?'cancel':'cancel-stay'}/`,'POST',{version:booking.version,reason,settlements}));notify('Cancellation charges recorded. Record actual refunds separately.');onSaved(booking.id);}
    catch(e){setError(errorMessage(e));}
  }
  return <Overlay title="Cancel booking or stay" onClose={()=>{if(!saving)onClose();}}><form onSubmit={submit}><div className="form-body"><fieldset className="directory-fields" disabled={saving}><p className="hint">Enter final charges kept after cancellation, including explicit zeros. Payments and original booking history are preserved.</p><label className="field">Services to cancel<select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">Entire booking</option>{booking.record?.segments.filter(s=>!s.is_cancelled).map(s=><option key={s.id} value={s.id}>{s.resort_name_snapshot} · {shortDate(s.check_in)}–{shortDate(s.check_out)}</option>)}</select></label>{rows.filter(r=>scope==='all'||r.segment===scope).map(row=>{
    const stay=booking.record?.segments.find(s=>s.id===row.segment);
    return <section className="editor-section" key={row.segment}><h3>{stay?.resort_name_snapshot}{stay?.is_cancelled?' · Previously cancelled':''}</h3><div className="form-grid">{([['guest','Final guest charge'],['supplier','Final resort entitlement'],['referral','Final referrer share']] as const).map(([key,label])=><label className="field" key={key}>{label} · BDT<input type="number" min={0} step="0.01" required disabled={stay?.is_cancelled} value={row[key]} onChange={e=>setRows(rs=>rs.map(r=>r.segment===row.segment?{...r,[key]:e.target.value}:r))}/></label>)}</div></section>;
  })}<label className="field">Reason and agreed terms<textarea rows={3} maxLength={2000} required value={reason} onChange={e=>setReason(e.target.value)}/></label></fieldset>{error&&<p className="error" role="alert">{error}</p>}</div><div className="form-foot"><Button secondary disabled={saving} onClick={onClose}>Keep booking</Button><Button type="submit" disabled={saving}>{saving?'Saving…':'Save cancellation'}</Button></div></form></Overlay>;
}

function OwnerBookingDrawer({booking,initialTab='Details',onClose,onEdit,onPay,onCancel}:{booking:Booking;initialTab?:BookingTab;onClose:()=>void;onEdit:()=>void;onPay:(intent?:PaymentIntent)=>void;onCancel:()=>void}) {
  const [tab,setTab] = useState<BookingTab>(initialTab);
  const {user} = useWorkspace();
  const finished=['Completed','Cancelled'].includes(booking.status)||!!booking.record?.closed_at;
  return <Overlay title={`Booking ${booking.id}`} onClose={onClose} drawer heading={<><div className="eyebrow">{booking.id} · BOOKING DETAILS</div><h2>{booking.name}</h2><p>{booking.record?.segments.length || 0} resort stay(s)</p><Tag>{booking.status}</Tag>{booking.record?.closed_at&&<Tag>Settlement closed</Tag>}</>}><div className="tabs">{(['Details','Pricing','Payments','Documents','History'] as BookingTab[]).map(t=><button type="button" key={t} className={'tab '+(t===tab?'active':'')} onClick={()=>setTab(t)}>{t==='Payments'?'Settlement':t}</button>)}</div><div className="drawer-body">
    {tab==='Details'&&<><BookingWorkflow booking={booking} onEdit={onEdit} onPay={onPay} onCancel={onCancel} onDocuments={()=>setTab('Documents')}/><details className="section-card booking-more"><summary>Property details & saved information</summary>{booking.record?.segments.map(s=><section className="section-card" key={s.id}><h3>{s.resort_name_snapshot} · saved stay information</h3><p className="editor-help">Captured for this booking. Later catalog edits do not update these details.</p><details className="catalog-reference"><summary>Arrival, resort contacts & information</summary><ProfileDetails kind="resort" record={s.resort_details_snapshot}/>{s.supplier_terms_snapshot&&<div><h4>Internal supplier payment terms</h4><p style={{whiteSpace:'pre-wrap'}}>{s.supplier_terms_snapshot}</p></div>}</details>{s.items.filter(i=>i.item_type==='room').map(i=><details className="catalog-reference" key={i.id}><summary>{i.description_snapshot} · room details & inclusions</summary><ProfileDetails kind="room" record={i.room_details_snapshot}/></details>)}{!s.resort_details_snapshot||!Object.keys(s.resort_details_snapshot).length?<p className="editor-help">This older booking has no captured resort profile. Its original dates, prices and policies are unchanged.</p>:null}</section>)}</details></>}
    {tab==='Pricing'&&<><SavedPricing booking={booking}/><div className="actions"><Button onClick={()=>setTab('Payments')}>View payments & settlement</Button>{!finished&&user?.permissions.includes('bookings.amend_booking')&&<Button secondary onClick={onEdit}>Edit stays & pricing</Button>}</div></>}
    {tab==='Payments'&&<BookingPayments booking={booking} onPay={onPay}/>}
    {tab==='Documents'&&<BookingDocuments booking={booking}/>}
    {tab==='History'&&<section className="section-card"><h3>Booking activity</h3>{booking.history.map((entry,i)=><div className="history-item" key={i}>{entry.text}<small>{shortDate(entry.date,true)}</small></div>)}</section>}
  </div></Overlay>;
}


export function BookingDrawer(props:{booking:Booking;initialTab?:BookingTab;onClose:()=>void;onEdit:()=>void;onPay:(intent?:PaymentIntent)=>void;onCancel:()=>void}) {
  const {user}=useWorkspace();return user?.is_superuser?<OwnerBookingDrawer {...props}/>:<OfficerBookingDrawer booking={props.booking} onClose={props.onClose}/>;
}
