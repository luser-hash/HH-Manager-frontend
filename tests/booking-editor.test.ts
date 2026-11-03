import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draftFromBooking,editorPayload,newLine,newStay,priceDraft,priceStay,type EditorDraft} from '../src/lib/booking-editor.ts';
import {mapBooking,persistBooking,type ApiBooking,type Resort,type Segment} from '../src/lib/api.ts';

const resorts:Resort[]=[{id:'r1',name:'First resort',is_archived:false,rooms:[{id:'c1',name:'Family cottage',max_occupancy:4},{id:'c2',name:'Suite',max_occupancy:2}]},{id:'r2',name:'Second resort',is_archived:false,rooms:[{id:'c3',name:'Cabin',max_occupancy:2}]}];
function draft():EditorDraft {
  const d=draftFromBooking(undefined,resorts,'2026-11-01');
  d.name='Test guest';d.phone='01700000000';d.guests=4;d.stays[0].guests=4;d.stays[0].checkOut='2026-11-03';
  d.stays[0].items=[{...newLine('room','c1'),quantity:2,basis:'night',price:'1000.00',commission:'500.00',ownDiscount:'100.00',resortDiscount:'200.00'},
    {...newLine('room','c2'),price:'2000.00',commission:'200.00'},
    {...newLine('meal'),description:'Breakfast',quantity:4,price:'100.00',commission:'40.00'},
    {...newLine('extra'),description:'Pickup',price:'500.00',commission:'50.00'}];
  d.stays[0].referrer='Partner';d.stays[0].referral='90.00';
  const next=newStay(resorts[1],'2026-11-03','2026-11-04');next.items[0].price='1000.00';next.items[0].commission='100.00';d.stays.push(next);
  return d;
}

test('multi-stay pricing includes nightly quantities, rooms, meals, extras, discounts and referral totals',()=>{
  const d=draft(),s=priceStay(d.stays[0]),all=priceDraft(d);
  assert.equal(s.public_total,690000);assert.equal(s.guest_total,660000);
  assert.equal(s.agreed_commission,79000);assert.equal(s.commission_available_for_retention,69000);
  assert.equal(s.your_earnings,60000);assert.equal(s.resort_entitlement,591000);
  assert.equal(all.public_total,790000);assert.equal(all.guest_total,760000);assert.equal(all.your_earnings,70000);
});
test('payload retains each resort and room UUID, and charges do not inherit a room category',()=>{
  const d=draft(),payload=editorPayload(d,resorts);
  assert.equal(payload.segments.length,2);assert.equal(payload.segments[0].resort,'r1');assert.equal(payload.segments[1].resort,'r2');
  assert.deepEqual(payload.segments[0].items.map(i=>i.item_type),['room','room','meal','extra']);
  assert.equal(payload.segments[0].items[0].room_category,'c1');assert.equal(payload.segments[0].items[0].price_basis,'night');
  assert.equal(payload.segments[0].items[2].room_category,null);assert.equal(payload.segments[0].items[3].public_unit_price,'500.00');
  assert.ok('customer_data' in payload);assert.ok('idempotency_key' in payload);
  assert.equal(payload.customer_data.phone_original,d.phone);assert.equal(payload.idempotency_key,d.createKey);
});
test('blank price remains unagreed while an explicit zero preserves an agreed free item',()=>{
  const d=draft();d.stays[0].items[3].price='';d.stays[0].items[3].commission='0';
  assert.equal('public_unit_price' in editorPayload(d,resorts).segments[0].items[3],false);
  d.stays[0].items[3].price='0';assert.equal(editorPayload(d,resorts).segments[0].items[3].public_unit_price,'0.00');
});
test('each stay requires a room, valid dates and a category belonging to its resort',()=>{
  const d=draft();d.stays[1].items[0].room='c1';assert.throws(()=>editorPayload(d,resorts),/room category/);
  d.stays[1].items=[];assert.throws(()=>editorPayload(d,resorts),/at least one room/);
  d.stays[1].checkOut=d.stays[1].checkIn;assert.throws(()=>editorPayload(d,resorts),/checkout/);
});
test('line discounts and referral shares cannot create negative retained earnings',()=>{
  const d=draft();d.stays[0].items[0].ownDiscount='501';assert.throws(()=>editorPayload(d,resorts),/discount exceeds/);
  d.stays[0].items[0].ownDiscount='100';d.stays[0].referral='1000';assert.throws(()=>editorPayload(d,resorts),/referrer share/);
});
test('money precision and quantities are validated before a request',()=>{
  const d=draft();d.stays[0].items[0].price='1.001';assert.throws(()=>editorPayload(d,resorts),/two decimal places/);
  d.stays[0].items[0].price='1000';d.stays[0].items[0].quantity=1.5;assert.throws(()=>editorPayload(d,resorts),/whole numbers/);
});

