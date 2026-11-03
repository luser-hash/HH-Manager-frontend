import type {Booking} from './types.ts';
import {summary} from './booking.ts';

export function cashPosition(bookings:Booking[]) {
  return bookings.reduce((total,booking)=>{
    const s=summary(booking),cash=Math.max(s.held,0);
    const reserved=Math.min(cash,Math.max(s.resortDue,0)+Math.max(s.refundFromHH,0)+Math.max(s.referrerDue,0));
    const shareHeld=Math.min(Math.max(cash-reserved,0),Math.max(s.earnings-s.fees,0));
    const finished=['Completed','Cancelled'].includes(booking.status);
    return {cashInHand:total.cashInHand+s.held,reservedForPayments:total.reservedForPayments+reserved,
      pendingEarningsHeld:total.pendingEarningsHeld+(finished?0:shareHeld),
      earnedCashHeld:total.earnedCashHeld+(finished?shareHeld:0)};
  },{cashInHand:0,reservedForPayments:0,pendingEarningsHeld:0,earnedCashHeld:0});
}
