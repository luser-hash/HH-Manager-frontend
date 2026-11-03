import {test} from 'node:test';
import assert from 'node:assert/strict';
import {officerPayload,officerSelections,type OfficerDraft} from '../src/lib/officer-booking.ts';
import {loadBookings,type ApiBooking} from '../src/lib/api.ts';
import {summary} from '../src/lib/booking.ts';
import {expandSimpleBooking} from '../src/lib/booking-editor.ts';
const draft:OfficerDraft={key:'stable-key',customer:'',name:'Guest',phone:'01700000000',email:'',whatsapp:'',guests:2,advance:'500',notes:'Late arrival',stays:[{key:'stay',resort:'resort',checkIn:'2026-11-01',checkOut:'2026-11-03',guests:2,items:[{key:'room',room:'category',quantity:1,discount:'200'}]}]};
test('opening more booking options preserves guest selections, advance, discount and request identity',()=>{
  const expanded=expandSimpleBooking(draft,[{id:'resort',name:'Resort',is_archived:false,rooms:[{id:'category',name:'Cottage',max_occupancy:2,default_price_basis:'night',default_public_price:'11000',default_commission_type:'b2b',default_commission:'9500'}]}],'2026-11-01');
  assert.equal(expanded.name,draft.name);assert.equal(expanded.phone,draft.phone);assert.equal(expanded.advance,draft.advance);assert.equal(expanded.createKey,draft.key);
  assert.equal(expanded.stays[0].checkIn,'2026-11-01');assert.equal(expanded.stays[0].checkOut,'2026-11-03');assert.equal(expanded.stays[0].items[0].room,'category');assert.equal(expanded.stays[0].items[0].ownDiscount,'200');assert.equal(expanded.stays[0].items[0].agreementValue,'9500');
});
test('officer payload allowlists guest selections and never submits financial agreements',()=>{
  const poisoned={...draft,internal_notes:'private',agreed_commission:'1500',stays:draft.stays.map(s=>({...s,supplier_terms_snapshot:'private',items:s.items.map(i=>({...i,public_unit_price:'1',agreement_value:'1',pricing_model:'b2b'}))}))};
  const payload=officerPayload(poisoned,[],'21800.00');
  assert.deepEqual(payload.segments[0].items,[{room_category:'category',quantity:1,discount:'200.00'}]);
  assert.equal(payload.quoted_total,'21800.00');assert.equal(payload.operations_notes,'Late arrival');
  const raw=JSON.stringify(payload);for(const key of ['agreed_commission','supplier_terms_snapshot','public_unit_price','pricing_model','internal_notes','agreement_value'])assert.ok(!raw.includes(key),key);
});
test('officer inputs reject invalid dates, quantities and discounts before sending',()=>{
  assert.throws(()=>officerSelections([{...draft.stays[0],checkOut:'2026-10-31'}]),/dates/);
  assert.throws(()=>officerSelections([{...draft.stays[0],items:[{...draft.stays[0].items[0],quantity:0}]}]),/quantity/);
  assert.throws(()=>officerSelections([{...draft.stays[0],items:[{...draft.stays[0].items[0],discount:'-1'}]}]),/positive/);
});
test('officer workspace loads only public booking data and uses server guest balances',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const paths:string[]=[];
  const row={id:'id',reference:'HH-OFFICER',customer:'customer',status:'inquiry',version:1,guest_count:2,primary_contact_name:'Guest',primary_contact_phone:'017',expected_advance:'500.00',operations_notes:'Guest note',segments:[],created_at:'2026-11-01',requested_check_in:null,requested_check_out:null,guest_payments:{public_total:'22000.10',discount_total:'200.00',guest_total:'21800.10',net_guest_money_received:'500.05',guest_paid_direct_to_resort:'0.00',guest_balance_at_resort:'21300.05',guest_refund_due:'0.00'}} as ApiBooking;
  globalThis.fetch=async input=>{paths.push(String(input));return Response.json({results:[row],next:null});};
  const [booking]=await loadBookings([],[],false);
  assert.deepEqual(paths,['/api/v1/bookings/']);assert.equal(booking.notes,'Guest note');
  assert.equal(summary(booking).guestBalance,2130005);assert.equal(summary(booking).guestTotal,2180010);
  assert.equal(booking.serverSummary,undefined);assert.equal(booking.agreedCommission,0);
});
