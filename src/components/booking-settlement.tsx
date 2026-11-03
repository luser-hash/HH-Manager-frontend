'use client';
import {useRef,useState,type FormEvent} from 'react';
import type {Booking,PaymentIntent,Transaction} from '@/lib/types';
import {cents} from '@/lib/api';
import {formatMoney,shortDate} from '@/lib/booking';
import {settlementAmounts,bookingSettlementAmounts,canReverse,changeSettlement,isExternal,reversePayment,settlementState} from '@/lib/settlements';
import {cashPosition} from '@/lib/cash-position';
import {Button,Tag} from './ui';
import {useWorkspace} from './workspace';

export function SettlementPanel({booking,onPay}:{booking:Booking;onPay:(intent?:PaymentIntent)=>void}) {
  const {user,mutate,saving,notify}=useWorkspace();
  const state=settlementState(booking),closed=!!state.closed_at;
  const [form,setForm]=useState<{reopen:boolean;version:number|undefined}|null>(null),[reason,setReason]=useState(''),[error,setError]=useState('');
  const lock=useRef(false);
  const canPost=!!user?.permissions.includes('finance.post_transaction')&&!closed;
  const canClose=!!user?.permissions.includes('bookings.close_booking');
  async function submit(event:FormEvent) {
    event.preventDefault();if(!form||lock.current)return;setError('');lock.current=true;
    try {if(form.version!==booking.version)throw new Error('The booking changed. Close this form and review the updated balances before continuing.');await mutate(()=>changeSettlement(booking,form.reopen,reason));notify(form.reopen?'Settlement reopened. Corrections and payments are available.':'Settlement closed. Payments and booking history are preserved.');setForm(null);setReason('');}
    catch(e){setError(e instanceof Error?e.message:'Could not update settlement.');}finally{lock.current=false;}
  }
  const stays=booking.record?.segments||[];
  const cash=cashPosition([booking]);
  return <>
    <section className="section-card"><div className="settlement-heading"><h3>Payments & settlement</h3><Tag>{closed?'Closed':state.can_close?'Ready to close':'Open'}</Tag></div><p>Track the advance you received, what you pay the resort, and what the resort pays you.</p></section>
    <section className="section-card"><h3>Your booking cash</h3><dl className="settlement-figures"><div><dt>Cash in hand now</dt><dd>{formatMoney(cash.cashInHand)}</dd></div><div><dt>Pending earnings held</dt><dd>{formatMoney(cash.pendingEarningsHeld)}</dd></div><div><dt>Reserved for payments / refunds</dt><dd>{formatMoney(cash.reservedForPayments)}</dd></div></dl><p className="editor-help">{['Completed','Cancelled'].includes(booking.status)?'Earnings are recognized. Recording further payments updates cash in hand.':'Your share is already included in cash in hand. It becomes earnings automatically on the final checkout date; completion does not add cash a second time.'}</p></section>
    {stays.map((stay,index)=>{
      const totals=stay.financial_summary;
      if(!totals)return <section className="section-card" key={stay.id}><h3>{stay.resort_name_snapshot}</h3><p>Refresh this booking to load settlement balances.</p></section>;
      const amounts=settlementAmounts(totals);
      const receiveType=cents(totals.net_resort_transfers)>0?'Resort refund':'Commission received';
      const payment=(label:string,type:PaymentIntent['type'],amount?:number)=><Button secondary disabled={saving} onClick={()=>onPay({segmentId:stay.id,type,amount})}>{label}</Button>;
      return <section className="section-card clear-settlement" key={stay.id}>
        <div className="settlement-heading"><h3>{stays.length>1?`Stay ${index+1} · `:''}{stay.resort_name_snapshot}</h3>{stay.is_cancelled&&<Tag>Cancelled</Tag>}</div><p>{shortDate(stay.check_in)}–{shortDate(stay.check_out)}</p>
        <div className="settlement-section"><h4>1. Guest advance</h4><dl className="settlement-figures"><div><dt>Guest total</dt><dd>{formatMoney(cents(totals.guest_total))}</dd></div><div><dt>Advance received by Hill Horizon</dt><dd>{formatMoney(cents(totals.net_guest_money_received))}</dd></div><div><dt>{stay.is_cancelled?'Cancellation charge remaining':'Pay at resort checkout'}</dt><dd>{formatMoney(amounts.guestBalance)}</dd></div></dl>
          <p className="editor-help">{stay.is_cancelled?'Track the agreed cancellation charges and any refunds below.':'The guest pays the remaining balance to the resort at checkout. No payment confirmation is needed from you.'}</p>
          {canPost&&amounts.guestBalance>0&&<div className="actions">{payment(stay.is_cancelled?'Record cancellation payment':'Record advance','Advance received')}</div>}
          {cents(totals.guest_paid_direct_to_resort)>0&&<details className="booking-more"><summary>Previously recorded guest–resort payments</summary><p>{formatMoney(cents(totals.guest_paid_direct_to_resort))} was recorded directly at the resort. Original records remain in payment history.</p></details>}
          {(['guest_refund_due_from_hill_horizon','guest_refund_due_from_resort'] as const).map(key=>{const amount=cents(totals[key]);if(amount<=0)return null;return <div className="settlement-next" key={key}><div><strong>{key==='guest_refund_due_from_hill_horizon'?'Return to guest from Hill Horizon':'Resort must refund guest'}</strong><b>{formatMoney(amount)}</b></div>{canPost&&<div className="actions">{payment('Record guest refund',key==='guest_refund_due_from_hill_horizon'?'Customer refund':'Resort refunded guest',amount)}</div>}</div>;})}
        </div>
        <div className="settlement-section"><h4>2. Resort settlement</h4><dl className="settlement-figures"><div><dt>Agreed resort amount</dt><dd>{formatMoney(cents(totals.resort_entitlement))}</dd></div><div><dt>Sent to resort, net</dt><dd>{formatMoney(cents(totals.net_resort_transfers))}</dd></div><div><dt>Received from resort</dt><dd>{formatMoney(cents(totals.separate_commission_received))}</dd></div></dl>
          {amounts.sendNow>0&&<div className="settlement-next"><div><strong>Send to resort from Hill Horizon</strong><b>{formatMoney(amounts.sendNow)}</b></div><p>Record the amount actually transferred to the resort.</p>{canPost&&<div className="actions">{payment('Record money sent','Resort transfer',amounts.sendNow)}</div>}</div>}
          {amounts.receiveNow>0&&<div className="settlement-next"><div><strong>Receive from resort</strong><b>{formatMoney(amounts.receiveNow)}</b></div>{canPost&&<div className="actions">{payment('Record money received',receiveType,amounts.receiveNow)}</div>}</div>}
          {!amounts.sendNow&&!amounts.receiveNow&&<p className="settlement-done">✓ Payments between Hill Horizon and the resort are settled.</p>}

        </div>
        {!!(stay.referrer_name||cents(totals.referrer_due)||cents(totals.referrer_refund_due))&&<div className="settlement-section"><h4>3. Referrer</h4><p>{stay.referrer_name||'Referrer'} · Agreed share {formatMoney(cents(totals.referral_share))}</p>{cents(totals.referrer_due)>0?<div className="settlement-next"><div><strong>Pay referrer</strong><b>{formatMoney(cents(totals.referrer_due))}</b></div>{canPost&&<div className="actions">{payment('Record referrer payment','Referrer payout',cents(totals.referrer_due))}</div>}</div>:cents(totals.referrer_refund_due)>0?<div className="settlement-next"><div><strong>Receive back from referrer</strong><b>{formatMoney(cents(totals.referrer_refund_due))}</b></div>{canPost&&<div className="actions">{payment('Record money received','Referrer refund',cents(totals.referrer_refund_due))}</div>}</div>:<p className="settlement-done">✓ Referrer settled</p>}</div>}
        <details className="booking-more"><summary>Margin & fees</summary><dl className="detail-grid"><div><dt>Hill Horizon margin before referrer & fees</dt><dd>{formatMoney(cents(totals.commission_available_for_retention))}</dd></div><div><dt>Margin after referrer & fees</dt><dd>{formatMoney(cents(totals.earnings_after_payment_fees))}</dd></div><div><dt>Payment fees recorded</dt><dd>{formatMoney(cents(totals.payment_fees))}</dd></div></dl></details>
      </section>;
    })}
    <section className="section-card"><div className="settlement-heading"><h3>Finish settlement</h3><Tag>{closed?'Closed':state.can_close?'Ready':'Pending'}</Tag></div>
      {closed?<p>Closed on {new Date(state.closed_at!).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})} · Dhaka time.</p>:state.can_close?<p>All balances are clear. You can close this settlement.</p>:<><p>Clear payments with the resort, any refunds and referrer balances, then complete or cancel the booking. Guest checkout payments do not need your confirmation.</p><details className="booking-more"><summary>What is still pending?</summary><ul>{state.blocking_reasons.map((r,i)=><li key={i}>{r}</li>)}</ul></details></>}
      {canClose&&!form&&<Button secondary disabled={saving||!closed&&!state.can_close} onClick={()=>{setError('');setReason('');setForm({reopen:closed,version:booking.version});}}>{closed?'Reopen settlement':'Close settlement'}</Button>}
      {form&&<form className="settlement-action" onSubmit={submit}><label className="field">{form.reopen?'Reason for reopening':'Closing note (optional)'}<textarea rows={2} maxLength={1000} required={form.reopen} value={reason} disabled={saving} onChange={e=>setReason(e.target.value)}/></label><div className="actions"><Button secondary disabled={saving} onClick={()=>setForm(null)}>Cancel</Button><Button disabled={saving||form.reopen&&!reason.trim()} type="submit">{saving?'Saving…':form.reopen?'Confirm reopen':'Confirm close'}</Button></div></form>}
      {error&&<p className="error" role="alert">{error}</p>}
    </section>
  </>;

}

