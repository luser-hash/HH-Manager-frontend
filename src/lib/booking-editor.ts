import type { Booking } from './types.ts';
import type { Resort, Segment } from './api.ts';
import { cents } from './api.ts';
import { moneyInput, nights, parseMoney } from './booking.ts';
import { chooseRoom, type DetailSnapshot } from './catalog.ts';
import {agreementMargin,type AgreementModel} from './agreements.ts';
import type {OfficerDraft} from './officer-booking.ts';
import {refreshRoomRate} from './catalog.ts';

export interface EditorLine {
  rateProblem?:string;
  pricingModel?:AgreementModel;agreementValue?:string;agreementBasis?:'unit'|'line_total';
  sourceItem?:string; details?:DetailSnapshot; catalogPrice?:boolean; catalogCommission?:boolean;
  key: string; type: 'room' | 'meal' | 'extra'; room: string; physicalRoom: string; description: string;
  quantity: number; basis: 'unit' | 'night'; price: string; commission: string; ownDiscount: string; resortDiscount: string;
}
export interface EditorStay {
  details?:DetailSnapshot;
  key: string; id?: string; resort: string; checkIn: string; checkOut: string; guests: number;
  referrer: string; referral: string; capacityReason: string; items: EditorLine[];
}
export interface EditorDraft {
  name: string; phone: string; customerId: string; email: string; whatsapp: string; source: string;
  guests: number; advance: string; notes: string; reason: string; createKey: string; stays: EditorStay[];
}
export const newLine = (type: EditorLine['type'] = 'room', room = ''): EditorLine => ({key:crypto.randomUUID(),type,room,physicalRoom:'',description:'',quantity:1,basis:'unit',price:'',commission:'0.00',ownDiscount:'0.00',resortDiscount:'0.00'});
export const newStay = (resort: Resort | undefined, checkIn: string, checkOut: string): EditorStay => {
  if (checkOut <= checkIn) {const next = new Date(checkIn+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);checkOut=next.toISOString().slice(0,10);}
  const stay:EditorStay={key:crypto.randomUUID(),resort:resort?.id || '',checkIn,checkOut,guests:2,referrer:'',referral:'0.00',capacityReason:'',items:[]};
  stay.items=[chooseRoom(newLine(),resort?.rooms[0]?.id||'',stay,resort)];return stay;
};

export function draftFromBooking(booking: Booking | undefined, resorts: Resort[], date: string): EditorDraft {
  const tomorrow = new Date(date + 'T12:00:00Z'); tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const stays: EditorStay[] = booking?.record?.segments.filter(s => !s.is_cancelled).map(s => ({key:s.id,id:s.id,details:s.resort_details_snapshot,resort:s.resort,checkIn:s.check_in,checkOut:s.check_out,guests:s.guest_count,referrer:s.referrer_name,referral:s.referral_share,capacityReason:s.capacity_override_reason || '',items:s.items.map(i => ({key:i.id,pricingModel:i.pricing_model||'manual',agreementValue:i.agreement_value||'',agreementBasis:i.agreement_basis||'unit',sourceItem:i.id,details:i.room_details_snapshot,type:i.item_type as EditorLine['type'],room:i.room_category || '',physicalRoom:i.physical_room || '',description:i.description_snapshot,quantity:i.quantity,basis:i.price_basis as EditorLine['basis'],price:i.price_confirmed === false ? '' : i.public_unit_price,commission:i.agreed_commission,ownDiscount:i.hill_horizon_funded_discount,resortDiscount:i.resort_funded_discount}))})) || [newStay(resorts[0],date,tomorrow.toISOString().slice(0,10))];
  return {name:booking?.name || '',phone:booking?.phone || '',customerId:booking?.customerId || '',email:'',whatsapp:'',source:'',guests:booking?.record?.guest_count || 2,advance:booking ? moneyInput(booking.expectedAdvance) : '0.00',notes:booking?.notes || '',reason:'',createKey:crypto.randomUUID(),stays};
}

