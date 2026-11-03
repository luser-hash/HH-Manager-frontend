'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {cents,request,today,type ApiBooking} from '@/lib/api';
import {formatMoney,parseMoney} from '@/lib/booking';
import {officerPayload,officerSelections,officerStay,type OfficerDraft,type OfficerQuote} from '@/lib/officer-booking';
import {useWorkspace} from './workspace';
import {Button,Overlay} from './ui';

export function SimpleBookingForm({onClose,onSaved,onAdvanced}:{onClose:()=>void;onSaved:(id:string)=>void;onAdvanced?:(draft:OfficerDraft)=>void}) {
  const {resorts,customers,user,mutate,saving,notify}=useWorkspace();
  const [draft,setDraft]=useState<OfficerDraft>(()=>({key:crypto.randomUUID(),customer:'',name:'',phone:'',email:'',whatsapp:'',guests:2,advance:'',notes:'',stays:[officerStay(resorts[0],today())]}));
  const [discount,setDiscount]=useState('0.00');
  const [quote,setQuote]=useState<{identity:string;data:OfficerQuote}|null>(null),[quoteError,setQuoteError]=useState(''),[error,setError]=useState('');
  const lock=useRef(false),stay=draft.stays[0],resort=resorts.find(r=>r.id===stay.resort),room=resort?.rooms.find(r=>r.id===stay.items[0].room);
  const selections=[{...stay,guests:draft.guests,items:[{...stay.items[0],discount}]}],identity=JSON.stringify(selections);
  useEffect(()=>{
    let active=true;setQuoteError('');
    const timer=setTimeout(()=>{void(async()=>{try{const data=await request<OfficerQuote>('/api/v1/bookings/quote/','POST',officerSelections(JSON.parse(identity)));if(active)setQuote({identity,data});}catch(e){if(active){setQuote(null);setQuoteError(e instanceof Error?e.message:'Select the room and stay dates to calculate the price.');}}})();},250);
    return()=>{active=false;clearTimeout(timer);};
  },[identity]);
  function patchStay(patch:Partial<typeof stay>){setDraft(d=>({...d,stays:[{...d.stays[0],...patch}]}));}
  async function save(event:FormEvent){
    event.preventDefault();if(lock.current)return;setError('');
    try {
      if(!quote||quote.identity!==identity)throw new Error('Wait for the room price to finish updating.');
      if(parseMoney(draft.advance||'0')>cents(quote.data.selling_total))throw new Error('The advance cannot exceed the guest total.');
      const payload=officerPayload({...draft,stays:selections},customers,quote.data.selling_total);
      lock.current=true;
      const booking=await mutate(()=>request<ApiBooking>('/api/v1/bookings/','POST',payload));
      notify('Booking saved. Next: check availability with the supplier.');onSaved(booking.reference);
    }catch(e){setError(e instanceof Error?e.message:'Could not save this booking.');}finally{lock.current=false;}
  }
  const ready=quote?.identity===identity;
  return <Overlay title="New booking" onClose={()=>{if(!lock.current)onClose();}}><form className="simple-booking" onSubmit={save}>
    <div className="form-body"><p className="editor-help">Add the guest and room. You’ll verify availability and collect the advance next.</p><fieldset className="directory-fields" disabled={saving}><div className="form-grid">
      <label className="field">Guest name<input name="guest_name" autoComplete="name" required maxLength={150} value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value,customer:''}))}/></label>
      <label className="field">Phone<input name="guest_phone" autoComplete="tel" type="tel" required maxLength={40} value={draft.phone} onChange={e=>setDraft(d=>({...d,phone:e.target.value,customer:''}))}/></label>
      <label className="field full">Hotel / resort<select required value={stay.resort} onChange={e=>{const next=resorts.find(r=>r.id===e.target.value);setDiscount('0.00');patchStay({resort:e.target.value,items:[{...stay.items[0],room:next?.rooms[0]?.id||'',discount:'0.00'}]});}}>{!resorts.length&&<option value="">Add a property in Contacts first</option>}{resorts.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="field full">Room<select required value={stay.items[0].room} onChange={e=>{setDiscount('0.00');patchStay({items:[{...stay.items[0],room:e.target.value}]});}}>{!resort?.rooms.length&&<option value="">No room categories available</option>}{resort?.rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="field">Check-in<input type="date" required value={stay.checkIn} onChange={e=>{const start=e.target.value;let end=stay.checkOut;if(start&&end<=start){const next=new Date(start+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);end=next.toISOString().slice(0,10);}patchStay({checkIn:start,checkOut:end});}}/></label>
      <label className="field">Check-out<input type="date" required min={stay.checkIn} value={stay.checkOut} onChange={e=>patchStay({checkOut:e.target.value})}/></label>
      <label className="field">Rooms<input type="number" required min={1} max={1000} value={stay.items[0].quantity} onChange={e=>patchStay({items:[{...stay.items[0],quantity:Number(e.target.value)}]})}/></label>
      <label className="field">Guests<input type="number" required min={1} max={1000} value={draft.guests} onChange={e=>setDraft(d=>({...d,guests:Number(e.target.value)}))}/></label>
    </div>
    {quoteError&&<p className="error" role="alert">{quoteError}</p>}
    <details className="catalog-reference"><summary>Advance, discount & guest notes (optional)</summary><div className="form-grid">
      <label className="field full">Advance to collect · BDT<input type="number" min={0} step="0.01" placeholder="Set an amount, or leave blank" value={draft.advance} onChange={e=>setDraft(d=>({...d,advance:e.target.value}))}/><small>This is the amount to collect later, not a payment received.</small></label>
      {user?.permissions.includes('bookings.apply_booking_discount')&&Number(room?.staff_discount_limit||0)>0&&<label className="field full">Guest discount · BDT<input type="number" min={0} step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>}
      <label className="field full">Guest requests / notes<textarea rows={2} maxLength={10000} value={draft.notes} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))}/></label>
      {!!customers.length&&<label className="field full">Use an existing guest<select value={draft.customer} onChange={e=>{const c=customers.find(c=>c.id===e.target.value);if(c)setDraft(d=>({...d,customer:c.id,name:c.full_name,phone:c.phone_original}));else setDraft(d=>({...d,customer:''}));}}><option value="">Match automatically by phone</option>{customers.filter(c=>!c.is_archived).map(c=><option key={c.id} value={c.id}>{c.full_name} · {c.phone_original}</option>)}</select></label>}
    </div></details></fieldset>{error&&<p className="error" role="alert">{error}</p>}
    </div><div className="form-foot"><div className="simple-booking-total" role="status"><span>Guest total</span><strong>{ready&&quote?formatMoney(cents(quote.data.selling_total)):quoteError?'Price needs review':'Calculating…'}</strong></div>{onAdvanced&&<Button secondary disabled={saving} onClick={()=>onAdvanced({...draft,stays:selections})}>More booking options</Button>}<Button secondary disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving||!ready||!user?.permissions.includes('bookings.add_booking')}>{saving?'Saving…':'Save & check availability'}</Button></div>
  </form></Overlay>;
}
