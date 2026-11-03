import type { Booking, TransactionType, Transaction } from './types.ts';

// Prototype arithmetic uses integer paisa. Django summaries are authoritative for saved bookings.
export function parseMoney(input: string): number {
  const value = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a positive amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 1_000_000_000) throw new Error('Amount is too large for this form.');
  return result;
}
export const moneyInput = (value: number) => (value / 100).toFixed(2);
export const formatMoney = (value: number) => '৳' + (value / 100).toLocaleString('en-BD', { minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const nights = (b: Pick<Booking, 'checkIn' | 'checkOut'>) => Math.round((Date.parse(b.checkOut + 'T00:00:00Z') - Date.parse(b.checkIn + 'T00:00:00Z')) / 86400000);
export const shortDate = (value: string, long = false) => value ? new Date(value + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'Asia/Dhaka' }) : '—';
export const initials = (name: string) => name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('');

export function summary(b: Booking) {
  if(b.guestSummary) {
    const value=(key:string)=>{const raw=b.guestSummary?.[key]||'0';const [whole,fraction='']=raw.replace('-','').split('.');return (Number(whole)*100+Number(fraction.padEnd(2,'0')))*(raw.startsWith('-')?-1:1);};
    return {publicTotal:value('public_total'),originalGuestTotal:value('public_total')-value('discount_total'),guestTotal:value('guest_total'),advance:value('net_guest_money_received'),direct:value('guest_paid_direct_to_resort'),guestBalance:value('guest_balance_at_resort'),refund:value('guest_refund_due'),retention:0,referral:0,earnings:0,transferred:0,commissionReceived:0,referrerPaid:0,fees:0,refundFromHH:0,refundFromResort:0,resortDue:0,resortReceivable:0,referrerDue:0,referrerRefund:0,held:0,supplierEntitlement:0};
  }
  if (b.serverSummary) {
    const fields = {publicTotal:'public_total',originalGuestTotal:'original_guest_total',guestTotal:'guest_total',retention:'commission_available_for_retention',referral:'referral_share',earnings:'your_earnings',advance:'net_guest_money_received',direct:'guest_paid_direct_to_resort',transferred:'net_resort_transfers',commissionReceived:'separate_commission_received',referrerPaid:'referrer_paid',fees:'payment_fees',guestBalance:'guest_balance_at_resort',refund:'guest_refund_due',refundFromHH:'guest_refund_due_from_hill_horizon',refundFromResort:'guest_refund_due_from_resort',resortDue:'resort_transfer_due',resortReceivable:'resort_receivable',referrerDue:'referrer_due',referrerRefund:'referrer_refund_due',held:'net_cash_held',supplierEntitlement:'resort_entitlement'} as const;
    const result = {} as Record<keyof typeof fields,number>;
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      const value = b.serverSummary[fields[key]] || '0';
      const [whole,fraction=''] = value.replace('-','').split('.');
      result[key] = (Number(whole)*100 + Number(fraction.padEnd(2,'0'))) * (value.startsWith('-') ? -1 : 1);
    }
    return result;
  }
  const sum = (type: TransactionType) => b.transactions.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
  const publicTotal = b.publicUnitPrice * b.quantity * (b.priceBasis === 'night' ? nights(b) : 1);
  const originalGuestTotal = publicTotal - b.ownDiscount - b.resortDiscount;
  const guestTotal = b.cancellation ? b.cancellation.guestCharge : originalGuestTotal;
  const retention = b.cancellation ? b.cancellation.guestCharge - b.cancellation.supplierCharge : b.agreedCommission - b.ownDiscount;
  const referral = b.cancellation ? b.cancellation.referralShare : b.referralShare;
  const advance = sum('Advance received') - sum('Customer refund');
  const direct = sum('Guest paid resort') - sum('Resort refunded guest');
  const transferred = sum('Resort transfer') - sum('Resort refund');
  const commissionReceived = sum('Commission received');
  const referrerPaid = sum('Referrer payout') - sum('Referrer refund');
  const fees = sum('Payment fee');
  const refund = Math.max(advance + direct - guestTotal, 0);
  const position = Math.min(advance, Math.max(guestTotal - direct, 0)) - transferred + commissionReceived - retention;
  return { publicTotal, originalGuestTotal, guestTotal, retention, referral, earnings: retention - referral,
    advance, direct, transferred, commissionReceived, referrerPaid, fees,
    guestBalance: Math.max(guestTotal - advance - direct, 0), refund,
    refundFromHH: Math.min(advance, refund), refundFromResort: Math.max(refund - advance, 0),
    resortDue: Math.max(position, 0), resortReceivable: Math.max(-position, 0),
    referrerDue: Math.max(referral - referrerPaid, 0), referrerRefund: Math.max(referrerPaid - referral, 0),
    held: advance - transferred + commissionReceived - referrerPaid - fees,
    supplierEntitlement: guestTotal - retention,
  };
}