export function expandSimpleBooking(input:OfficerDraft,resorts:Resort[],date:string):EditorDraft {
  const base=draftFromBooking(undefined,resorts,date);
  return {...base,name:input.name,phone:input.phone,customerId:input.customer,email:input.email,whatsapp:input.whatsapp,guests:input.guests,advance:input.advance||'0.00',notes:input.notes,createKey:input.key,stays:input.stays.map(s=>{
    const resort=resorts.find(r=>r.id===s.resort),stay={...newStay(resort,s.checkIn,s.checkOut),key:s.key,guests:s.guests};
    return {...stay,items:s.items.map(i=>refreshRoomRate({...chooseRoom(newLine(),i.room,stay,resort),key:i.key,quantity:i.quantity,ownDiscount:i.discount},stay,resort))};
  })};
}

const money = (value:string) => parseMoney(value || '0');
export const priceKeys = ['public_total','resort_funded_discount','hill_horizon_funded_discount','guest_total','agreed_commission','commission_available_for_retention','referral_share','your_earnings','resort_entitlement'] as const;
export type PriceTotals = Record<typeof priceKeys[number],number>;
export function priceStay(stay: EditorStay): PriceTotals {
  const totals = Object.fromEntries(priceKeys.map(k => [k,0])) as PriceTotals;
  const count = nights({checkIn:stay.checkIn,checkOut:stay.checkOut});
  for (const line of stay.items) {
    if(line.rateProblem)throw new Error(line.rateProblem);
    const gross = money(line.price) * line.quantity * (line.basis === 'night' ? count : 1);
    const commission = line.pricingModel&&line.pricingModel!=='manual'?agreementMargin(line.pricingModel,line.agreementValue||'',line.price,line.quantity,line.basis==='night'?count:1,line.agreementBasis):money(line.commission), own = money(line.ownDiscount), resort = money(line.resortDiscount);
    if (![gross,commission,own,resort].every(Number.isSafeInteger)) throw new Error('Check dates, quantities and amounts.');
    totals.public_total += gross; totals.agreed_commission += commission;
    totals.hill_horizon_funded_discount += own; totals.resort_funded_discount += resort;
  }
  totals.guest_total = totals.public_total - totals.hill_horizon_funded_discount - totals.resort_funded_discount;
  totals.commission_available_for_retention = totals.agreed_commission - totals.hill_horizon_funded_discount;
  totals.referral_share = money(stay.referral); totals.your_earnings = totals.commission_available_for_retention - totals.referral_share;
  totals.resort_entitlement = totals.guest_total - totals.commission_available_for_retention;
  if (!Object.values(totals).every(Number.isSafeInteger)) throw new Error('The booking total exceeds the supported range.');
  return totals;
}
export function priceDraft(draft: EditorDraft, cancelled: Segment[] = []): PriceTotals {
  const totals = Object.fromEntries(priceKeys.map(k => [k,0])) as PriceTotals;
  const rows = [...draft.stays.map(priceStay), ...cancelled.map(s => Object.fromEntries(priceKeys.map(k => [k,cents(s.financial_summary?.[k])])) as PriceTotals)];
  for (const row of rows) for (const key of priceKeys) totals[key] += row[key];
  if (!Object.values(totals).every(Number.isSafeInteger)) throw new Error('The booking total exceeds the supported range.');
  return totals;
}

