import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleBookings} from './fixtures/bookings.ts';
import type {ApiBooking} from '../src/lib/api.ts';
import {acknowledgeBookingPolicy,canRecordDelivery,dhakaTimestamp,downloadDocument,issueBookingDocument,issueProblem,receiptTransactions,recordDocumentDelivery,updateBookingPolicy,type BookingDocument} from '../src/lib/documents.ts';
import type {Booking,Transaction} from '../src/lib/types.ts';
const receipt:Transaction={id:'payment-id',segmentId:'stay-id',type:'Advance received',source:'hill_horizon',amount:100000,date:'2026-10-01',method:'Cash',reference:'REF',note:''};
const doc:BookingDocument={id:'document-id',reference:'HH-DOC-TEST',kind:'receipt',booking_version:7,created_at:'2026-10-01T10:00:00+06:00',is_stale:false,is_void:false,void_reason:'',source_transaction:'payment-id',source_reversed:false,valid_until:null,deliveries:[]};
function booking():Booking {
  const record:ApiBooking={id:'booking-id',reference:'HH-TEST',customer:'customer-id',primary_contact_name:'Guest',primary_contact_phone:'01700000000',status:'inquiry',version:7,guest_count:2,expected_advance:'0.00',internal_notes:'',created_at:'2026-10-01',requested_check_in:null,requested_check_out:null,segments:[{id:'stay-id',resort:'resort-id',resort_name_snapshot:'Resort',check_in:'2026-11-01',check_out:'2026-11-02',guest_count:2,referrer_name:'',referral_share:'0',is_cancelled:false,cancellation_reason:'',guest_charge_on_cancellation:'0',supplier_charge_on_cancellation:'0',referral_share_on_cancellation:'0',items:[{id:'item',room_category:'room',item_type:'room',description_snapshot:'Cottage',quantity:1,price_basis:'unit',public_unit_price:'5000.00',agreed_commission:'500.00',hill_horizon_funded_discount:'0',resort_funded_discount:'0',price_confirmed:true}]}]};
  return {...sampleBookings()[0],apiId:record.id,version:7,status:'Inquiry',record,transactions:[receipt]};
}
test('receipts select only original unreversed Hill Horizon guest receipts and refunds',()=>{
  const b=booking();b.transactions=[receipt,{...receipt,id:'refund',type:'Customer refund'},{...receipt,id:'direct',source:'resort',type:'Guest paid resort'},{...receipt,id:'supplier',type:'Resort transfer'},{...receipt,id:'correction',reverses:'payment-id',amount:-100000},{...receipt,id:'reversed',reversedBy:'correction'}];
  assert.deepEqual(receiptTransactions(b).map(t=>t.id),['payment-id','refund']);
});
test('issue requirements distinguish confirmation, agreed prices, valid quotations and receipt source',()=>{
  const b=booking();assert.match(issueProblem(b,'voucher','',''),/Confirm/);assert.equal(issueProblem(b,'quote','2099-12-31',''),'');
  b.record!.segments[0].items[0].price_confirmed=false;assert.match(issueProblem(b,'quote','2099-12-31',''),/Agree/);
  assert.equal(issueProblem(b,'receipt','','payment-id'),'');assert.match(issueProblem(b,'receipt','','wrong-id'),/Select/);
});
test('receipt issuing preserves source UUID, version and retry key',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let path='',body:unknown;
  globalThis.fetch=async(input,init)=>{if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'test'});path=String(input);body=JSON.parse(String(init?.body));return Response.json(doc);};
  await issueBookingDocument(booking(),'receipt','stable-key','','payment-id');assert.equal(path,'/api/v1/bookings/booking-id/issue-document/');assert.deepEqual(body,{version:7,kind:'receipt',idempotency_key:'stable-key',source_transaction:'payment-id'});
});
test('delivery recording sends a stable key, recipient and explicit Dhaka timestamp',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let path='',body:unknown;
  globalThis.fetch=async(input,init)=>{if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'test'});path=String(input);body=JSON.parse(String(init?.body));return Response.json({id:'delivery-id'});};
  await recordDocumentDelivery(booking(),doc,{channel:'email',recipient:' qa@example.invalid ',sent_at:'2026-10-01T10:30',note:'After phone call'},'delivery-key');
  assert.equal(path,'/api/v1/bookings/booking-id/documents/document-id/mark-sent/');assert.deepEqual(body,{channel:'email',recipient:'qa@example.invalid',sent_at:'2026-10-01T10:30:00+06:00',note:'After phone call',idempotency_key:'delivery-key'});
});
test('stale, void and reversed-source documents cannot acquire new delivery records',()=>{
  assert.equal(canRecordDelivery(doc),true);for(const change of [{is_stale:true},{is_void:true},{source_reversed:true}])assert.equal(canRecordDelivery({...doc,...change}),false);
  assert.throws(()=>recordDocumentDelivery(booking(),{...doc,is_stale:true},{channel:'other',recipient:'Guest',sent_at:'2026-10-01T09:30',note:''},'key'),/current/);
  assert.throws(()=>dhakaTimestamp('9999-12-31T23:59'),/future/);
  assert.throws(()=>recordDocumentDelivery(booking(),doc,{channel:'other',recipient:'Guest',sent_at:'2026-10-01T09:30',note:''},'key'),/earlier than/);
});
test('PDF download requires historical intent and verifies PDF bytes and content type',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let path='';
  globalThis.fetch=async input=>{path=String(input);return new Response('%PDF-1.4\nQA sample',{headers:{'Content-Type':'application/pdf'}});};
  await assert.rejects(()=>downloadDocument(booking(),{...doc,is_stale:true}),/historical/);
  const result=await downloadDocument(booking(),{...doc,is_stale:true},true);assert.equal(path,'/api/v1/bookings/booking-id/documents/document-id/pdf/?historical=true');assert.equal(result.filename,'HH-DOC-TEST.pdf');assert.equal(await result.blob.slice(0,5).text(),'%PDF-');
  globalThis.fetch=async()=>new Response('<html>Not a PDF</html>',{headers:{'Content-Type':'text/html'}});await assert.rejects(()=>downloadDocument(booking(),doc),/did not return a PDF/);
});
test('policy edits and acknowledgements are versioned and retain the selected stay',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const calls:{path:string;body:unknown}[]=[];
  globalThis.fetch=async(input,init)=>{if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'test'});calls.push({path:String(input),body:JSON.parse(String(init?.body))});return Response.json({id:'booking-id'});};
  await updateBookingPolicy(booking(),'stay-id','Agreed terms',' Guest requested ');await acknowledgeBookingPolicy(booking(),'stay-id',' Guest ','2026-10-01T09:30');
  assert.deepEqual(calls,[{path:'/api/v1/bookings/booking-id/policy/',body:{version:7,segment:'stay-id',policy:'Agreed terms',reason:'Guest requested'}},{path:'/api/v1/bookings/booking-id/acknowledge-policy/',body:{version:7,segment:'stay-id',acknowledged_by:'Guest',acknowledged_at:'2026-10-01T09:30:00+06:00'}}]);
});