export function validateBooking(b: Booking): void {
  if (!b.name.trim() || !b.phone.trim() || !b.resort || !b.room) throw new Error('Enter the guest, phone, resort and room.');
  if (!Number.isFinite(nights(b)) || nights(b) < 1 || nights(b) > 365) throw new Error('Choose a stay of 1 to 365 nights.');
  if (!Number.isInteger(b.guests) || b.guests < 1 || !Number.isInteger(b.quantity) || b.quantity < 1) throw new Error('Guests and room quantity must be positive whole numbers.');
  for (const n of [b.publicUnitPrice, b.ownDiscount, b.resortDiscount, b.agreedCommission, b.referralShare, b.expectedAdvance]) {
    if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000_000) throw new Error('Check the entered prices.');
  }
  const s = summary(b);
  if (!Number.isSafeInteger(s.publicTotal)) throw new Error('Stay total is too large.');
  if (b.ownDiscount > b.agreedCommission) throw new Error('Your discount exceeds your agreed commission.');
  if (b.agreedCommission + b.resortDiscount > s.publicTotal) throw new Error('Commission and resort discount exceed the public room total.');
  if (b.referralShare > s.retention) throw new Error('Referrer share exceeds the margin remaining after your discount.');
  if (b.referralShare && !b.referrer.trim()) throw new Error('Specify the referrer when a share is entered.');
  if (b.expectedAdvance > s.originalGuestTotal) throw new Error('Required advance exceeds the guest total.');
  if (b.status === 'Cancelled' && !b.cancellation) throw new Error('A cancelled booking needs explicit settlement terms.');
  if (b.cancellation) {
    const c = b.cancellation;
    if (b.status !== 'Cancelled' || typeof c.reason !== 'string' || !c.reason.trim()) throw new Error('Check the cancellation details.');
    for (const amount of [c.guestCharge, c.supplierCharge, c.referralShare]) if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid cancellation amount.');
    if (c.guestCharge > s.originalGuestTotal || c.supplierCharge > s.originalGuestTotal - (b.agreedCommission - b.ownDiscount) || c.referralShare > b.referralShare) throw new Error('Cancellation charges exceed the original agreement.');
  }
}

export function paymentLimit(s:ReturnType<typeof summary>,type:TransactionType):number|undefined {
  const limits: Partial<Record<TransactionType, number>> = {
    'Advance received': s.guestBalance, 'Resort transfer': s.resortDue, 'Commission received': s.resortReceivable,
    'Customer refund': s.refundFromHH, 'Resort refund': Math.max(s.transferred, s.resortReceivable),
    'Referrer payout': s.referrerDue, 'Referrer refund': s.referrerRefund,
    'Guest paid resort': s.guestBalance, 'Resort refunded guest': s.refundFromResort,
  };
  return limits[type];
}
export function validateTransaction(b: Booking, t: Transaction, today: string) {
  if (!Number.isSafeInteger(t.amount) || t.amount <= 0) throw new Error('Enter an amount greater than zero.');
  if (!t.date || t.date > today) throw new Error('Payment date cannot be in the future.');
  const limit=paymentLimit(summary(b),t.type);
  if (limit !== undefined && t.amount > limit) throw new Error(`This exceeds the current available balance (${formatMoney(limit)}).`);
  if (b.transactions.some(entry => entry.id === t.id)) throw new Error('This payment is already recorded.');
}

export function csv(rows: (string | number)[][]): string {
  return '\ufeff' + rows.map(row => row.map(value => {
    const safe = typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? "'" + value : String(value);
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