export function editorPayload(draft: EditorDraft, resorts: Resort[], existing = false) {
  if (!draft.name.trim() || !draft.phone.trim()) throw new Error('Enter the customer name and phone.');
  if (!draft.stays.length) throw new Error('Add at least one resort stay.');
  if (!Number.isInteger(draft.guests) || draft.guests < 1 || draft.guests > 1000) throw new Error('Enter a valid booking guest count.');
  if (existing && !draft.reason.trim()) throw new Error('Add a reason for this amendment.');
  const segments = draft.stays.map((stay,index) => {
    const label = `Stay ${index+1}`;
    if (!Number.isInteger(nights(stay)) || nights(stay) < 1) throw new Error(`${label}: checkout must follow check-in.`);
    const resort = resorts.find(r => r.id === stay.resort);
    if (!resort || resort.is_archived) throw new Error(`${label}: select an active resort.`);
    if (!Number.isInteger(stay.guests) || stay.guests < 1 || stay.guests > 1000) throw new Error(`${label}: enter a valid guest count.`);
    if (!stay.items.some(i => i.type === 'room')) throw new Error(`${label}: add at least one room category.`);
    const items = stay.items.map(line => {
      if(line.rateProblem)throw new Error(`${label}: ${line.rateProblem}`);
      const room = resort.rooms.find(r => r.id === line.room);
      if (line.type === 'room' && !room) throw new Error(`${label}: select an active room category.`);
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000) throw new Error(`${label}: quantities must be positive whole numbers.`);
      if (line.physicalRoom && (line.type !== 'room' || line.quantity !== 1)) throw new Error(`${label}: an identified room requires a quantity of one.`);
      const description = line.description.trim() || room?.name;
      if (!description) throw new Error(`${label}: describe each charge.`);
      const gross = money(line.price) * line.quantity * (line.basis === 'night' ? nights(stay) : 1);
      const model=line.pricingModel||'manual';
      if(model!=='manual'&&!line.agreementValue?.trim())throw new Error(`${label}: enter the supplier rate or commission value.`);
      const margin=model==='manual'?money(line.commission):agreementMargin(model,line.agreementValue||'',line.price,line.quantity,line.basis==='night'?nights(stay):1,line.agreementBasis);
      if (money(line.ownDiscount) > margin) throw new Error(`${label}: your discount exceeds the calculated margin.`);
      if (margin + money(line.resortDiscount) > gross) throw new Error(`${label}: margin and resort discount exceed the rack total.`);
      return {...(existing&&line.sourceItem?{source_item:line.sourceItem}:{}),item_type:line.type,room_category:line.type === 'room' ? line.room : null,physical_room:line.physicalRoom || null,description_snapshot:description,quantity:line.quantity,price_basis:line.basis,pricing_model:model,agreement_basis:line.agreementBasis||'unit',agreement_value:model==='manual'?null:moneyInput(money(line.agreementValue||'')),...(line.price.trim() ? {public_unit_price:moneyInput(money(line.price))} : {}),agreed_commission:moneyInput(margin),hill_horizon_funded_discount:moneyInput(money(line.ownDiscount)),resort_funded_discount:moneyInput(money(line.resortDiscount))};
    });
    if (money(stay.referral) && !stay.referrer.trim()) throw new Error(`${label}: name the referrer when adding a share.`);
    if (priceStay(stay).your_earnings < 0) throw new Error(`${label}: referrer share exceeds the available commission.`);
    return {...(existing && stay.id ? {id:stay.id} : {}),resort:stay.resort,check_in:stay.checkIn,check_out:stay.checkOut,guest_count:stay.guests,referrer_name:stay.referrer.trim(),referral_share:moneyInput(money(stay.referral)),capacity_override_reason:stay.capacityReason.trim(),items};
  });
  return {primary_contact_name:draft.name.trim(),primary_contact_phone:draft.phone.trim(),guest_count:draft.guests,internal_notes:draft.notes,expected_advance:moneyInput(money(draft.advance)),segments,...(existing ? {reason:draft.reason.trim()} : {idempotency_key:draft.createKey,...(draft.customerId ? {customer:draft.customerId} : {customer_data:{full_name:draft.name.trim(),phone_original:draft.phone.trim(),email:draft.email,whatsapp:draft.whatsapp,acquisition_source:draft.source}})})};
}
