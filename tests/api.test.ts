import {test} from 'node:test';
import assert from 'node:assert/strict';
import {all,ApiError,cents,loadCatalog,loadCustomerBookings,loadCustomerPayments,loadResortDirectory,mapBooking,persistBooking,segmentPayload,type ApiBooking,type Resort} from '../src/lib/api.ts';
import {sampleBookings} from './fixtures/bookings.ts';
import {summary} from '../src/lib/booking.ts';
const resorts:Resort[]=[{id:'resort-id',name:'De Jure Resort',is_archived:false,rooms:[{id:'room-id',name:'Premium Batighor',max_occupancy:4}]}];
test('new bookings send customer details atomically instead of posting a separate customer',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const paths:string[]=[];let sent:Record<string,unknown>={};
  globalThis.fetch=async (input,init)=>{
    if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'test-token'});
    paths.push(String(input));sent=JSON.parse(String(init?.body));return Response.json({reference:'HH-CREATED'});
  };
  const b={...sampleBookings()[0],createKey:'stable-create-key',customerDetails:{email:'guest@example.com',whatsapp:'01700000000',acquisition_source:'Facebook'}};
  assert.equal(await persistBooking(b,undefined,resorts,[]),'HH-CREATED');
  assert.deepEqual(paths,['/api/v1/bookings/']);
  assert.deepEqual(sent.customer_data,{full_name:b.name,phone_original:b.phone,...b.customerDetails});
  assert.equal(sent.idempotency_key,'stable-create-key');assert.equal(sent.customer,undefined);
});
test('explicit customer selection preserves the customer UUID on a new booking',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let sent:Record<string,unknown>={};
  globalThis.fetch=async (input,init)=>String(input).endsWith('/csrf/')?Response.json({csrfToken:'test-token'}):(sent=JSON.parse(String(init?.body)),Response.json({reference:'HH-SELECTED'}));
  await persistBooking({...sampleBookings()[0],customerId:'selected-customer'},undefined,resorts,[]);
  assert.equal(sent.customer,'selected-customer');assert.equal(sent.customer_data,undefined);
});
test('customer history loads both history endpoints by customer UUID',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const paths:string[]=[];
  globalThis.fetch=async input=>{paths.push(String(input));return Response.json({results:[],next:null});};
  await loadCustomerBookings('customer-uuid');await loadCustomerPayments('customer-uuid');
  assert.deepEqual(paths,['/api/v1/customers/customer-uuid/bookings/','/api/v1/customers/customer-uuid/payments/']);
});
test('directory retains archived references while new-booking choices exclude them and their rooms',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const resortRows=[{id:'active',name:'Active resort',is_archived:false},{id:'archived',name:'Archived resort',is_archived:true}];
  const roomRows=[{id:'available',resort:'active',name:'Available',max_occupancy:2,is_archived:false},{id:'old',resort:'active',name:'Old room',max_occupancy:2,is_archived:true},{id:'hidden',resort:'archived',name:'Hidden by resort',max_occupancy:2,is_archived:false}];
  globalThis.fetch=async input=>Response.json({results:String(input).includes('/resorts/')?resortRows:String(input).includes('/rooms/')?roomRows:[],next:null});
  const directory=await loadResortDirectory();
  assert.equal(directory.resorts.length,2);assert.equal(directory.rooms.length,3);
  const catalog=await loadCatalog();
  assert.deepEqual(catalog.resorts.map(r=>r.id),['active']);
  assert.deepEqual(catalog.resorts[0].rooms.map(r=>r.id),['available']);
});
const raw:ApiBooking={id:'booking-id',reference:'HH-REAL',customer:'customer-id',primary_contact_name:'Guest',primary_contact_phone:'01000000000',status:'inquiry',version:3,guest_count:2,expected_advance:'2000.00',internal_notes:'',created_at:'2026-10-26',requested_check_in:null,requested_check_out:null,financial_summary:{guest_total:'6000.00',your_earnings:'500.00',net_cash_held:'500.00'},segments:[{id:'stay-id',resort:'resort-id',resort_name_snapshot:'De Jure Resort',check_in:'2026-10-26',check_out:'2026-10-27',guest_count:2,referrer_name:'Referrer',referral_share:'500.00',is_cancelled:false,cancellation_reason:'',guest_charge_on_cancellation:'0',supplier_charge_on_cancellation:'0',referral_share_on_cancellation:'0',availability:{state:'held',responded_by:'Reservation desk',responded_at:'2026-10-25T09:00:00Z',hold_expires_at:'2026-10-27T12:00:00Z',reference:'HOLD-1'},items:[{id:'item-id',item_type:'room',room_category:'room-id',description_snapshot:'Premium Batighor',quantity:1,price_basis:'unit',public_unit_price:'6500.00',hill_horizon_funded_discount:'500.00',resort_funded_discount:'0.00',agreed_commission:'1500.00'}]}]};
test('API mapping preserves UUIDs, Dhaka availability and authoritative financial totals',()=>{
  const b=mapBooking(raw,resorts,[]);
  assert.equal(b.id,'HH-REAL');assert.equal(b.apiId,'booking-id');assert.equal(b.segmentId,'stay-id');assert.equal(b.version,3);
  assert.equal(b.availability,'Held');assert.equal(b.checkedAt,'2026-10-25T15:00');assert.equal(b.confirmationReference,'HOLD-1');
  assert.equal(summary(b).earnings,50000);assert.equal(summary(b).guestTotal,600000);assert.equal(b.complex,false);
});
test('reversals stay negative and multi-stay bookings cannot be overwritten',async()=>{
  const b=mapBooking({...raw,segments:[...raw.segments,...raw.segments]},resorts,[],[{id:'reversal',segment:'stay-id',kind:'guest_receipt',amount:'1000.00',payment_date:'2026-10-26',reference:'',note:'',reverses:'original',method:'bkash'}]);
  assert.equal(b.transactions[0].amount,-100000);assert.equal(b.complex,true);
  await assert.rejects(()=>persistBooking(b,b,resorts,[]),/multiple stays/);
});
test('booking payload uses database IDs, decimal strings and explicit price basis',()=>{
  const b=sampleBookings()[0];const payload=segmentPayload(b,resorts);
  assert.equal(payload.resort,'resort-id');assert.equal(payload.items[0].room_category,'room-id');assert.equal(payload.items[0].public_unit_price,'13000.00');assert.equal(payload.items[0].price_basis,'unit');
  assert.throws(()=>segmentPayload({...b,resort:'Unknown'},resorts));
  assert.equal(cents('-123.45'),-12345);
});
test('pagination follows all backend pages through the same-origin proxy',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const paths:string[]=[];
  globalThis.fetch=async input=>{paths.push(String(input));return Response.json(paths.length===1?{results:[1],next:'http://127.0.0.1:8000/api/v1/bookings/?page=2'}:{results:[2],next:null});};
  assert.deepEqual(await all('/api/v1/bookings/'),[1,2]);assert.deepEqual(paths,['/api/v1/bookings/','/api/v1/bookings/?page=2']);
});
test('a stale booking mutation surfaces the Django conflict instead of claiming success',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async input=>String(input).endsWith('/csrf/')?Response.json({csrfToken:'test-token'}):Response.json({detail:'Booking has changed. Refresh and retry.'},{status:409});
  const b=mapBooking(raw,resorts,[]);
  await assert.rejects(()=>persistBooking({...b,notes:'Changed'},b,resorts,[]),(e:unknown)=>e instanceof ApiError&&e.status===409);
});
test('payment posting uses its UUID as an idempotency key and correct API kind',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let sent:Record<string,unknown>={};
  globalThis.fetch=async (input,init)=>{if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'test-token'});sent=JSON.parse(String(init?.body));assert.equal(input,'/api/v1/transactions/');return Response.json({id:'saved'});};
  const b=mapBooking(raw,resorts,[]);const tx={id:'stable-uuid',type:'Advance received' as const,amount:200000,date:'2026-10-26',method:'bKash',reference:'TX1',note:''};
  await persistBooking({...b,transactions:[tx]},b,resorts,[]);
  assert.equal(sent.idempotency_key,'stable-uuid');assert.equal(sent.segment,'stay-id');assert.equal(sent.kind,'guest_receipt');assert.equal(sent.amount,'2000.00');assert.equal(sent.method,'bkash');
});
