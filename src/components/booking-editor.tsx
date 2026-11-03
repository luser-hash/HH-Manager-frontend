'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Booking } from '@/lib/types';
import { all, cents, request, today, type ApiBooking } from '@/lib/api';
import { draftFromBooking, editorPayload, newLine, newStay, priceDraft, priceStay, type EditorLine, type EditorStay } from '@/lib/booking-editor';
import { formatMoney, nights, parseMoney } from '@/lib/booking';
import { Button, Overlay } from './ui';
import { useWorkspace } from './workspace';
import { chooseRoom, refreshRoomRate, rateCovers } from '@/lib/catalog';
import { ProfileDetails } from './catalog-profile';
import {agreementLabels,agreementValueLabel,type AgreementModel} from '@/lib/agreements';

export const priceLabels = [
  ['public_total','Regular / rack total'],['resort_funded_discount','Resort-funded discount'],['hill_horizon_funded_discount','Hill Horizon-funded discount'],
  ['guest_total','Guest selling total'],['agreed_commission','Base margin / commission'],['commission_available_for_retention','Commission retained after your discount'],
  ['referral_share','Referrer share'],['your_earnings','Net margin after discount & referrer'],['resort_entitlement','Resort entitlement'],
] as const;
export function PriceBreakdown({totals}:{totals:Record<string,number>}) {
  return <div>{priceLabels.map(([key,label]) => <div key={key} className={'price-line ' + (['guest_total','your_earnings','resort_entitlement'].includes(key) ? 'total' : '')}><span>{label}</span><strong>{formatMoney(totals[key] || 0)}</strong></div>)}</div>;
}
export function SavedPricing({booking}:{booking:Booking}) {
  return <>{booking.record?.segments.map((s,index) => <section className="section-card" key={s.id}><h3>Stay {index+1} · {s.resort_name_snapshot}{s.is_cancelled ? ' · Cancelled' : ''}</h3><div className="table-wrap"><table><thead><tr><th>Charge</th><th>Quantity / basis</th><th>Rack unit price</th><th>Public line total</th><th>Your discount</th><th>Resort discount</th><th>Base margin</th><th>Guest line total</th></tr></thead><tbody>{s.items.map(i => {
    const publicTotal = cents(i.public_unit_price) * i.quantity * (i.price_basis === 'night' ? nights({checkIn:s.check_in,checkOut:s.check_out}) : 1);
    return <tr key={i.id}><td><strong>{i.description_snapshot}</strong><small>{i.item_type}{i.pricing_model&&i.pricing_model!=='manual'?' · '+agreementLabels[i.pricing_model]+': '+(i.pricing_model==='percent'?i.agreement_value+'%':formatMoney(cents(i.agreement_value||undefined)))+(i.pricing_model==='percent'?'':i.agreement_basis==='line_total'?' total for line':' per pricing unit'):''}{i.price_confirmed === false ? ' · Price not agreed' : ''}</small></td><td>{i.quantity} × {i.price_basis === 'night' ? `${nights({checkIn:s.check_in,checkOut:s.check_out})} nights` : 'whole stay'}</td><td>{formatMoney(cents(i.public_unit_price))}</td><td>{formatMoney(publicTotal)}</td><td>{formatMoney(cents(i.hill_horizon_funded_discount))}</td><td>{formatMoney(cents(i.resort_funded_discount))}</td><td>{formatMoney(cents(i.agreed_commission))}</td><td>{formatMoney(publicTotal-cents(i.hill_horizon_funded_discount)-cents(i.resort_funded_discount))}</td></tr>;
  })}</tbody></table></div>{s.is_cancelled && <p className="hint">Line prices show the original agreement. The totals below use the final cancellation charges.</p>}{s.financial_summary && <PriceBreakdown totals={Object.fromEntries(Object.entries(s.financial_summary).map(([key,value]) => [key,cents(value)]))}/>}</section>)}{(booking.record?.segments.length||0)>1&&<section className="section-card"><h3>Full booking totals</h3><PriceBreakdown totals={Object.fromEntries(Object.entries(booking.serverSummary || {}).map(([key,value]) => [key,cents(value)]))}/></section>}</>;
}

