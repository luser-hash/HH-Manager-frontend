import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleBookings} from './fixtures/bookings.ts';
import {ApiError,mapBooking,type ApiBooking} from '../src/lib/api.ts';
import {canReverse,cashImpact,changeSettlement,reversePayment,settlementState,settlementAmounts,bookingSettlementAmounts} from '../src/lib/settlements.ts';
import type {Transaction} from '../src/lib/types.ts';

const tx:Transaction={id:'original-id',segmentId:'stay-id',type:'Advance received',source:'hill_horizon',amount:200000,date:'2026-10-26',method:'Cash',reference:'TEST',note:'Original receipt'};

test('50 percent customer advance is separate from the resort transfer and remaining guest payment',()=>{
  // Guest total 10,000, HH receipt 5,000, margin 2,000, supplier cost 8,000.
  assert.deepEqual(settlementAmounts({guest_balance_at_resort:'5000.00',resort_transfer_due:'3000.00',resort_receivable:'0.00'}),{guestBalance:500000,sendNow:300000,receiveNow:0});
});
test('resort collections do not require a separate guest checkout confirmation',()=>{
  assert.deepEqual(settlementAmounts({guest_balance_at_resort:'5000.00',resort_receivable:'6000.00'}),{guestBalance:500000,sendNow:0,receiveNow:600000});
  assert.deepEqual(settlementAmounts({guest_balance_at_resort:'3000.00',resort_receivable:'6000.00'}),{guestBalance:300000,sendNow:0,receiveNow:600000});
  assert.deepEqual(settlementAmounts({guest_balance_at_resort:'0.00',resort_receivable:'6000.00'}),{guestBalance:0,sendNow:0,receiveNow:600000});
});
test('a guest payment received by HH can eliminate the projected resort collection',()=>{
  const before=settlementAmounts({guest_balance_at_resort:'5000.00',resort_receivable:'1000.00'});
  assert.equal(before.receiveNow,100000);
  // After HH receives the remaining 5,000, the new server settlement is 4,000 to send.
  const after=settlementAmounts({guest_balance_at_resort:'0.00',resort_receivable:'0.00',resort_transfer_due:'4000.00'});
  assert.equal(after.sendNow,400000);assert.equal(after.receiveNow,0);
});
test('balances for different stays are classified before aggregation and never offset',()=>{
  const b={...booking(),record:{segments:[{financial_summary:{guest_balance_at_resort:'1000.00',resort_receivable:'0.00',resort_transfer_due:'500.00'}},{financial_summary:{guest_balance_at_resort:'0.00',resort_receivable:'1000.00',resort_transfer_due:'0.00'}}]} as unknown as ApiBooking};
  assert.deepEqual(bookingSettlementAmounts(b),{guestBalance:100000,sendNow:50000,receiveNow:100000});
});
const booking=()=>({...sampleBookings()[0],apiId:'booking-uuid',version:7,serverSummary:{guest_total:'6000.00',net_guest_money_received:'2000.00'},transactions:[tx]});

