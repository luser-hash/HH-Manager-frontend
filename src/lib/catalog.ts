import type { EditorLine, EditorStay } from './booking-editor.ts';
import type { Resort } from './api.ts';
import { moneyInput, nights, parseMoney } from './booking.ts';
import {agreementMargin,type AgreementModel} from './agreements.ts';
import {seasonalAgreement,type SeasonalProfile} from './seasons.ts';

export interface ResortProfile extends SeasonalProfile {
  location?:string; address?:string; contact_name?:string; phone?:string; whatsapp?:string; email?:string;
  website?:string; map_url?:string; check_in_time?:string|null; check_out_time?:string|null;
  amenities?:string; meal_plan?:string; child_policy?:string; cancellation_policy?:string; directions?:string; policies?:string; payment_terms?:string;
  default_agreement_type?:Exclude<AgreementModel,'manual'>|'';default_agreement_value?:string|null;
  default_agreement_basis?:'unit'|'line_total';
}
export interface RoomProfile extends SeasonalProfile { staff_discount_limit?:string;
  description?:string; bed_description?:string; room_size?:string; view_description?:string; bathroom_description?:string;
  standard_occupancy?:number|null; max_extra_guests?:number; extra_bed_available?:boolean; extra_bed_price?:string|null;
  amenities?:string; inclusions?:string; exclusions?:string; meal_plan?:string; child_policy?:string; cancellation_policy?:string;
  default_price_basis?:'unit'|'night'; default_public_price?:string|null; default_commission_type?:AgreementModel|'inherit'; default_commission?:string|null;
  default_agreement_basis?:'unit'|'line_total';
  rate_valid_from?:string|null; rate_valid_until?:string|null; rate_notes?:string;
}
export type DetailSnapshot = Record<string,string|number|boolean|null>;
export interface ProfileField {key:string;label:string;type?:'text'|'textarea'|'time'|'email'|'url'|'tel'|'number'|'money'|'date'|'checkbox'|'basis'|'commission'; max?:number; help?:string; private?:boolean}
export const resortProfileFields:ProfileField[]=[
  {key:'whatsapp',label:'WhatsApp',type:'tel',max:40},{key:'email',label:'Reservation email',type:'email',max:254},
  {key:'website',label:'Website (optional)',type:'url',max:200,help:'Leave blank if the property has no website.'},{key:'map_url',label:'Google Maps / location link',type:'url',max:200},
  {key:'check_in_time',label:'Check-in time',type:'time'},{key:'check_out_time',label:'Check-out time',type:'time'},
  {key:'amenities',label:'Resort facilities',type:'textarea'},{key:'meal_plan',label:'Meals / restaurant information',type:'textarea'},
  {key:'child_policy',label:'Child policy',type:'textarea'},{key:'cancellation_policy',label:'Cancellation and refund policy',type:'textarea'},
  {key:'directions',label:'Getting there / transfer instructions',type:'textarea'},
];
export const roomProfileFields:ProfileField[]=[
  {key:'description',label:'Room description',type:'textarea'},
  {key:'room_size',label:'Room size',max:100},{key:'view_description',label:'View / balcony',max:150},{key:'bathroom_description',label:'Bathroom',max:150},
  {key:'standard_occupancy',label:'Guests included in room rate',type:'number',help:'Leave blank if unknown. Maximum occupancy includes extra guests.'},
  {key:'max_extra_guests',label:'Extra guests allowed',type:'number'},
  {key:'extra_bed_available',label:'Extra bed available',type:'checkbox'},
  {key:'extra_bed_price',label:'Extra bed reference price · BDT',type:'money',help:'Reference only; add a charge line when an extra bed is requested.'},
  {key:'amenities',label:'Room facilities',type:'textarea',help:'For example: AC, hot water, Wi-Fi, balcony, power backup.'},
  {key:'inclusions',label:'Included in room rate',type:'textarea'},{key:'exclusions',label:'Not included / chargeable extras',type:'textarea'},
  {key:'meal_plan',label:'Included meals',type:'textarea',help:'Room-specific terms; resort meal information is shown separately.'},
  {key:'child_policy',label:'Room child policy',type:'textarea'},{key:'cancellation_policy',label:'Room cancellation terms',type:'textarea'},
];
export const rateFields:ProfileField[]=[
  {key:'default_price_basis',label:'Saved rate basis',type:'basis'},
  {key:'default_public_price',label:'Regular / rack rate · BDT per room',type:'money',help:'Leave blank for a quote-only room. Enter 0 only for an agreed free room.'},
  {key:'staff_discount_limit',label:'Officer discount allowance · BDT per room / pricing unit',type:'money',private:true,help:'Maximum customer discount an officer may request. Zero disables officer discounts. The server checks every request.'},
  {key:'default_commission_type',label:'Supplier agreement',type:'commission',private:true},
  {key:'default_commission',label:'Supplier rate / commission value',type:'money',private:true,help:'Supplier costs and fixed commissions follow the room rate basis; percentage applies to the rack total.'},
  {key:'rate_valid_from',label:'Rate valid from',type:'date'},{key:'rate_valid_until',label:'Last occupied night covered',type:'date'},
  {key:'rate_notes',label:'Rate notes / exceptions',type:'textarea',help:'Record weekend, seasonal or special-date exceptions. The saved rate is a starting point; verify exceptions with the resort.'},
];
export function normalizeCatalogUrl(input:string):string {
  const value=input.trim().replace(/^(https?)\/\//i,'$1://');
  if(!value||/^[a-z][a-z\d+.-]*:/i.test(value))return value;
  return value.startsWith('//')?`https:${value}`:`https://${value}`;
}
export function profilePayload(form:FormData,kind:'resort'|'room',pricingAllowed:boolean) {
  const result:Record<string,unknown>={};
  for(const field of kind==='resort'?resortProfileFields:[...roomProfileFields,...rateFields]) {
    if(!pricingAllowed&&(field.private||kind==='room'&&rateFields.some(f=>f.key===field.key)))continue;
    const raw=String(form.get(field.key)||'').trim();
    const value=field.type==='url'?normalizeCatalogUrl(raw):raw;
    result[field.key]=field.type==='checkbox'?form.has(field.key):field.type==='number'?(value?Number(value):field.key==='max_extra_guests'?0:null):['time','date','money'].includes(field.type||'')?(value||null):value;
  }
  if(pricingAllowed&&kind==='resort') {
    result.default_agreement_type=String(form.get('default_agreement_type')||'');
    result.default_agreement_value=result.default_agreement_type?String(form.get('default_agreement_value')||'').trim()||null:null;
  }
  if(kind==='room'&&pricingAllowed)result.staff_discount_limit=result.staff_discount_limit||'0.00';
  if(kind==='room'&&pricingAllowed&&['inherit','manual'].includes(String(result.default_commission_type)))result.default_commission=null;
  if(pricingAllowed)result.default_agreement_basis=String(form.get('default_agreement_basis')||'unit');
  if(pricingAllowed) {
    const model=kind==='room'?result.default_commission_type:result.default_agreement_type;
    result.b2b_seasons=model==='b2b'&&form.has('seasonal_b2b')?['peak','off'].map(season=>({season,price:String(form.get(`${season}_price`)||'').trim(),valid_from:String(form.get(`${season}_from`)||''),valid_until:String(form.get(`${season}_until`)||'')})):[];
    if((result.b2b_seasons as unknown[]).length)result[kind==='room'?'default_commission':'default_agreement_value']=null;
  }
  return result;
}
export function effectiveAgreement(room:RoomProfile,resort:ResortProfile|undefined):{model:AgreementModel;value:string;basis:'unit'|'line_total';inherited:boolean} {
  const type=room.default_commission_type||(room.default_commission!=null?'amount':'inherit');
  if(type==='inherit')return {model:resort?.default_agreement_type||'manual',value:resort?.default_agreement_value||'',basis:resort?.default_agreement_basis||'unit',inherited:true};
  return {model:room.default_commission==null?'manual':type,value:room.default_commission||'',basis:room.default_agreement_basis||'unit',inherited:false};
}
export function rateCovers(room:RoomProfile,stay:Pick<EditorStay,'checkIn'|'checkOut'>) {
  if(!stay.checkIn||!stay.checkOut||stay.checkOut<=stay.checkIn)return false;
  const last=new Date(stay.checkOut+'T00:00:00Z');last.setUTCDate(last.getUTCDate()-1);
  return (!room.rate_valid_from||stay.checkIn>=room.rate_valid_from)&&(!room.rate_valid_until||last.toISOString().slice(0,10)<=room.rate_valid_until);
}
export function refreshRoomRate(line:EditorLine,stay:EditorStay,resort:Resort|undefined):EditorLine {
  const room=line.type==='room'?resort?.rooms.find(r=>r.id===line.room):undefined;
  const covered=room?rateCovers(room,stay):true;
  const price=line.catalogPrice&&room?(covered?(room.default_public_price??''):''):line.price;
  let rateProblem='';
  if(line.catalogCommission&&room) {
    const inherited=room.default_commission_type==='inherit',source=inherited?resort:room;
    const model=inherited?resort?.default_agreement_type:room.default_commission_type;
    if(model==='b2b'&&source?.b2b_seasons?.length) {
      try {const agreement=seasonalAgreement(source.b2b_seasons,stay.checkIn,stay.checkOut,line.quantity,line.basis,source.default_agreement_basis||'unit');line={...line,pricingModel:'b2b',agreementValue:agreement.value,agreementBasis:agreement.basis};}
      catch(e){rateProblem=e instanceof Error?e.message:'Review seasonal rates.';line={...line,pricingModel:'b2b',agreementValue:''};}
    }
  }
  let commission=line.commission;
  if(line.pricingModel&&line.pricingModel!=='manual') {
    try {commission=moneyInput(agreementMargin(line.pricingModel,line.agreementValue||'',price,line.quantity,line.basis==='night'?nights(stay):1,line.agreementBasis));}
    catch{commission='0.00';}
  }
  return {...line,price,commission,rateProblem};
}
export function chooseRoom(line:EditorLine,roomId:string,stay:EditorStay,resort:Resort|undefined):EditorLine {
  const room=resort?.rooms.find(r=>r.id===roomId);
  const agreement=effectiveAgreement(room||{},resort);
  return refreshRoomRate({...line,room:roomId,physicalRoom:'',description:room?.name||'',sourceItem:undefined,details:undefined,basis:room?.default_price_basis||'night',pricingModel:agreement.model,agreementValue:agreement.value,agreementBasis:agreement.basis,catalogPrice:true,catalogCommission:true,commission:'0.00',ownDiscount:'0.00',resortDiscount:'0.00'},stay,resort);
}