export function BookingEditor({booking,onClose,onSaved,initialDraft}:{booking?:Booking;onClose:()=>void;onSaved:(id:string)=>void;initialDraft?:import('@/lib/booking-editor').EditorDraft}) {
  const {resorts,customers,user,mutate,saving,notify} = useWorkspace();
  const [draft,setDraft] = useState(() => initialDraft||draftFromBooking(booking,resorts,today()));
  const [baseVersion] = useState(booking?.version);
  const [error,setError] = useState('');
  const [physicalRooms,setPhysicalRooms] = useState<{id:string;category:string;name:string;is_archived:boolean}[]>([]);
  const lock = useRef(false);
  const close = useCallback(() => { if (!lock.current) onClose(); },[onClose]);
  useEffect(() => { let active = true; if (user?.permissions.includes('resorts.view_physicalroom')) void all<{id:string;category:string;name:string;is_archived:boolean}>('/api/v1/physical-rooms/').then(rows => {if(active)setPhysicalRooms(rows);}).catch(() => {}); return () => {active=false;}; },[user]);
  const cancelled = booking?.record?.segments.filter(s => s.is_cancelled) || [];
  let totals:ReturnType<typeof priceDraft> | undefined, pricingError = '';
  try { totals = priceDraft(draft,cancelled); } catch(e) { pricingError = e instanceof Error ? e.message : 'Check prices.'; }
  const stale = !!booking && booking.version !== baseVersion;
  const maySave = !stale && user?.permissions.includes(booking ? 'bookings.amend_booking' : 'bookings.add_booking') && user?.permissions.includes('bookings.view_internal_pricing');
  function stayPatch(key:string, patch:Partial<EditorStay>) {
    setDraft(d=>({...d,stays:d.stays.map(s=>{
      if(s.key!==key)return s;const updated={...s,...patch};
      return {...updated,items:updated.items.map(line=>refreshRoomRate(line,updated,resorts.find(r=>r.id===updated.resort)))};
    })}));
  }
  function linePatch(stay:EditorStay,key:string,patch:Partial<EditorLine>) {
    stayPatch(stay.key,{items:stay.items.map(i=>i.key===key?{...i,...patch,
      catalogPrice:patch.price!==undefined||patch.basis!==undefined?false:i.catalogPrice,
      catalogCommission:patch.commission!==undefined||patch.basis!==undefined||patch.agreementValue!==undefined||patch.agreementBasis!==undefined||patch.pricingModel!==undefined?false:i.catalogCommission}:i)});
  }
  function loadRoom(stay:EditorStay,line:EditorLine,roomId:string) {
    stayPatch(stay.key,{items:stay.items.map(i=>i.key===line.key?chooseRoom(i,roomId,stay,resorts.find(r=>r.id===stay.resort)):i)});
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(lock.current)return; setError('');
    try {
      if (stale) throw new Error('This booking changed since the editor opened. Close and reopen it to review the latest data before saving.');
      if (booking?.record?.closed_at || booking && ['Completed','Cancelled'].includes(booking.status)) throw new Error('This booking is finished or closed and cannot be amended.');
      const payload = editorPayload(draft,resorts,!!booking);
      if (totals && parseMoney(draft.advance || '0') > totals.guest_total) throw new Error('Required advance exceeds the guest total.');
      lock.current = true;
      const saved = await mutate(() => request<ApiBooking>(booking ? `/api/v1/bookings/${booking.apiId}/amend/` : '/api/v1/bookings/','POST',{...payload,...(booking ? {version:baseVersion} : {})}));
      notify(booking ? 'Booking amended. Payments are preserved; verify every active stay again.' : 'Booking created. Review supplier confirmations and the required advance.');
      onSaved(saved.reference);
    } catch(e) {setError(e instanceof Error ? e.message : 'Could not save booking.');} finally {lock.current=false;}
  }
  return <Overlay wide title={booking ? `Edit ${booking.id}` : 'Create a complete booking'} onClose={close}><form onSubmit={submit}>
    <div className="form-body booking-editor"><fieldset disabled={saving} className="directory-fields"><div className="editor-layout"><div>
      <section className="editor-section"><h3>Customer & booking</h3><div className="form-grid">
        {!booking && <label className="field full">Customer<select value={draft.customerId} onChange={e => {const c=customers.find(c => c.id === e.target.value);setDraft(d => ({...d,customerId:c?.id || '',...(c ? {name:c.full_name,phone:c.phone_original} : {})}));}}><option value="">Match by phone or create automatically</option>{customers.filter(c => !c.is_archived).map(c => <option key={c.id} value={c.id}>{c.full_name} · {c.phone_original}</option>)}</select></label>}
        <label className="field">Guest name<input required maxLength={150} value={draft.name} onChange={e => setDraft(d => ({...d,name:e.target.value}))}/></label>
        <label className="field">Phone<input required type="tel" maxLength={40} value={draft.phone} onChange={e => setDraft(d => ({...d,phone:e.target.value,...(!booking ? {customerId:''} : {})}))}/></label>
        {!booking && !draft.customerId && <><label className="field">Email<input type="email" maxLength={254} value={draft.email} onChange={e => setDraft(d => ({...d,email:e.target.value}))}/></label><label className="field">WhatsApp<input maxLength={40} value={draft.whatsapp} onChange={e => setDraft(d => ({...d,whatsapp:e.target.value}))}/></label><label className="field full">How they found us<input maxLength={100} value={draft.source} onChange={e => setDraft(d => ({...d,source:e.target.value}))}/></label></>}
        <label className="field">Booking guest count<input type="number" required min={1} max={1000} value={draft.guests} onChange={e => setDraft(d => ({...d,guests:Number(e.target.value)}))}/></label>
        <label className="field">Required advance · BDT<input type="number" min={0} step="0.01" required value={draft.advance} onChange={e => setDraft(d => ({...d,advance:e.target.value}))}/></label>
      </div></section>
      {draft.stays.map((stay,index) => {
        const resort = resorts.find(r => r.id === stay.resort);
        const paid = booking?.transactions.some(t => t.segmentId === stay.id);
        const capacity = stay.items.filter(i => i.type === 'room').reduce((sum,i) => sum+(resort?.rooms.find(r => r.id === i.room)?.max_occupancy || 0)*i.quantity,0);
        let stayTotals:ReturnType<typeof priceStay> | undefined; try {stayTotals=priceStay(stay);}catch{}
        return <section className="editor-section" key={stay.key}><div className="editor-section-head"><h3>Stay {index+1}</h3><Button secondary disabled={draft.stays.length === 1 || paid} onClick={() => setDraft(d => ({...d,stays:d.stays.filter(s => s.key !== stay.key)}))}>Remove stay</Button></div>
          {paid && <p className="hint">This stay has payment history. Keep it linked to its resort; use cancellation to settle removed services.</p>}
          <div className="form-grid"><label className="field full">Resort<select aria-label="Resort" required disabled={paid} value={stay.resort} onChange={e => {const r=resorts.find(r => r.id === e.target.value);stayPatch(stay.key,{resort:e.target.value,details:undefined,items:stay.items.map(i=>i.type==='room'?chooseRoom(i,r?.rooms[0]?.id||'',stay,r):i)});}}><option value="" disabled>Select resort</option>{!resort && stay.resort && <option value={stay.resort}>Archived resort — choose an active resort</option>}{resorts.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className="field">Check-in<input type="date" required value={stay.checkIn} onChange={e => stayPatch(stay.key,{checkIn:e.target.value})}/></label><label className="field">Check-out<input type="date" required value={stay.checkOut} onChange={e => stayPatch(stay.key,{checkOut:e.target.value})}/></label><label className="field">Guests on this stay<input type="number" min={1} max={1000} required value={stay.guests} onChange={e => stayPatch(stay.key,{guests:Number(e.target.value)})}/></label><div className="hint">{Number.isFinite(nights(stay)) ? nights(stay) : 0} nights · {capacity} recorded room capacity</div></div>
          <details className="catalog-reference"><summary>Selected resort information · arrival, contacts & policies</summary><ProfileDetails kind="resort" record={stay.details && Object.keys(stay.details).length?stay.details:resort}/></details>
          {stay.items.map((line,lineIndex) => <div className="editor-line" key={line.key}><div className="editor-section-head"><h4>Line {lineIndex+1} · {line.type === 'room' ? 'Room' : line.type === 'meal' ? 'Meal' : 'Additional charge'}</h4><Button secondary onClick={() => stayPatch(stay.key,{items:stay.items.filter(i => i.key !== line.key)})}>Remove line</Button></div><div className="form-grid">
            {line.type === 'room' && <label className="field full">Room category<select aria-label="Room category" required value={line.room} onChange={e => loadRoom(stay,line,e.target.value)}><option value="">Select room category</option>{line.room && !resort?.rooms.some(r => r.id === line.room) && <option value={line.room}>Archived category — choose an active category</option>}{resort?.rooms.map(r => <option key={r.id} value={r.id}>{r.name} · up to {r.max_occupancy} guests</option>)}</select></label>}
            {line.type==='room'&&<div className="field full"><details className="catalog-reference"><summary>Selected room details & inclusions</summary><ProfileDetails kind="room" record={line.details&&Object.keys(line.details).length?line.details:resort?.rooms.find(r=>r.id===line.room)}/></details>{resort?.rooms.find(r=>r.id===line.room)?.rate_notes&&<p className="hint">Rate notes: {resort.rooms.find(r=>r.id===line.room)?.rate_notes}</p>}{resort?.rooms.find(r=>r.id===line.room)&&!rateCovers(resort.rooms.find(r=>r.id===line.room)!,stay)&&<p className="hint">Saved rate does not cover every occupied night. Obtain and enter a quote for these dates.</p>}<div className="actions"><Button secondary onClick={()=>loadRoom(stay,line,line.room)}>Load current room defaults</Button><span className="editor-help">{line.catalogPrice?'Saved public rate':'Manual / agreed public rate'} · {line.pricingModel&&line.pricingModel!=='manual'?agreementLabels[line.pricingModel]+' · margin calculated automatically':'Manual / agreed line margin'}</span></div><small>Loading defaults replaces this line’s price, commission, description and discounts. Extra-bed reference fees are not added automatically.</small></div>}
            <label className="field full">Description<input maxLength={200} required={line.type !== 'room'} placeholder={resort?.rooms.find(r => r.id === line.room)?.name || 'e.g. Breakfast, extra bed, transport'} value={line.description} onChange={e => linePatch(stay,line.key,{description:e.target.value})}/></label>
            {line.type === 'room' && (physicalRooms.some(r => r.category === line.room) || line.physicalRoom) && <label className="field full">Identified room (optional)<select aria-label="Identified room (optional)" value={line.physicalRoom} onChange={e => linePatch(stay,line.key,{physicalRoom:e.target.value,...(e.target.value ? {quantity:1} : {})})}><option value="">Any room in this category</option>{line.physicalRoom && !physicalRooms.some(r => r.id === line.physicalRoom) && <option value={line.physicalRoom}>Current room assignment</option>}{physicalRooms.filter(r => r.category === line.room && (!r.is_archived || r.id === line.physicalRoom)).map(r => <option key={r.id} value={r.id}>{r.name}{r.is_archived ? ' (archived)' : ''}</option>)}</select></label>}
            <label className="field">Quantity<input type="number" min={1} max={line.physicalRoom ? 1 : 1000} required value={line.quantity} onChange={e => linePatch(stay,line.key,{quantity:Number(e.target.value)})}/></label>
            <label className="field">Price basis<select aria-label="Price basis" value={line.basis} onChange={e => linePatch(stay,line.key,{basis:e.target.value as EditorLine['basis']})}><option value="unit">Per unit for whole stay</option><option value="night">Per unit per night</option></select></label>
            <label className="field full">Supplier agreement<select value={line.pricingModel||'manual'} onChange={e=>linePatch(stay,line.key,{pricingModel:e.target.value as AgreementModel,agreementValue:'',agreementBasis:e.target.value==='flat_rate'?'line_total':'unit'})}>{Object.entries(agreementLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{line.pricingModel&&line.pricingModel!=='manual'&&line.pricingModel!=='percent'&&<label className="field full">Agreement amount applies to<select value={line.agreementBasis||'unit'} onChange={e=>linePatch(stay,line.key,{agreementBasis:e.target.value as 'unit'|'line_total'})}><option value="unit">Each room / rack pricing unit</option><option value="line_total">Fixed total for this entire room line</option></select></label>}{line.pricingModel&&line.pricingModel!=='manual'&&<label className="field full">{agreementValueLabel(line.pricingModel,line.basis,line.agreementBasis)}<input type="number" required min={0} max={line.pricingModel==='percent'?100:10000000} step="0.01" value={line.agreementValue||''} onChange={e=>linePatch(stay,line.key,{agreementValue:e.target.value})}/><small>{line.pricingModel==='b2b'||line.pricingModel==='flat_rate'?'Base margin = rack total − supplier cost total.':'Base margin follows this commission agreement.'} Your discount and referrer share reduce the resulting margin.</small></label>}
            {([['price','Regular / rack unit price · BDT'],['commission','Base margin · line total'],['ownDiscount','Your funded discount · line total'],['resortDiscount','Resort-funded discount · line total']] as const).map(([key,label]) => <label className="field" key={key}>{label}<input type="number" min={0} max={10000000} step="0.01" readOnly={key==='commission'&&!!line.pricingModel&&line.pricingModel!=='manual'} placeholder={key === 'price' ? 'Not agreed yet' : '0.00'} value={line[key]} onChange={e => linePatch(stay,line.key,{[key]:e.target.value})}/></label>)}
          </div><LineEstimate stay={stay} line={line}/><p className="editor-help">Unit price × quantity{line.basis === 'night' ? ' × nights' : ''}. Discounts are totals for this line. Margin is calculated from the agreement; manual mode allows an agreed line margin. Enter 0 for an agreed free item; an empty price blocks confirmation.</p></div>)}
          <div className="actions"><Button secondary onClick={() => stayPatch(stay.key,{items:[...stay.items,chooseRoom(newLine(),resort?.rooms[0]?.id||'',stay,resort)]})}>+ Room category</Button><Button secondary onClick={() => stayPatch(stay.key,{items:[...stay.items,newLine('meal')]})}>+ Meal</Button><Button secondary onClick={() => stayPatch(stay.key,{items:[...stay.items,newLine('extra')]})}>+ Additional charge</Button></div>
          <div className="form-grid editor-referral"><label className="field">Referrer name (optional)<input maxLength={150} value={stay.referrer} onChange={e => stayPatch(stay.key,{referrer:e.target.value})}/></label><label className="field">Referrer share · stay total<input type="number" min={0} step="0.01" value={stay.referral} onChange={e => stayPatch(stay.key,{referral:e.target.value})}/></label></div>
          {stay.guests > capacity && <><p className="hint">Guest count exceeds the recorded capacity. Confirmation requires an authorized capacity override.</p><label className="field">Capacity override reason<input maxLength={500} value={stay.capacityReason} onChange={e => stayPatch(stay.key,{capacityReason:e.target.value})}/></label></>}
          {stayTotals && <div className="form-summary"><span>Stay guest total</span><strong>{formatMoney(stayTotals.guest_total)}</strong></div>}{stayTotals&&<div className="line-estimate"><span>Supplier payable <strong>{formatMoney(stayTotals.resort_entitlement)}</strong></span><span>Stay net margin after referrer <strong>{formatMoney(stayTotals.your_earnings)}</strong></span></div>}
        </section>;
      })}
      <Button secondary onClick={() => setDraft(d => ({...d,stays:[...d.stays,newStay(resorts[0],d.stays.at(-1)?.checkOut || today(),d.stays.at(-1)?.checkOut || today())]}))}>+ Add another resort stay</Button>
      {cancelled.length > 0 && <p className="hint">{cancelled.length} cancelled stay(s) remain unchanged, including their final charges and payment history.</p>}
      <section className="editor-section"><label className="field">Internal notes<textarea maxLength={10000} rows={3} value={draft.notes} onChange={e => setDraft(d => ({...d,notes:e.target.value}))}/></label>{booking && <label className="field">Reason for amendment<input required maxLength={1000} value={draft.reason} onChange={e => setDraft(d => ({...d,reason:e.target.value}))}/></label>}</section>
    </div><aside className="editor-summary"><h3>Full pricing · BDT</h3>{totals ? <PriceBreakdown totals={totals}/> : <p className="error">{pricingError}</p>}<p className="editor-help">Net margin = base margin − your funded discount − referrer share (before fees). Commission agreements calculate the base margin automatically. Meal and extra charges use the same pricing rules and belong to their selected resort.</p><h3>Before confirmation</h3><ul><li>At least one room category on every stay.</li><li>Every line has an agreed price.</li><li>Every stay has current supplier verification with a name, time and reference.</li><li>Required advance is received.</li><li>Guest counts fit capacity and identified rooms have no conflicts.</li></ul><p className="hint">{booking ? 'Saving an amendment preserves payments and returns the booking to pending confirmation. Re-verify every active stay and record policy acknowledgements again when obtained.' : 'Save as an inquiry, then verify each stay and review the confirmation checklist.'}</p></aside></div></fieldset>
    {stale ? <p className="error" role="alert">This booking changed since the editor opened. Close and reopen it to review the latest data before saving.</p> : !maySave && <p className="error">You do not have permission to save this booking.</p>}{error && <p className="error" role="alert">{error}</p>}</div><div className="form-foot"><Button secondary disabled={saving} onClick={close}>Close</Button><Button type="submit" disabled={saving || !maySave}>{saving ? 'Saving…' : booking ? 'Save amendment' : 'Create booking'}</Button></div>
  </form></Overlay>;
}

function LineEstimate({stay,line}:{stay:EditorStay;line:EditorLine}) {
  if(line.rateProblem)return <p className="error" role="alert">{line.rateProblem}</p>;
  try {const t=priceStay({...stay,items:[line],referral:'0'});return <div className="line-estimate"><span>Rack line total <strong>{formatMoney(t.public_total)}</strong></span><span>Guest line total <strong>{formatMoney(t.guest_total)}</strong></span><span>Supplier payable <strong>{formatMoney(t.resort_entitlement)}</strong></span><span>Margin after your discount <strong>{formatMoney(t.commission_available_for_retention)}</strong></span></div>;}catch{return <p className="editor-help">Complete dates, quantity and prices to calculate this line.</p>;}
}