test('reversals preserve their source, reason and bidirectional links without mixing direct and cash records',()=>{
  const raw:ApiBooking={id:'booking',reference:'HH-TEST',customer:'customer',primary_contact_name:'Guest',primary_contact_phone:'01700000000',status:'inquiry',version:1,guest_count:2,expected_advance:'0.00',internal_notes:'',created_at:'2026-10-26',requested_check_in:null,requested_check_out:null,segments:[]};
  const entry={id:'shared-id',segment:'stay',kind:'guest_receipt',amount:'100.00',payment_date:'2026-10-26',reference:'TEST',note:'Original',reverses:null,method:'cash'};
  const mapped=mapBooking(raw,[],[],[entry,{...entry,id:'cash-reversal',reverses:'shared-id',note:'Wrong receipt'}],[{...entry,kind:'receipt'},{...entry,id:'direct-reversal',kind:'receipt',reverses:'shared-id',note:'Wrong resort receipt'}]);
  assert.equal(mapped.transactions[0].reversedBy,'cash-reversal');assert.equal(mapped.transactions[2].reversedBy,'direct-reversal');
  assert.equal(mapped.transactions[1].amount,-10000);assert.equal(mapped.transactions[1].note,'Wrong receipt');
  assert.equal(mapped.transactions[3].source,'resort');assert.equal(mapped.transactions[3].reverses,'shared-id');
});
test('cash reversal calls the correction endpoint with a stable key and reason',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let sent:Record<string,unknown>={};let path='';
  globalThis.fetch=async(input,init)=>{if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'test'});path=String(input);sent=JSON.parse(String(init?.body));return Response.json({id:'reversal'});};
  await reversePayment(booking(),tx,'  Wrong amount  ','stable-key');
  assert.equal(path,'/api/v1/transactions/original-id/reverse/');assert.deepEqual(sent,{reason:'Wrong amount',idempotency_key:'stable-key'});
});
test('direct resort reversal uses the booking-scoped endpoint and original entry ID',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let sent:Record<string,unknown>={};let path='';
  globalThis.fetch=async(input,init)=>{if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'test'});path=String(input);sent=JSON.parse(String(init?.body));return Response.json({id:'reversal'});};
  await reversePayment(booking(),{...tx,type:'Guest paid resort',source:'resort'},'Wrong resort record','stable-direct-key');
  assert.equal(path,'/api/v1/bookings/booking-uuid/reverse-resort-payment/');assert.deepEqual(sent,{entry:'original-id',reason:'Wrong resort record',idempotency_key:'stable-direct-key'});
});
test('blank reasons, reversals of reversals, already reversed entries and closed settlements are rejected',async()=>{
  await assert.rejects(()=>reversePayment(booking(),tx,'  ','key'),/reason/);
  await assert.rejects(()=>reversePayment(booking(),tx,'x'.repeat(501),'key'),/reason/);
  assert.equal(canReverse(booking(),{...tx,reverses:'another'}),false);assert.equal(canReverse(booking(),{...tx,reversedBy:'already'}),false);
  const closed={...booking(),record:{closed_at:'2026-10-26T10:00:00Z'} as ApiBooking};
  assert.equal(canReverse(closed,tx),false);
});
test('correction conflicts surface the server error rather than claiming success',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async input=>String(input).endsWith('/csrf/')?Response.json({csrfToken:'test'}):Response.json({detail:'Already corrected by another operator'},{status:409});
  await assert.rejects(()=>reversePayment(booking(),tx,'Wrong amount','key'),(e:unknown)=>e instanceof ApiError&&e.status===409);
});
test('cash direction is inverted for corrections and direct payments stay separate from Hill Horizon cash',()=>{
  assert.equal(cashImpact(tx),200000);assert.equal(cashImpact({...tx,amount:-200000,reverses:'original'}),-200000);
  assert.equal(cashImpact({...tx,type:'Referrer payout'}),-200000);assert.equal(cashImpact({...tx,type:'Referrer payout',amount:-200000}),200000);
  assert.equal(cashImpact({...tx,type:'Guest paid resort',source:'resort'}),null);
});
test('settlement eligibility uses backend blockers and does not hide referrer recovery or allow closing with unknown balances',()=>{
  const b={...booking(),status:'Cancelled' as const,serverSummary:{referrer_refund_due:'500.00'}};
  assert.equal(settlementState(b).can_close,false);assert.equal(settlementState(b).outstanding.referrer_refund_due,'500.00');
  assert.equal(settlementState({...b,serverSummary:{}}).can_close,true);assert.equal(settlementState({...b,serverSummary:undefined}).can_close,false);
  const state={can_close:false,closed_at:null,outstanding:{guest_refund_due:'100.00'},blocking_reasons:['Outstanding customer refund']};
  assert.deepEqual(settlementState({...b,record:{id:'booking',reference:'HH-TEST',customer:'customer',primary_contact_name:'Guest',primary_contact_phone:'01700000000',status:'cancelled',version:7,guest_count:2,expected_advance:'0.00',internal_notes:'',created_at:'2026-10-26',requested_check_in:null,requested_check_out:null,segments:[],settlement:state}}),state);
});
test('close and reopen use optimistic versions and reopening requires a reason',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const sent:{path:string;body:unknown}[]=[];
  globalThis.fetch=async(input,init)=>{if(String(input).endsWith('/csrf/'))return Response.json({csrfToken:'test'});sent.push({path:String(input),body:JSON.parse(String(init?.body))});return Response.json({id:'saved'});};
  const b={...booking(),status:'Cancelled' as const,serverSummary:{}};
  await changeSettlement(b,false,'Reconciled');await assert.rejects(()=>changeSettlement(b,true,'  '),/reason/);await changeSettlement(b,true,'Correct fee');
  assert.deepEqual(sent,[{path:'/api/v1/bookings/booking-uuid/close/',body:{version:7,reason:'Reconciled'}},{path:'/api/v1/bookings/booking-uuid/reopen/',body:{version:7,reason:'Correct fee'}}]);
});

test('guest checkout balance alone does not block closing a completed settlement',()=>{
  const b={...booking(),status:'Completed' as const,serverSummary:{guest_balance_at_resort:'4000.00',resort_transfer_due:'0.00',resort_receivable:'0.00'}};
  assert.equal(settlementState(b).can_close,true);
  assert.equal(settlementState({...b,status:'Cancelled'}).can_close,false);
});
