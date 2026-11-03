import {moneyInput, parseMoney} from './booking.ts';

export interface B2BSeason {season:'peak'|'off';price:string;valid_from:string;valid_until:string}
export interface SeasonalProfile {b2b_seasons?:B2BSeason[];b2b_rate_notices?:string[]}

export function seasonalAgreement(rows:B2BSeason[],checkIn:string,checkOut:string,quantity:number,priceBasis:string,basis:'unit'|'line_total') {
  if(!checkIn||!checkOut||checkOut<=checkIn)throw new Error('Enter valid stay dates.');
  const counts=new Map<B2BSeason,number>();
  for(let day=new Date(checkIn+'T00:00:00Z');day.toISOString().slice(0,10)<checkOut;day.setUTCDate(day.getUTCDate()+1)) {
    const date=day.toISOString().slice(0,10),matches=rows.filter(s=>s.valid_from<=date&&date<=s.valid_until);
    if(matches.length!==1)throw new Error('No valid seasonal B2B rate covers these dates. Renew the supplier rates before quoting.');
    counts.set(matches[0],(counts.get(matches[0])||0)+1);
  }
  if(counts.size===1)return {value:[...counts.keys()][0].price,basis};
  if(priceBasis!=='night'||basis==='line_total')throw new Error('Split the stay at the season boundary for whole-stay or fixed-total supplier rates.');
  let total=0;for(const [row,count] of counts)total+=parseMoney(row.price)*count*quantity;
  return {value:moneyInput(total),basis:'line_total' as const};
}
