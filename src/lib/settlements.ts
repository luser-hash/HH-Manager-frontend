import type {Booking, Transaction, TransactionType} from './types.ts';
import {cents, request} from './api.ts';

export interface SettlementState {can_close:boolean;closed_at:string|null;outstanding:Record<string,string>;blocking_reasons:string[]}
export function settlementAmounts(totals:Record<string,string>) {
  const guestBalance=Math.max(cents(totals.guest_balance_at_resort),0);
  return {
    guestBalance,
    sendNow:Math.max(cents(totals.resort_transfer_due),0),
    receiveNow:Math.max(cents(totals.resort_receivable),0),
  };
}
export function bookingSettlementAmounts(booking:Booking) {
  const rows=booking.record?.segments.length?booking.record.segments.map(s=>s.financial_summary||{}):[booking.serverSummary||{}];
  return rows.reduce((sum,row)=>{const amounts=settlementAmounts(row);return {guestBalance:sum.guestBalance+amounts.guestBalance,sendNow:sum.sendNow+amounts.sendNow,receiveNow:sum.receiveNow+amounts.receiveNow};},{guestBalance:0,sendNow:0,receiveNow:0});
}
export const balanceLabels = {
  guest_refund_due:'Guest refund due',resort_transfer_due:'Resort transfer due',
  resort_receivable:'Resort receivable',referrer_due:'Referrer payout due',referrer_refund_due:'Referrer recovery due',
} as const;
export function settlementState(booking:Booking):SettlementState {
  if(booking.record?.settlement)return booking.record.settlement;
  const outstanding=Object.fromEntries(Object.keys(balanceLabels).filter(k=>cents(booking.serverSummary?.[k])>0).map(k=>[k,booking.serverSummary![k]]));
  const reasons=Object.entries(outstanding).map(([key,value])=>`${balanceLabels[key as keyof typeof balanceLabels]}: ${value} BDT.`);
  const cancellationDue=booking.record?.segments.length?booking.record.segments.filter(s=>s.is_cancelled||booking.status==='Cancelled').reduce((sum,s)=>sum+cents(s.financial_summary?.guest_balance_at_resort),0):booking.status==='Cancelled'?cents(booking.serverSummary?.guest_balance_at_resort):0;
  if(cancellationDue>0){outstanding.guest_balance_at_resort=(cancellationDue/100).toFixed(2);reasons.push(`Guest cancellation charge outstanding: ${(cancellationDue/100).toFixed(2)} BDT.`);}
  if(!booking.serverSummary)reasons.push('Refresh settlement balances before closing.');
  if(!['Completed','Cancelled'].includes(booking.status))reasons.unshift('Complete or cancel the booking before closing its settlement.');
  if(booking.record?.closed_at)reasons.unshift('Settlement is closed. Reopen it before making corrections or posting payments.');
  return {can_close:!reasons.length,closed_at:booking.record?.closed_at || null,outstanding,blocking_reasons:reasons};
}
export const isExternal = (tx:Transaction) => tx.source === 'resort' || ['Guest paid resort','Resort refunded guest'].includes(tx.type);
export function cashImpact(tx:Transaction):number|null {
  if(isExternal(tx))return null;
  return tx.amount * (['Resort transfer','Customer refund','Referrer payout','Payment fee'].includes(tx.type)?-1:1);
}
export function canReverse(booking:Booking,tx:Transaction) {return !booking.record?.closed_at && !tx.reverses && !tx.reversedBy && tx.amount>0;}
export async function reversePayment(booking:Booking,tx:Transaction,reason:string,idempotencyKey:string) {
  if(!canReverse(booking,tx))throw new Error('Reopen the booking and select an unreversed original transaction.');
  reason=reason.trim();if(!reason || reason.length>500)throw new Error('Enter a reversal reason of 1–500 characters.');
  const external=isExternal(tx);
  return request(external?`/api/v1/bookings/${booking.apiId}/reverse-resort-payment/`:`/api/v1/transactions/${tx.id}/reverse/`,'POST',{...(external?{entry:tx.id}:{}),reason,idempotency_key:idempotencyKey});
}
export async function changeSettlement(booking:Booking,reopen:boolean,reason:string) {
  reason=reason.trim();
  if(reopen && !reason)throw new Error('Enter the reason for reopening this settlement.');
  if(!reopen && !settlementState(booking).can_close)throw new Error('Resolve outstanding balances and complete or cancel the booking before closing.');
  return request(`/api/v1/bookings/${booking.apiId}/${reopen?'reopen':'close'}/`,'POST',{version:booking.version,reason});
}
export const balanceActions:{key:string;label:string;type:TransactionType}[] = [
  {key:'guest_refund_due_from_hill_horizon',label:'Guest refund from Hill Horizon',type:'Customer refund'},
  {key:'guest_refund_due_from_resort',label:'Guest refund from resort',type:'Resort refunded guest'},
  {key:'resort_transfer_due',label:'Transfer to resort',type:'Resort transfer'},
  {key:'resort_receivable',label:'Receive from resort',type:'Commission received'},
  {key:'referrer_due',label:'Referrer payout due',type:'Referrer payout'},
  {key:'referrer_refund_due',label:'Recover from referrer',type:'Referrer refund'},
];