export function BookingPayments({booking,onPay}:{booking:Booking;onPay:(intent?:PaymentIntent)=>void}) {
  const {user,saving}=useWorkspace();
  const [target,setTarget]=useState<string|null>(null);
  const canCorrect=!!user?.permissions.includes('finance.reverse_transaction');
  return <><SettlementPanel booking={booking} onPay={onPay}/><details className="section-card booking-more"><summary>Payment history & corrections ({booking.transactions.length})</summary><div className="settlement-heading"><h3>Recorded payments</h3>{user?.permissions.includes('finance.post_transaction')&&<Button secondary disabled={!!booking.record?.closed_at} onClick={()=>onPay()}>Record payment</Button>}</div><p className="hint">Reverse an incorrect record with a reason, then post the correct transaction if needed. Original records remain in the history. Use refunds to return actual money owed.</p>
    {booking.transactions.map(tx=>{
      const source=isExternal(tx)?'resort':'hill_horizon',key=source+'-'+tx.id;
      const stayIndex=booking.record?.segments.findIndex(s=>s.id===tx.segmentId)??-1,stay=booking.record?.segments[stayIndex];
      return <article className="payment-record" id={'payment-'+key} key={key}><div className="settlement-heading"><div><strong>{tx.type}</strong> {tx.reverses?<Tag>Reversal</Tag>:tx.reversedBy?<Tag>Reversed</Tag>:<Tag>Posted</Tag>}</div><strong className="money">{formatMoney(tx.amount)}</strong></div><p>{stay&&`Stay ${stayIndex+1} · ${stay.resort_name_snapshot} · `}{shortDate(tx.date)} · {tx.method}<br/>{tx.reference||'No transaction reference'} · {isExternal(tx)?'Direct guest–resort record':'Hill Horizon cash'}</p>{tx.note&&<p className="customer-note"><strong>{tx.reverses?'Reversal reason: ': 'Note: '}</strong>{tx.note}</p>}
        {tx.reverses&&<a className="link-btn" href={'#payment-'+source+'-'+tx.reverses}>View original record</a>}{tx.reversedBy&&<a className="link-btn" href={'#payment-'+source+'-'+tx.reversedBy}>View linked reversal</a>}
        {target===key?<ReversalForm key={key} booking={booking} transaction={tx} onClose={()=>setTarget(null)}/>:canCorrect&&canReverse(booking,tx)&&<div className="actions"><Button secondary disabled={saving} onClick={()=>setTarget(key)}>Reverse transaction</Button></div>}
      </article>;
    })}
    {!booking.transactions.length&&<p>No payments recorded yet.</p>}
  </details></>;
}

