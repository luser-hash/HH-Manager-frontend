import {parseMoney} from './booking.ts';
export type AgreementModel='manual'|'b2b'|'percent'|'flat_rate'|'amount';
export const agreementLabels:Record<AgreementModel,string>={manual:'Manual line margin',b2b:'B2B / net resort cost',percent:'Commission percentage',flat_rate:'Flat resort cost',amount:'Fixed commission'};
export function agreementValueLabel(model:string,basis?:string,agreementBasis?:string) {
  if(model==='percent')return 'Commission · % of rack total';
  const unit=agreementBasis==='line_total'?'total for this entire line':basis===undefined?'per room / rack pricing unit':basis==='unit'?'per room for whole stay':'per room per night';
  return model==='b2b'?`B2B / net rate · BDT ${unit}`:model==='flat_rate'?`Flat resort cost · BDT ${unit}`:`Fixed commission · BDT ${unit}`;
}
export function agreementMargin(model:AgreementModel,value:string,rack:string,quantity:number,units:number,basis:'unit'|'line_total'='unit'):number {
  if(model==='manual')throw new Error('Manual margin must be entered as a line total.');
  if(!value.trim())return 0;
  const rate=parseMoney(value);
  if(model==='percent'&&rate>10000)throw new Error('Commission percentage cannot exceed 100.');
  if(!rack.trim())return 0;
  const price=parseMoney(rack),factor=quantity*units,gross=price*factor;
  if(!Number.isSafeInteger(gross)||!Number.isSafeInteger(factor)||factor<1)throw new Error('Check dates, quantity and prices.');
  const amount=rate*(basis==='line_total'?1:factor);
  if(model!=='percent'&&amount>gross)throw new Error(model==='amount'?'Fixed commission exceeds the rack total.':'Supplier cost exceeds the rack total.');
  const result=model==='percent'?Number((BigInt(gross)*BigInt(rate)+5000n)/10000n):model==='amount'?amount:gross-amount;
  if(!Number.isSafeInteger(result))throw new Error('Calculated margin exceeds the supported range.');return result;
}
