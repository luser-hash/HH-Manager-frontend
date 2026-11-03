import {parseMoney,moneyInput,nights} from './booking.ts';
import type {Resort,Customer} from './api.ts';
export interface OfficerRoom {key:string;room:string;quantity:number;discount:string}
export interface OfficerStay {key:string;resort:string;checkIn:string;checkOut:string;guests:number;items:OfficerRoom[]}
export interface OfficerDraft {key:string;customer:string;name:string;phone:string;email:string;whatsapp:string;guests:number;advance:string;notes:string;stays:OfficerStay[]}
export interface OfficerQuote {currency:string;rack_total:string;discount_total:string;selling_total:string;segments:{resort:string;resort_name:string;check_in:string;check_out:string;guest_count:number;items:{room_category:string;description:string;quantity:number;price_basis:string;rack_unit_price:string;rack_total:string;discount:string;discount_allowance:string;selling_total:string}[]}[]}
export function officerStay(resort:Resort|undefined,date:string):OfficerStay {
  const end=new Date(date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
  return {key:crypto.randomUUID(),resort:resort?.id||'',checkIn:date,checkOut:end.toISOString().slice(0,10),guests:2,items:[{key:crypto.randomUUID(),room:resort?.rooms[0]?.id||'',quantity:1,discount:'0.00'}]};
}
export function officerSelections(stays:OfficerStay[]) {
  if(!stays.length)throw new Error('Add at least one stay.');
  return {segments:stays.map(stay=>{
    if(!stay.resort||!Number.isInteger(nights(stay))||nights(stay)<1||nights(stay)>365)throw new Error('Select a resort and valid stay dates.');
    if(!Number.isInteger(stay.guests)||stay.guests<1||stay.guests>1000||!stay.items.length)throw new Error('Enter guests and select a room.');
    return {resort:stay.resort,check_in:stay.checkIn,check_out:stay.checkOut,guest_count:stay.guests,items:stay.items.map(room=>{
      if(!room.room||!Number.isInteger(room.quantity)||room.quantity<1||room.quantity>1000)throw new Error('Select a room and valid quantity.');
      return {room_category:room.room,quantity:room.quantity,discount:moneyInput(parseMoney(room.discount||'0'))};
    })};
  })};
}
export function officerPayload(draft:OfficerDraft,customers:Customer[],quotedTotal:string) {
  if(!draft.name.trim()||!draft.phone.trim())throw new Error('Enter the guest name and phone.');
  if(!Number.isInteger(draft.guests)||draft.guests<1||draft.guests>1000)throw new Error('Enter a valid guest count.');
  if(draft.customer&&!customers.some(c=>c.id===draft.customer&&!c.is_archived))throw new Error('Select an active customer.');
  return {...officerSelections(draft.stays),quoted_total:moneyInput(parseMoney(quotedTotal)),idempotency_key:draft.key,primary_contact_name:draft.name.trim(),primary_contact_phone:draft.phone.trim(),guest_count:draft.guests,expected_advance:moneyInput(parseMoney(draft.advance||'0')),operations_notes:draft.notes,...(draft.customer?{customer:draft.customer}:{customer_data:{full_name:draft.name.trim(),phone_original:draft.phone.trim(),email:draft.email,whatsapp:draft.whatsapp}})};
}
