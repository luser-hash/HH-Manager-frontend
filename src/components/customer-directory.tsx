'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { cents, loadCustomerBookings, loadCustomerPayments, request, type Customer, type CustomerBooking, type CustomerPayment } from '@/lib/api';
import { formatMoney, shortDate } from '@/lib/booking';
import { useWorkspace } from './workspace';
import { Button, Icon, Overlay, Tag } from './ui';

type Dialog = {kind: 'view' | 'edit' | 'archive'; customer: Customer} | {kind: 'create'};
const fields = [['full_name', 'Full name', 150], ['phone_original', 'Phone number', 40], ['whatsapp', 'WhatsApp', 40], ['email', 'Email', 254], ['acquisition_source', 'How they found us', 100]] as const;
const messageOf = (e: unknown) => e instanceof Error ? e.message : 'Could not complete the request.';

export function CustomerDirectory() {
  const {customers, user, refresh, notify} = useWorkspace();
  const [query, setQuery] = useState(''), [status, setStatus] = useState('active');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = useCallback(() => setDialog(null), []);
  const can = (name: string) => !!user?.permissions.includes(name);
  const term = query.trim().toLowerCase(), phoneTerm = term.replace(/\D/g, '').replace(/^00/, '').replace(/^880/, '0');
  const rows = customers.filter(c => (status === 'all' || c.is_archived === (status === 'archived')) && (
    [c.full_name,c.phone_original,c.phone_normalized,c.email,c.whatsapp].join(' ').toLowerCase().includes(term) ||
    (phoneTerm.length > 0 && c.phone_normalized.replace(/\D/g, '').replace(/^880/, '0').includes(phoneTerm))
  ));
  async function saved() { await refresh(); notify('Customer directory saved.'); close(); }
  return <section className="card resort-directory"><div className="card-header"><div><h2>Customers</h2><p>Contact details, booking history and customer payments.</p></div>{can('customers.add_customer') && <Button onClick={() => setDialog({kind:'create'})}>Add customer</Button>}</div>
    <div className="table-toolbar directory-toolbar"><div className="search"><Icon name="search"/><input aria-label="Search customers" placeholder="Search name, phone or email…" value={query} onChange={e => setQuery(e.target.value)}/></div><select className="filter" aria-label="Customer archive status" value={status} onChange={e => setStatus(e.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All customers</option></select></div>
    <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>Source</th><th>Status</th><th/></tr></thead><tbody>{rows.map(c => <tr key={c.id}><td><strong>{c.full_name}</strong></td><td><strong>{c.phone_original}</strong><small>{c.email}</small></td><td>{c.acquisition_source || 'Not added'}</td><td><Tag>{c.is_archived ? 'Archived' : 'Active'}</Tag></td><td><Button secondary onClick={() => setDialog({kind:'view',customer:c})}>View customer</Button></td></tr>)}</tbody></table></div>
    {!rows.length && <div className="empty">No customers match these filters.</div>}<div className="table-footer">Showing {rows.length} of {customers.length} customers</div>
    {dialog && (dialog.kind === 'view' ? <CustomerDetails customer={dialog.customer} can={can} onClose={close} onChange={setDialog}/> : <CustomerForm key={dialog.kind + ('customer' in dialog ? dialog.customer.id : '')} dialog={dialog} onClose={close} onSaved={saved}/>)}
  </section>;
}

function CustomerForm({dialog,onClose,onSaved}:{dialog: Exclude<Dialog,{kind:'view'}>;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const customer = 'customer' in dialog ? dialog.customer : undefined;
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [committed,setCommitted] = useState(false);
  const lock = useRef(false);
  const close = useCallback(() => { if (!lock.current) onClose(); },[onClose]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || committed) return;
    const form = new FormData(event.currentTarget);
    const data = dialog.kind === 'archive' ? {is_archived:!customer!.is_archived} : Object.fromEntries([...fields.map(([key]) => key),'notes'].map(key => [key,String(form.get(key) || '').trim()]));
    lock.current = true; setBusy(true); setError(''); let persisted = false;
    try { await request(`/api/v1/customers/${customer ? customer.id + '/' : ''}`,customer ? 'PATCH' : 'POST',data); persisted = true; setCommitted(true); await onSaved(); }
    catch(e) { setError((persisted ? 'Saved successfully, but refresh failed. Close this dialog and refresh your records. ' : '') + messageOf(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  const archive = dialog.kind === 'archive';
  return <Overlay title={archive ? `${customer?.is_archived ? 'Restore' : 'Archive'} ${customer?.full_name}` : customer ? 'Edit customer' : 'Add customer'} onClose={close}><form onSubmit={submit}><div className="form-body">
    {archive ? <p>{customer?.is_archived ? 'Restore this customer so they can be selected for new bookings?' : 'Archive this customer? Their booking and payment history will remain available.'}</p> : <fieldset className="directory-fields" disabled={busy || committed}><div className="form-grid">{fields.map(([key,label,max]) => <label className="field" key={key}>{label}<input name={key} maxLength={max} required={key === 'full_name' || key === 'phone_original'} type={key === 'email' ? 'email' : key === 'phone_original' || key === 'whatsapp' ? 'tel' : 'text'} defaultValue={customer?.[key] || ''}/></label>)}<label className="field full">Customer notes<textarea name="notes" rows={3} defaultValue={customer?.notes || ''}/></label></div></fieldset>}
    {error && <p className="error" role="alert">{error}</p>}</div><div className="form-foot"><Button secondary disabled={busy} onClick={close}>Close</Button><Button type="submit" disabled={busy || committed}>{busy ? 'Saving…' : archive ? customer?.is_archived ? 'Restore' : 'Archive' : 'Save customer'}</Button></div></form></Overlay>;
}

function CustomerDetails({customer,can,onClose,onChange}:{customer:Customer;can:(name:string)=>boolean;onClose:()=>void;onChange:(dialog:Dialog)=>void}) {
  const [bookings,setBookings] = useState<CustomerBooking[]>([]), [payments,setPayments] = useState<CustomerPayment[]>([]);
  const [loading,setLoading] = useState(true), [bookingError,setBookingError] = useState(''), [paymentError,setPaymentError] = useState('');
  const [retry,setRetry] = useState(0);
  const {user} = useWorkspace();
  const bookingAccess = can('bookings.view_booking');
  const paymentAccess = bookingAccess && !!user?.is_superuser;
  useEffect(() => {
    let active = true; setLoading(true); setBookingError(''); setPaymentError('');
    void Promise.allSettled([
      bookingAccess ? loadCustomerBookings(customer.id).then(rows => { if (active) setBookings(rows); }).catch(e => { if (active) setBookingError(messageOf(e)); }) : Promise.resolve(),
      paymentAccess ? loadCustomerPayments(customer.id).then(rows => { if (active) setPayments(rows); }).catch(e => { if (active) setPaymentError(messageOf(e)); }) : Promise.resolve(),
    ]).then(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[customer.id,bookingAccess,paymentAccess,retry]);
  const paymentLabel = {guest_receipt:'Advance received',guest_refund:'Customer refund',receipt:'Guest paid resort',refund:'Resort refunded guest'};
  return <Overlay title={customer.full_name} onClose={onClose} drawer><div className="drawer-body">
    <div className="actions"><Tag>{customer.is_archived ? 'Archived' : 'Active'}</Tag>{can('customers.change_customer') && <><Button secondary onClick={() => onChange({kind:'edit',customer})}>Edit customer</Button><Button secondary onClick={() => onChange({kind:'archive',customer})}>{customer.is_archived ? 'Restore' : 'Archive'}</Button></>}</div>
    <dl className="directory-details">{fields.filter(([key]) => key !== 'full_name').map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{customer[key] || 'Not added'}</dd></div>)}<div><dt>Customer notes</dt><dd>{customer.notes || 'Not added'}</dd></div></dl>
    <div className="actions"><h3>Booking & payment history</h3><Button secondary disabled={loading} onClick={() => setRetry(n => n + 1)}>Refresh history</Button></div>
    {loading ? <p role="status">Loading history…</p> : <>
      <section className="section-card"><h3>Bookings</h3>{!bookingAccess ? <p>Booking history requires booking-view permission.</p> : bookingError ? <p className="error" role="alert">{bookingError}</p> : <>{bookings.map(b => <article className="customer-booking" key={b.id}><div className="actions"><strong>{b.reference}</strong><Tag>{b.status}</Tag>{b.is_archived && <Tag>Archived</Tag>}</div><p>{b.primary_contact_name} · {b.primary_contact_phone}</p>{b.segments.map(s => <div key={s.id}><strong>{s.resort_name_snapshot}</strong><p>{shortDate(s.check_in)} – {shortDate(s.check_out)} · {s.guest_count} guests{s.is_cancelled ? ' · Stay cancelled' : ''}<br/>{s.items.map(i => `${i.description_snapshot} × ${i.quantity}`).join(', ')}</p></div>)}{!b.segments.length && <p>Stay not assigned</p>}<p>Guest total: {formatMoney(cents((b.financial_summary || b.guest_payments)?.guest_total))}</p></article>)}{!bookings.length && <p>No bookings for this customer.</p>}</>}</section>
      <section className="section-card"><h3>Customer payments & refunds</h3><p>Payments received from or refunded to the guest, including direct resort payments and reversals.</p>{!paymentAccess ? <p>Payment history is available to the owner.</p> : paymentError ? <p className="error" role="alert">{paymentError}</p> : <>{payments.map(p => <article className="customer-booking" key={p.source + p.id}><div className="actions"><strong>{paymentLabel[p.kind]}{p.reverses ? ' · Reversal' : ''}</strong><strong>{formatMoney(cents(p.amount) * (p.reverses ? -1 : 1))}</strong></div><p>{shortDate(p.payment_date)} · {p.booking_reference}<br/>{p.method === 'direct' ? 'Direct to resort' : p.method} {p.reference && `· ${p.reference}`}</p>{p.note && <p className="customer-note">{p.note}</p>}</article>)}{!payments.length && <p>No customer payments recorded.</p>}</>}</section>
    </>}
  </div></Overlay>;
}
