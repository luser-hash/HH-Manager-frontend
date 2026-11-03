import type { Booking } from './types.ts';
import { today } from './api.ts';
export function emptyBooking(): Booking {
  const date=today(), tomorrow=new Date(date+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  return {id:'',name:'',phone:'',resort:'',room:'',checkIn:date,checkOut:tomorrow.toISOString().slice(0,10),guests:2,quantity:1,priceBasis:'stay',publicUnitPrice:0,resortDiscount:0,ownDiscount:0,agreedCommission:0,referralShare:0,referrer:'',expectedAdvance:0,status:'Inquiry',availability:'Waiting for reply',checkedAt:'',checkedWith:'',holdUntil:'',notes:'',transactions:[],history:[],createKey:crypto.randomUUID()};
}
