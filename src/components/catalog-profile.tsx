'use client';
import { normalizeCatalogUrl, rateFields, resortProfileFields, roomProfileFields, type ProfileField } from '@/lib/catalog';
import {useState} from 'react';
import {agreementLabels,agreementValueLabel,type AgreementModel} from '@/lib/agreements';
import type {B2BSeason, SeasonalProfile} from '@/lib/seasons';
const values=(record:unknown)=>record as Record<string,unknown>|undefined;
function Fields({fields,record}:{fields:ProfileField[];record?:unknown}) {
  const data=values(record);
  return <>{fields.map(f=>{
    const value=data?.[f.key];
    if(f.type==='checkbox')return <label key={f.key} className="checkbox-field full"><input name={f.key} type="checkbox" defaultChecked={!!value}/>{f.label}</label>;
    return <label className={'field '+(f.type==='textarea'?'full':'')} key={f.key}>{f.label}{f.type==='textarea'?<textarea rows={3} name={f.key} maxLength={10000} defaultValue={String(value||'')}/>:f.type==='basis'||f.type==='commission'?<select name={f.key} defaultValue={String(value || (f.type==='basis'?'night':'amount'))}>{f.type==='basis'?<><option value="night">Per room per night</option><option value="unit">Per room for the whole stay</option></>:<><option value="amount">Fixed amount per room / pricing unit</option><option value="percent">Percentage of public price</option></>}</select>:<input name={f.key} type={f.type==='money'?'number':f.type||'text'} min={f.type==='money'||f.type==='number'?0:undefined} max={f.type==='number'?100:undefined} step={f.type==='money'?'0.01':f.type==='number'?1:undefined} maxLength={f.max} placeholder={f.type==='url'?'https://example.com':undefined} onBlur={f.type==='url'?e=>{e.currentTarget.value=normalizeCatalogUrl(e.currentTarget.value);}:undefined} defaultValue={value===null||value===undefined?'':String(value)}/>}{f.help&&<small>{f.help}</small>}</label>;
  })}</>;
}
export function CatalogProfileFields({kind,record,pricingAllowed}:{kind:'resort'|'room';record?:unknown;pricingAllowed:boolean}) {
  return <>{kind==='resort'?<><div className="form-section">Arrival, contacts & resort information</div><Fields fields={resortProfileFields} record={record}/>{pricingAllowed&&<><div className="form-section">Default supplier agreement</div><AgreementDefaults kind={kind} record={record}/></>}</>:<><div className="form-section">Room experience & inclusions</div><Fields fields={roomProfileFields} record={record}/>{pricingAllowed&&<><div className="form-section">Saved booking defaults</div><Fields fields={rateFields.filter(f=>!f.private||f.key==='staff_discount_limit')} record={record}/><AgreementDefaults kind={kind} record={record}/></>}</>}</>;
}
function AgreementDefaults({kind,record}:{kind:'resort'|'room';record?:unknown}) {
  const data=values(record),typeKey=kind==='room'?'default_commission_type':'default_agreement_type',valueKey=kind==='room'?'default_commission':'default_agreement_value';
  const [model,setModel]=useState(String(data?.[typeKey]||(kind==='room'?(data?.[valueKey]!=null?'amount':'inherit'):''))),[value,setValue]=useState(String(data?.[valueKey]??''));
  const [basis,setBasis]=useState(String(data?.default_agreement_basis||'unit'));
  const [seasonal,setSeasonal]=useState(!!(data?.b2b_seasons as B2BSeason[]|undefined)?.length);
  const configured=!!model&&!['inherit','manual'].includes(model);
  return <><label className="field full">Supplier agreement<select name={typeKey} value={model} onChange={e=>{setModel(e.target.value);setValue('');setBasis(e.target.value==='flat_rate'?'line_total':'unit');}}>{kind==='room'?<><option value="inherit">Use resort agreement</option><option value="manual">Enter separately on each booking</option></>:<option value="">No default — configure individual rooms</option>}{Object.entries(agreementLabels).filter(([key])=>key!=='manual').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><small>{kind==='room'?'Override the resort agreement only when this room has different terms.':'Used by rooms set to “Use resort agreement”. Fixed rates follow each room’s pricing basis; override rooms when their supplier costs differ.'}</small></label>{configured&&model!=='percent'&&<label className="field full">Agreement amount applies to<select name="default_agreement_basis" value={basis} onChange={e=>setBasis(e.target.value)}><option value="unit">Each room / rack pricing unit</option><option value="line_total">Fixed total for the entire room line</option></select></label>}{model==='b2b'&&<><label className="checkbox-field full"><input type="checkbox" name="seasonal_b2b" checked={seasonal} onChange={e=>setSeasonal(e.target.checked)}/>Use peak and off-season B2B rates</label>{seasonal&&<SeasonalRateFields record={record}/>}</>}{configured&&!(model==='b2b'&&seasonal)&&<label className="field full">{agreementValueLabel(model,kind==='room'?String(data?.default_price_basis||'night'):undefined,basis)}<input name={valueKey} type="number" required min="0" max={model==='percent'?100:10000000} step="0.01" value={value} onChange={e=>setValue(e.target.value)}/><small>{model==='b2b'||model==='flat_rate'?'Enter the amount the resort is entitled to before any separate resort-funded discount. Margin is rack rate minus this supplier cost.':'Margin is calculated from this agreement automatically.'}</small></label>}<p className="editor-help field full">Booking dates, rack rate, rooms and this agreement determine margin automatically. Your discount and referrer share are deducted afterward.</p></>;
}
function display(value:unknown,f:ProfileField):string {
  if(f.type==='checkbox')return value?'Yes':'No';
  if(f.type==='basis')return value==='night'?'Per room per night':'Per room for the whole stay';
  if(f.type==='commission')return value==='inherit'?'Use resort agreement':agreementLabels[value as AgreementModel]||String(value);
  if(f.type==='time')return String(value).slice(0,5);
  return String(value);
}
export function ProfileDetails({kind,record,rates=false}:{kind:'resort'|'room';record?:unknown;rates?:boolean}) {
  const data=values(record);if(!data)return null;
  const base:ProfileField[]=kind==='resort'?[{key:'location',label:'Location'},{key:'address',label:'Address'},{key:'contact_name',label:'Booking contact'},{key:'phone',label:'Contact phone'},...resortProfileFields,{key:'policies',label:'General policies'},{key:'payment_terms',label:'Payment terms'}]:[{key:'bed_description',label:'Beds'},{key:'max_occupancy',label:'Maximum guests'},...roomProfileFields];
  const fields=(rates?rateFields.map(f=>f.key==='default_commission'?{...f,label:agreementValueLabel(String(data.default_commission_type),String(data.default_price_basis),String(data.default_agreement_basis))}:f):[...base,...(kind==='resort'&&data.default_agreement_type?[{key:'default_agreement_type',label:'Default supplier agreement',type:'commission' as const},{key:'default_agreement_value',label:agreementValueLabel(String(data.default_agreement_type),undefined,String(data.default_agreement_basis))}]:[])]).filter(f=>data[f.key]!==undefined&&data[f.key]!==null&&data[f.key]!==''&&!(f.type==='checkbox'&&!data[f.key])&&!(f.key==='max_extra_guests'&&!data[f.key]));
  if(!fields.length)return <p className="editor-help">No saved {rates?'rates':kind+' details'} yet.</p>;
  return <><SeasonalRateDetails record={record}/><dl className="profile-details">{fields.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{display(data[f.key],f)}</dd></div>)}</dl></>;
}

