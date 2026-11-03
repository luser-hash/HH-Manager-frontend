import {ApiError,request,today} from './api.ts';
import type {Booking,Transaction} from './types.ts';
import {isExternal} from './settlements.ts';

export type DocumentKind='quote'|'voucher'|'invoice'|'receipt'|'cancellation';
export interface DocumentDelivery {id:string;channel:'whatsapp'|'email'|'other';recipient:string;sent_at:string;note:string;created_at:string}
export interface BookingDocument {id:string;reference:string;kind:DocumentKind;booking_version:number;created_at:string;is_stale:boolean;is_void:boolean;void_reason:string;source_transaction:string|null;source_reversed:boolean;valid_until:string|null;deliveries:DocumentDelivery[]}
export const documentLabels:Record<DocumentKind,string>={quote:'Quotation',voucher:'Booking voucher',invoice:'Invoice',receipt:'Payment / refund receipt',cancellation:'Cancellation summary'};
export const receiptTransactions=(booking:Booking):Transaction[]=>booking.transactions.filter(tx=>!isExternal(tx)&&['Advance received','Customer refund'].includes(tx.type)&&!tx.reverses&&!tx.reversedBy&&tx.amount>0);
export const bookingBase=(booking:Booking)=>{if(!booking.apiId)throw new Error('Refresh the booking before continuing.');return `/api/v1/bookings/${encodeURIComponent(booking.apiId)}/`;};
export const documentBase=(booking:Booking,document:BookingDocument)=>bookingBase(booking)+`documents/${encodeURIComponent(document.id)}/`;
export const canRecordDelivery=(doc:BookingDocument)=>!doc.is_void&&!doc.is_stale&&!doc.source_reversed;
export const dhakaNowInput=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(' ','T');
export function dhakaTimestamp(value:string) {if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Enter a date and time in Dhaka time.');const iso=value+':00+06:00';if(!Number.isFinite(Date.parse(iso))||Date.parse(iso)>Date.now())throw new Error('The recorded time cannot be in the future.');return iso;}
export function issueProblem(booking:Booking,kind:DocumentKind,validUntil:string,source:string) {
  if(!booking.record?.segments.length)return 'Add a resort stay before issuing documents.';
  if(['voucher','invoice'].includes(kind)&&!['Confirmed','Completed'].includes(booking.status))return 'Confirm the booking before issuing a voucher or invoice.';
  if(kind==='cancellation'&&booking.status!=='Cancelled')return 'Cancel the booking before issuing a cancellation summary.';
  if(kind==='quote'&&(booking.status==='Cancelled'||!validUntil||validUntil<today()))return 'A quotation needs an active booking and a current or future valid-until date.';
  if(['quote','voucher','invoice'].includes(kind)&&booking.record.segments.some(s=>!s.is_cancelled&&(!s.items.length||s.items.some(i=>i.price_confirmed===false))))return 'Agree all item prices before issuing this document.';
  if(kind==='receipt'&&!receiptTransactions(booking).some(tx=>tx.id===source))return 'Select an unreversed guest payment or refund recorded by Hill Horizon.';
  return '';
}
export function issueBookingDocument(booking:Booking,kind:DocumentKind,key:string,validUntil:string,source:string) {
  const problem=issueProblem(booking,kind,validUntil,source);if(problem)throw new Error(problem);
  return request<BookingDocument>(bookingBase(booking)+'issue-document/','POST',{version:booking.version,kind,idempotency_key:key,...(kind==='quote'?{valid_until:validUntil}:{}),...(kind==='receipt'?{source_transaction:source}:{})});
}
export async function downloadDocument(booking:Booking,doc:BookingDocument,historical=false) {
  if(doc.is_void)throw new Error('Voided documents cannot be downloaded.');
  if(doc.is_stale&&!historical)throw new Error('Choose the historical download explicitly for this earlier revision.');
  const response=await fetch(documentBase(booking,doc)+'pdf/'+(historical?'?historical=true':''),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok){const body=await response.json().catch(()=>null);throw new ApiError(body?.detail|| (Array.isArray(body)?body.join(' '):'Could not download this document. Refresh the document list and try again.'),response.status);}
  const blob=await response.blob();if(!response.headers.get('content-type')?.includes('application/pdf')||await blob.slice(0,5).text()!=='%PDF-')throw new Error('The server did not return a PDF.');
  return {blob,filename:doc.reference.replace(/[^\w.-]/g,'_')+'.pdf'};
}
export function recordDocumentDelivery(booking:Booking,doc:BookingDocument,data:{channel:string;recipient:string;sent_at:string;note:string},key:string) {
  if(!canRecordDelivery(doc))throw new Error('Issue a current, valid document before recording a delivery.');
  if(!data.recipient.trim())throw new Error('Enter the recipient.');
  const sentAt=dhakaTimestamp(data.sent_at);
  if(Date.parse(sentAt)<Math.floor(Date.parse(doc.created_at)/60000)*60000)throw new Error('Delivery time cannot be earlier than the document was issued.');
  return request<DocumentDelivery>(documentBase(booking,doc)+'mark-sent/','POST',{...data,recipient:data.recipient.trim(),sent_at:sentAt,idempotency_key:key});
}
export function updateBookingPolicy(booking:Booking,segment:string,policy:string,reason:string) {
  if(!reason.trim())throw new Error('Enter the reason for changing the saved policy.');
  return request(bookingBase(booking)+'policy/','POST',{version:booking.version,segment,policy,reason:reason.trim()});
}
export function acknowledgeBookingPolicy(booking:Booking,segment:string,name:string,time:string) {
  if(!name.trim())throw new Error('Enter who acknowledged the policy.');
  return request(bookingBase(booking)+'acknowledge-policy/','POST',{version:booking.version,segment,acknowledged_by:name.trim(),acknowledged_at:dhakaTimestamp(time)});
}