function ReversalForm({booking,transaction,onClose}:{booking:Booking;transaction:Transaction;onClose:()=>void}) {
  const {mutate,saving,notify}=useWorkspace();
  const [reason,setReason]=useState(''),[error,setError]=useState('');
  const [key]=useState(()=>crypto.randomUUID());const lock=useRef(false);
  async function submit(event:FormEvent) {
    event.preventDefault();if(lock.current)return;lock.current=true;setError('');
    try {await mutate(()=>reversePayment(booking,transaction,reason,key));notify('Transaction reversed. Balances and correction history updated.');onClose();}
    catch(e){setError(e instanceof Error?e.message:'Could not reverse transaction.');}finally{lock.current=false;}
  }
  return <form className="settlement-action" onSubmit={submit}><p>Reverse {transaction.type.toLowerCase()} of <strong>{formatMoney(transaction.amount)}</strong>? This records a correction; it does not send or refund money.</p><label className="field">Reason for reversal<textarea rows={2} required maxLength={500} disabled={saving} value={reason} onChange={e=>setReason(e.target.value)}/></label>{error&&<p className="error" role="alert">{error}</p>}<div className="actions"><Button secondary disabled={saving} onClick={onClose}>Cancel correction</Button><Button disabled={saving||!reason.trim()||!canReverse(booking,transaction)} type="submit">{saving?'Saving…':'Post reversal'}</Button></div></form>;
}

