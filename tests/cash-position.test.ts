import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cashPosition} from '../src/lib/cash-position.ts';
import {sampleBookings} from './fixtures/bookings.ts';

const pending=()=>({...sampleBookings()[0],status:'Confirmed' as const,serverSummary:{net_cash_held:'1400.00',net_guest_money_received:'3000.00',net_resort_transfers:'1600.00',your_earnings:'1400.00',resort_transfer_due:'0.00'}});
test('3000 advance less 1600 transfer is 1400 cash already held before completion',()=>{
  assert.deepEqual(cashPosition([pending()]),{cashInHand:140000,pendingEarningsHeld:140000,earnedCashHeld:0,reservedForPayments:0});
  assert.deepEqual(cashPosition([{...pending(),status:'Completed'}]),{cashInHand:140000,pendingEarningsHeld:0,earnedCashHeld:140000,reservedForPayments:0});
});
test('unpaid resort share stays reserved instead of being presented as pending earnings',()=>{
  const b=pending();
  assert.deepEqual(cashPosition([{...b,serverSummary:{...b.serverSummary,net_cash_held:'3000.00',net_resort_transfers:'0.00',resort_transfer_due:'1600.00'}}]),{cashInHand:300000,pendingEarningsHeld:140000,earnedCashHeld:0,reservedForPayments:160000});
});
test('referrer dues, fees and guest refunds reduce the share actually held',()=>{
  const b=pending();
  assert.equal(cashPosition([{...b,serverSummary:{...b.serverSummary,your_earnings:'900.00',referrer_due:'500.00'}}]).pendingEarningsHeld,90000);
  assert.equal(cashPosition([{...b,serverSummary:{...b.serverSummary,net_cash_held:'1300.00',payment_fees:'100.00'}}]).pendingEarningsHeld,130000);
  assert.equal(cashPosition([{...b,serverSummary:{...b.serverSummary,guest_refund_due_from_hill_horizon:'1400.00'}}]).pendingEarningsHeld,0);
  assert.equal(cashPosition([{...b,serverSummary:{...b.serverSummary,net_cash_held:'0.00'}}]).pendingEarningsHeld,0);
});