function segment(id:string,resort:string,room:string):Segment {
  return {id,resort,resort_name_snapshot:resort==='r1'?'First resort':'Second resort',check_in:'2026-11-01',check_out:'2026-11-03',guest_count:2,referrer_name:'',referral_share:'0.00',is_cancelled:false,cancellation_reason:'',guest_charge_on_cancellation:'0',supplier_charge_on_cancellation:'0',referral_share_on_cancellation:'0',items:[{id:'item-'+id,room_category:room,physical_room:'physical-'+id,item_type:'room',description_snapshot:'Original room description',quantity:1,price_basis:'night',public_unit_price:'123.45',agreed_commission:'10.00',hill_horizon_funded_discount:'1.00',resort_funded_discount:'2.00',price_confirmed:true}]};
}
const raw:ApiBooking={id:'booking-id',reference:'HH-MULTI',customer:'customer-id',primary_contact_name:'Guest',primary_contact_phone:'01700000000',status:'pending',version:7,guest_count:2,expected_advance:'0.00',internal_notes:'Original notes',created_at:'2026-11-01',requested_check_in:null,requested_check_out:null,segments:[segment('s1','r1','c1'),segment('s2','r2','c3')]};
test('editing round-trips all stays, IDs and physical-room assignments without flattening or mutating the original',()=>{
  const original=structuredClone(raw),b=mapBooking(raw,resorts,[]),d=draftFromBooking(b,resorts,'2026-11-01');d.reason='Add meal';
  d.stays[1].items.push({...newLine('meal'),description:'Dinner',price:'200.00'});
  const payload=editorPayload(d,resorts,true);
  assert.deepEqual(payload.segments.map(s=>s.id),['s1','s2']);assert.equal(payload.segments[1].items[0].physical_room,'physical-s2');
  assert.equal(payload.segments[1].items.length,2);assert.equal(payload.segments[1].items[0].public_unit_price,'123.45');
  assert.equal(payload.primary_contact_name,'Guest');assert.equal(payload.internal_notes,'Original notes');assert.deepEqual(raw,original);
  d.stays[1].items[0].quantity=2;assert.throws(()=>editorPayload(d,resorts,true),/identified room/);
});
test('cancelled stays are excluded from amendment payload and their final charges remain in the estimate',()=>{
  const cancelled={...segment('s3','r2','c3'),is_cancelled:true,financial_summary:{guest_total:'100.00',public_total:'200.00',your_earnings:'20.00',resort_entitlement:'80.00'}};
  const b=mapBooking({...raw,segments:[...raw.segments,cancelled]},resorts,[]),d=draftFromBooking(b,resorts,'2026-11-01');d.reason='Update active stays';
  assert.equal(d.stays.length,2);assert.equal(editorPayload(d,resorts,true).segments.length,2);
  assert.equal(priceDraft(d,[cancelled]).guest_total,priceDraft(d).guest_total+10000);
});
test('a complex-booking payment is allocated to the selected stay instead of the first stay',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let body:Record<string,unknown>={};
  globalThis.fetch=async (input,init)=>String(input).endsWith('/csrf/')?Response.json({csrfToken:'test'}):(body=JSON.parse(String(init?.body)),Response.json({id:'tx'}));
  const b=mapBooking(raw,resorts,[]);await persistBooking({...b,transactions:[{id:'stable-payment',segmentId:'s2',type:'Advance received',amount:10000,date:'2026-11-01',method:'Cash',reference:'',note:''}]},b,resorts,[]);
  assert.equal(body.segment,'s2');assert.equal(body.amount,'100.00');assert.equal(body.idempotency_key,'stable-payment');
});