export function SettlementQueue({bookings,onOpen}:{bookings:Booking[];onOpen:(id:string)=>void}) {
  const [filter,setFilter]=useState('open');
  const rows=bookings.filter(b=>{const s=settlementState(b);if(filter==='all')return true;if(filter==='closed')return !!s.closed_at;if(filter==='ready')return s.can_close;return !s.closed_at;});
  return <section className="card" style={{marginBottom:24}}><div className="card-header"><div><h2>Booking settlements</h2><p>Track advances and money paid to or received from each resort.</p></div><select className="filter" aria-label="Settlement filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="open">Open settlements</option><option value="ready">Ready to close</option><option value="closed">Closed</option><option value="all">All bookings</option></select></div><div className="table-wrap"><table><thead><tr><th>Booking / guest</th><th>Guest checkout balance / refund</th><th>Referrer</th><th>Resort payments</th><th>Settlement</th><th/></tr></thead><tbody>{rows.map(b=>{const totals=b.serverSummary||{},s=settlementState(b),amounts=bookingSettlementAmounts(b);return <tr key={b.id}><td><strong>{b.id}</strong><small>{b.name}</small></td><td><strong>{formatMoney(amounts.guestBalance)} at resort checkout</strong>{cents(totals.guest_refund_due)>0&&<small>{formatMoney(cents(totals.guest_refund_due))} to refund</small>}</td><td><strong>{formatMoney(cents(totals.referrer_due))} payout</strong><small>{formatMoney(cents(totals.referrer_refund_due))} recovery</small></td><td><strong>{formatMoney(amounts.sendNow)} to send</strong><small>{formatMoney(amounts.receiveNow)} to receive</small></td><td><Tag>{s.closed_at?'Closed':s.can_close?'Ready to close':'Open'}</Tag></td><td><Button secondary onClick={()=>onOpen(b.id)}>Review settlement</Button></td></tr>;})}</tbody></table></div>{!rows.length&&<div className="empty">No bookings match this settlement filter.</div>}</section>;
}