function SeasonalRateFields({record}:{record?:unknown}) {
  const rows=(values(record)?.b2b_seasons||[]) as B2BSeason[];
  return <><p className="editor-help field full">Set exact dates for both seasons. The end date includes that occupied night. Dates must not overlap; uncovered dates require renewed rates. For a nightly agreement, each night uses its season's rate.</p>{(['peak','off'] as const).map(season=>{
    const row=rows.find(s=>s.season===season),name=season==='peak'?'Peak season':'Off-season';
    return <div className="field full" key={season}><h4>{name} B2B rate</h4><div className="form-grid">
      <label className="field full">{name} supplier price · BDT<input name={`${season}_price`} type="number" required min="0" step="0.01" defaultValue={row?.price||''}/></label>
      <label className="field">{name} valid from<input name={`${season}_from`} type="date" required defaultValue={row?.valid_from||''}/></label>
      <label className="field">{name} last occupied night<input name={`${season}_until`} type="date" required defaultValue={row?.valid_until||''}/></label>
    </div></div>;
  })}<p className="hint field full">Renewal notices appear in your workspace 30 days before expiry and remain visible after expiry. Rates do not renew automatically.</p></>;
}
export function SeasonalRateDetails({record}:{record?:unknown}) {
  const data=record as SeasonalProfile|undefined;
  if(!data?.b2b_seasons?.length)return null;
  return <section className="section-card"><h4>Seasonal B2B supplier rates</h4>{data.b2b_seasons.map(s=><p key={s.season}><strong>{s.season==='peak'?'Peak season':'Off-season'}: BDT {s.price}</strong><br/>{s.valid_from} to {s.valid_until} · occupied nights</p>)}{data.b2b_rate_notices?.map(message=><p className="hint" key={message}>{message}</p>)}</section>;
}
