import type { Booking, BookingStatus, Transaction, TransactionType } from './types.ts';
import { moneyInput } from './booking.ts';
import type { ResortProfile, RoomProfile, DetailSnapshot } from './catalog.ts';

export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status=status; } }
export interface User { is_superuser?:boolean; id: string; username: string; full_name?: string; permissions: string[] }
export interface Customer { id: string; full_name: string; phone_original: string; phone_normalized: string; is_archived: boolean; whatsapp?: string; email?: string; acquisition_source?: string; notes?: string }
export interface CustomerBooking extends ApiBooking { guest_payments?: Record<string, string>; is_archived?: boolean }
export interface CustomerPayment { id: string; booking_id: string; booking_reference: string; source: 'hill_horizon' | 'resort'; kind: 'guest_receipt' | 'guest_refund' | 'receipt' | 'refund'; amount: string; payment_date: string; method: string; reference: string; note: string; reverses: string | null }
export const loadCustomerBookings = (id: string) => all<CustomerBooking>(`/api/v1/customers/${encodeURIComponent(id)}/bookings/`);
export const loadCustomerPayments = (id: string) => all<CustomerPayment>(`/api/v1/customers/${encodeURIComponent(id)}/payments/`);
export interface Resort extends ResortProfile { id: string; name: string; is_archived: boolean; rooms: ({ id: string; name: string; max_occupancy: number } & RoomProfile)[] }
export interface ResortRecord extends ResortProfile { id: string; name: string; location: string; address: string; contact_name: string; phone: string; payment_terms: string; policies: string; notes: string; is_archived: boolean }
export interface RoomCategory extends RoomProfile { id: string; resort: string; name: string; max_occupancy: number; bed_description: string; notes: string; is_archived: boolean }
export async function loadResortDirectory() {
  const [resorts, rooms] = await Promise.all([all<ResortRecord>('/api/v1/resorts/?ordering=name'), all<RoomCategory>('/api/v1/rooms/?ordering=name')]);
  return {resorts, rooms};
}
export interface Item { selling_total?:string;discount_total?:string; agreement_basis?: 'unit'|'line_total'; pricing_model?: import('./agreements.ts').AgreementModel; agreement_value?: string|null; room_details_snapshot?: DetailSnapshot; id: string; room_category: string | null; item_type: string; physical_room?: string | null; description_snapshot: string; quantity: number; price_basis: string; public_unit_price: string; resort_funded_discount: string; hill_horizon_funded_discount: string; agreed_commission: string; price_confirmed?: boolean }
export interface Segment { supplier_terms_snapshot?: string; resort_details_snapshot?: DetailSnapshot; policy_acknowledged_by?: string; policy_acknowledged_at?: string|null; financial_summary?: Record<string,string>; capacity_override_reason?: string; policy_snapshot?: string; id: string; resort: string; resort_name_snapshot: string; check_in: string; check_out: string; guest_count: number; items: Item[]; referrer_name: string; referral_share: string; is_cancelled: boolean; cancellation_reason: string; guest_charge_on_cancellation: string; supplier_charge_on_cancellation: string; referral_share_on_cancellation: string; availability?: {state: string; responded_by: string; responded_at: string | null; hold_expires_at: string | null; reference: string} }
export interface ApiBooking { operations_notes?:string;guest_payments?:Record<string,string>; settlement?: import('./settlements.ts').SettlementState; closed_at?: string | null; id: string; reference: string; customer: string; primary_contact_name: string; primary_contact_phone: string; status: string; version: number; guest_count: number; expected_advance: string; internal_notes?: string; segments: Segment[]; financial_summary?: Record<string,string>; created_at: string; requested_check_in: string | null; requested_check_out: string | null }
interface ApiTransaction { id: string; kind: string; amount: string; payment_date: string; method?: string; reference: string; note: string; reverses: string | null; segment: string }
let csrf = '';
function explain(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(explain).join(' ');
  if (value && typeof value === 'object') return Object.entries(value).map(([key,v]) => `${key === 'detail' || key === 'non_field_errors' ? '' : key + ': '}${explain(v)}`).join(' ');
  return 'The request could not be completed.';
}
export async function request<T>(path: string, method = 'GET', body?: unknown, timeoutMs = 20000): Promise<T> {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path.');
  if (method !== 'GET' && !csrf) csrf = (await request<{csrfToken:string}>('/api/v1/auth/csrf/')).csrfToken;
  let response: Response;
  try { response = await fetch(path, {method, credentials:'same-origin', cache:'no-store', headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(method !== 'GET' ? {'X-CSRFToken':csrf} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(timeoutMs)}); }
  catch { throw new ApiError('Cannot reach Django. Start the backend on port 8000 and try again. If a save timed out, refresh before retrying.', 0); }
  if (response.status === 204) return undefined as T;
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(value ? explain(value) : `Django returned HTTP ${response.status}. Check the backend terminal.`, response.status);
  return value as T;
}
export async function all<T>(path: string): Promise<T[]> {
  const rows: T[] = []; let next: string | null = path;
  while (next) {
    const page: {results:T[];next:string|null} | T[] = await request(next);
    if (Array.isArray(page)) { rows.push(...page); break; }
    rows.push(...page.results);
    if (!page.next) break;
    const url: URL = new URL(page.next, 'http://local');
    const nextPath: string = url.pathname + url.search;
    if (!nextPath.startsWith('/api/v1/')) throw new Error('Unexpected API pagination link.');
    next = nextPath;
  }
  return rows;
}
export async function login(username: string, password: string) {
  csrf = (await request<{csrfToken:string}>('/api/v1/auth/csrf/')).csrfToken;
  const result = await request<{csrfToken:string}>('/api/v1/auth/login/', 'POST', {username,password}); csrf = result.csrfToken;
  return request<User>('/api/v1/auth/me/');
}
export async function logout() { await request('/api/v1/auth/logout/', 'POST'); csrf = ''; }
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const cents = (value: string | undefined) => {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value || '0');
  if (!match) throw new Error('Invalid money value from Django.');
  const n = (Number(match[2])*100 + Number((match[3] || '').padEnd(2,'0'))) * (match[1] ? -1 : 1);
  if (!Number.isSafeInteger(n)) throw new Error('Money amount exceeds safe display range.');
  return n;
};
const localTime = (value?: string | null) => value ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replace(' ','T') : '';
export const transactionKinds: Record<TransactionType,string> = {'Advance received':'guest_receipt','Resort transfer':'resort_transfer','Commission received':'commission_receipt','Customer refund':'guest_refund','Resort refund':'resort_refund','Referrer payout':'referral_payout','Referrer refund':'referral_refund','Payment fee':'fee','Guest paid resort':'receipt','Resort refunded guest':'refund'};
const statuses: Record<string,BookingStatus> = {inquiry:'Inquiry',pending:'Pending confirmation',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled'};
export function mapBooking(raw: ApiBooking, resorts: Resort[], customers: Customer[], cash: ApiTransaction[] = [], direct: ApiTransaction[] = [], history: {action:string;created_at:string}[] = []): Booking {
  const s = raw.segments[0], item = s?.items[0], customer = customers.find(c => c.id === raw.customer);
  const resort = resorts.find(r => r.id === s?.resort), room = resort?.rooms.find(r => r.id === item?.room_category);
  const a = s?.availability;
  const transactions: Transaction[] = [...cash.map(t => ({ ...t, external:false })), ...direct.map(t => ({...t,external:true}))].map(t => ({id:t.id,segmentId:t.segment,source:t.external?'resort':'hill_horizon',reverses:t.reverses,reversedBy:(t.external?direct:cash).find(r=>r.reverses===t.id)?.id || null,type:(Object.entries(transactionKinds).find(([label,kind]) => kind === t.kind && (t.external === ['Guest paid resort','Resort refunded guest'].includes(label)))?.[0] || 'Payment fee') as TransactionType,amount:cents(t.amount)*(t.reverses ? -1 : 1),date:t.payment_date,method:({bkash:'bKash',nagad:'Nagad',bank:'Bank transfer',cash:'Cash'} as Record<string,string>)[t.method || ''] || 'Direct to resort',reference:t.reference,note:t.note}));
  return { guestSummary:raw.guest_payments, record:raw, id:raw.reference,apiId:raw.id,version:raw.version,customerId:raw.customer,segmentId:s?.id,resortId:s?.resort,roomId:item?.room_category || undefined,
    name:raw.primary_contact_name || customer?.full_name || 'Customer',phone:raw.primary_contact_phone || customer?.phone_original || '',
    resort:raw.segments.length > 1 ? [...new Set(raw.segments.map(s=>s.resort_name_snapshot))].join(' + ') : s?.resort_name_snapshot || 'Stay not assigned',room:raw.segments.flatMap(s=>s.items.filter(i=>i.item_type==='room')).length > 1 ? raw.segments.flatMap(s=>s.items.filter(i=>i.item_type==='room').map(i=>i.description_snapshot)).join(', ') : room?.name || item?.description_snapshot || 'Room not assigned',
    checkIn:raw.segments.map(s=>s.check_in).sort()[0] || raw.requested_check_in || '',checkOut:raw.segments.map(s=>s.check_out).sort().at(-1) || raw.requested_check_out || '',guests:raw.guest_count,quantity:raw.segments.flatMap(s=>s.items).filter(i=>i.item_type==='room').reduce((sum,i)=>sum+i.quantity,0) || 1,
    priceBasis:item?.price_basis === 'night' ? 'night' : 'stay',publicUnitPrice:cents(item?.public_unit_price),resortDiscount:cents(item?.resort_funded_discount),ownDiscount:cents(item?.hill_horizon_funded_discount),agreedCommission:cents(item?.agreed_commission),referralShare:cents(s?.referral_share),referrer:s?.referrer_name || '',
    expectedAdvance:cents(raw.expected_advance),status:statuses[raw.status],availability:({available:'Available when checked',held:'Held',confirmed:'Verified',unavailable:'Unavailable'} as Record<string,Booking['availability']>)[a?.state || ''] || 'Waiting for reply',checkedAt:localTime(a?.responded_at),checkedWith:a?.responded_by || '',holdUntil:localTime(a?.hold_expires_at),confirmationReference:a?.reference || '',notes:raw.internal_notes || raw.operations_notes || '',transactions,history:history.map(h => ({text:h.action.replaceAll('_',' '),date:h.created_at.slice(0,10)})),
    complex:raw.segments.length !== 1 || s?.items.length !== 1 || item?.item_type !== 'room' || !!item?.physical_room || item?.price_basis !== 'night' && item?.price_basis !== 'unit',
    stays:raw.segments.map(s => ({resort:s.resort_name_snapshot,room:s.items.map(i => i.description_snapshot).join(', '),checkIn:s.check_in,checkOut:s.check_out,guests:s.guest_count,cancelled:s.is_cancelled})),
    serverSummary:raw.financial_summary,
    ...(raw.segments.length === 1 && s?.is_cancelled ? {cancellation:{guestCharge:cents(s.guest_charge_on_cancellation),supplierCharge:cents(s.supplier_charge_on_cancellation),referralShare:cents(s.referral_share_on_cancellation),reason:s.cancellation_reason}} : {}),
  };
}
export async function loadCatalog() {
  const [rs,rooms,customers] = await Promise.all([all<Omit<Resort,'rooms'>>('/api/v1/resorts/'),all<RoomCategory>('/api/v1/rooms/'),all<Customer>('/api/v1/customers/')]);
  return {resorts:rs.filter(r => !r.is_archived).map(r => ({...r,rooms:rooms.filter(room => room.resort === r.id && !room.is_archived)})),customers};
}
export async function loadBookings(resorts: Resort[], customers: Customer[],owner=true) {
  const raw = await all<ApiBooking>('/api/v1/bookings/');
  if(!owner)return raw.map(b=>mapBooking(b,resorts,customers));
  const rows: Booking[] = [];
  // Bound parallel requests rather than sending three requests per booking at once.
  for (let i=0;i<raw.length;i+=5) rows.push(...await Promise.all(raw.slice(i,i+5).map(async b => {
    const base = `/api/v1/bookings/${b.id}/`;
    const [cash,direct,history] = await Promise.all([all<ApiTransaction>(base+'transactions/'),all<ApiTransaction>(base+'resort-payment/'),all<{action:string;created_at:string}>(base+'timeline/')]);
    return mapBooking(b,resorts,customers,cash,direct,history);
  })));
  return rows;
}
export function segmentPayload(b: Booking, resorts: Resort[], preserveId = false) {
  const resort = resorts.find(r => r.name === b.resort), room = resort?.rooms.find(r => r.name === b.room);
  if (!resort || !room) throw new Error('Choose a resort and room from your database. Add them in Contacts first.');
  return {...(preserveId ? {id:b.segmentId} : {}),resort:resort.id,check_in:b.checkIn,check_out:b.checkOut,guest_count:b.guests,referrer_name:b.referrer,referral_share:moneyInput(b.referralShare),items:[{room_category:room.id,item_type:'room',description_snapshot:room.name,quantity:b.quantity,price_basis:b.priceBasis === 'night' ? 'night' : 'unit',public_unit_price:moneyInput(b.publicUnitPrice),resort_funded_discount:moneyInput(b.resortDiscount),hill_horizon_funded_discount:moneyInput(b.ownDiscount),agreed_commission:moneyInput(b.agreedCommission)}]};
}
export async function persistBooking(b: Booking, old: Booking | undefined, resorts: Resort[], _customers: Customer[]): Promise<string> {
  if (!old) {
    const segment = segmentPayload(b,resorts);
    const customer = b.customerId ? {customer:b.customerId} : {customer_data:{full_name:b.name,phone_original:b.phone,...b.customerDetails}};
    const saved = await request<ApiBooking>('/api/v1/bookings/','POST',{...customer,idempotency_key:b.createKey,primary_contact_name:b.name,primary_contact_phone:b.phone,guest_count:b.guests,internal_notes:b.notes,expected_advance:moneyInput(b.expectedAdvance),segments:[segment]});
    return saved.reference;
  }
  const base = `/api/v1/bookings/${old.apiId}/`; let version = b.version!;
  const post = async (action:string,data:object) => { const result = await request<ApiBooking>(base+action+'/', 'POST', {version,...data}); version = result.version; return result; };
  const added = b.transactions.filter(t => !old.transactions.some(v => v.id === t.id));
  if (added.length) {
    for (const t of added) {
      const external = ['Guest paid resort','Resort refunded guest'].includes(t.type);
      await request(external ? base+'resort-payment/' : '/api/v1/transactions/', 'POST', {segment:t.segmentId || old.segmentId,kind:transactionKinds[t.type],amount:moneyInput(t.amount),payment_date:t.date,...(!external ? {method:({'bKash':'bkash',Nagad:'nagad','Bank transfer':'bank',Cash:'cash'} as Record<string,string>)[t.method]} : {}),reference:t.reference,note:t.note,idempotency_key:t.id});
    }
    return old.id;
  }
  if (old.complex) throw new Error('Use the full booking editor to change multiple stays or price lines.');
  if (b.status === 'Cancelled' && old.status !== 'Cancelled' && b.cancellation) {
    const c=b.cancellation; await post('cancel',{reason:c.reason,settlements:[{segment:old.segmentId,guest_charge:moneyInput(c.guestCharge),supplier_charge:moneyInput(c.supplierCharge),referral_share:moneyInput(c.referralShare)}]}); return old.id;
  }
  if (b.revisionReason) {
    await post('amend',{reason:b.revisionReason,guest_count:b.guests,expected_advance:moneyInput(b.expectedAdvance),segments:[segmentPayload(b,resorts,true)]});
  }
  if (b.notes !== old.notes || b.name !== old.name || b.phone !== old.phone) {
    const saved = await request<ApiBooking>(base,'PATCH',{version,internal_notes:b.notes,primary_contact_name:b.name,primary_contact_phone:b.phone}); version=saved.version;
  }
  let currentStatus = old.status;
  if (b.revisionReason) currentStatus = 'Pending confirmation';
  const availabilityChanged = (['availability','checkedAt','checkedWith','holdUntil','confirmationReference'] as const).some(k => b[k] !== old[k]);
  if (availabilityChanged && !b.revisionReason) {
    const response = ({'Waiting for reply':'requested','Available when checked':'available',Held:'held',Verified:'confirmed',Unavailable:'unavailable'} as Record<string,string>)[b.availability];
    const saved = await post('availability',{segment:old.segmentId,response,responded_by:b.checkedWith,responded_at:b.checkedAt ? b.checkedAt+':00+06:00' : null,hold_expires_at:b.holdUntil ? b.holdUntil+':00+06:00' : null,reference:b.confirmationReference || '',channel:'phone',notes:'Updated through Hill Horizon Manager'});
    currentStatus = statuses[saved.status];
  }
  if (!b.revisionReason && b.status !== currentStatus) {
    if (b.status === 'Confirmed' && currentStatus === 'Inquiry') { await post('submit',{}); currentStatus='Pending confirmation'; }
    const action = b.status === 'Pending confirmation' ? 'submit' : b.status === 'Confirmed' ? 'confirm' : b.status === 'Completed' ? 'complete' : 'return-to-inquiry';
    await post(action,{});
  }
  return old.id;
}
