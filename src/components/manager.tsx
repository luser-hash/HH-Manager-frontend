'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Booking, PaymentIntent, Section } from '@/lib/types';
import { STATUSES, TRANSACTION_TYPES } from '@/lib/types';
import { today } from '@/lib/api';
import {cashPosition} from '@/lib/cash-position';
import { cashImpact, isExternal, bookingSettlementAmounts } from '@/lib/settlements';
import { csv, formatMoney, initials, nights, shortDate, summary } from '@/lib/booking';
import { useWorkspace } from './workspace';
import { Button, Heading, Icon, Overlay, Stat, Tag, downloadFile } from './ui';
import { BookingDrawer, BookingForm, CancellationForm, PaymentForm, type BookingTab } from './booking-dialog';
import { ResortDirectory } from './resort-directory';
import { CustomerDirectory } from './customer-directory';
import { SettlementQueue } from './booking-settlement';
import { RecoveryPanel } from './recovery';
const sections: Section[] = ['today','bookings','calendar','money','contacts'];
const titleOf=(section:Section)=>section[0].toUpperCase()+section.slice(1);
const hrefOf=(section:Section)=>section==='today'?'/':'/'+section+'/';
type Dialog={type:'booking';id:string;tab?:BookingTab}|{type:'payment';id:string;intent?:PaymentIntent}|{type:'edit'|'cancel';id:string}|{type:'new'|'about'|'choose-payment'}|null;
export default function Manager({section}:{section:Section}) {
  const {bookings,resorts,ready,problem,notify,user,refresh,logout}=useWorkspace();
  const rateNotices=user?.is_superuser?resorts.flatMap(r=>[
    ...(r.b2b_rate_notices||[]).map(message=>({name:r.name,message})),
    ...r.rooms.flatMap(room=>(room.b2b_rate_notices||[]).map(message=>({name:`${r.name} · ${room.name}`,message})))
  ]):[];
  const [dialog,setDialog]=useState<Dialog>(null),[paymentId,setPaymentId]=useState(''),[refreshing,setRefreshing]=useState(false);
  const close=useCallback(()=>setDialog(null),[]);
  const openBooking=useCallback((id:string,tab?:BookingTab)=>setDialog({type:'booking',id,tab}),[]);
  const selected=dialog && 'id' in dialog?bookings.find(b=>b.id===dialog.id):undefined;
  const paymentBookings=bookings.filter(b=>!b.record?.closed_at && b.record?.segments.length);
  const selectedPaymentId=paymentBookings.find(b=>b.id===paymentId)?.id || paymentBookings[0]?.id;
  function pay(id?:string,intent?:PaymentIntent) {
    if(id && !paymentBookings.some(b=>b.id===id)) {notify('Reopen a closed settlement before posting payments. A booking must have a stay to receive payments.');return;}
    if(id)setDialog({type:'payment',id,intent});else if(paymentBookings.length)setDialog({type:'choose-payment'});else notify(bookings.length?'No open booking stays are available for payments.':'Create a booking first.');
  }
  async function reload() {setRefreshing(true);try{await refresh();notify('Records refreshed.');}catch{}finally{setRefreshing(false);}}
  function backup(){downloadFile('hill-horizon-booking-export.json',JSON.stringify({exportedAt:new Date().toISOString(),source:'Hill Horizon Manager',bookings:user?.is_superuser?bookings:bookings.map(b=>b.record)},null,2),'application/json');notify('Booking export downloaded. Use Backup & recovery for a complete recovery ZIP.');}
  const nav=(mobile=false)=>sections.filter(s=>user?.is_superuser||s!=='money').map(s=><Link key={s} href={hrefOf(s)} className={(mobile?'':'nav-item ')+(section===s?'active':'')} aria-current={section===s?'page':undefined}><Icon name={s}/><span>{titleOf(s)}</span>{!mobile&&s==='bookings'&&<span className="count">{ready?bookings.length:'…'}</span>}</Link>);
  return <><aside className="sidebar"><Link className="brand" href="/"><img src="/assets/logo.png" alt="Hill Horizon Tours & Travels"/></Link><div className="workspace-label">OPERATIONS</div><nav aria-label="Main navigation">{nav()}{user?.is_superuser&&<Link href="/recovery/" className={'nav-item '+(section==='recovery'?'active':'')}><Icon name="download"/><span>Backup & recovery</span></Link>}</nav><div className="sidebar-bottom"><button className="reset" onClick={()=>void logout()}>Sign out</button><div className="profile"><span className="avatar">HH</span><div>{user?.full_name||user?.username}<small>Hill Horizon team</small></div></div></div></aside>
  <div className="shell"><header className="topbar"><Link className="mobile-brand" href="/">Hill Horizon<span>MANAGER</span></Link><div className="breadcrumb">Hill Horizon<span>/</span><strong>{titleOf(section)}</strong></div><div className="top-actions"><span className="date-label">{shortDate(today(),true)}</span><button className="icon-button" onClick={()=>setDialog({type:'about'})} aria-label="Help and exports">?</button></div></header>
  <main>{problem&&<div className="hint error-banner" role="alert">{problem}<Button secondary disabled={refreshing} onClick={()=>void reload()}>Retry connection</Button></div>}
  {!ready?<div className="card empty" role="status">Loading your records…</div>:problem?<div className="card empty">Reconnect before viewing or changing bookings.</div>:<>
  {!!rateNotices.length&&<section className="hint" role="status"><strong>B2B rate renewals</strong><p>Review these supplier rates in Contacts → Resorts & rooms.</p>{rateNotices.map(n=><p key={n.name+n.message}><strong>{n.name}</strong> · {n.message}</p>)}</section>}
  {section==='today'&&<Today bookings={bookings} onNew={()=>setDialog({type:'new'})} onOpen={openBooking}/>}
  {section==='bookings'&&<Bookings bookings={bookings} onNew={()=>setDialog({type:'new'})} onOpen={openBooking}/>}
  {section==='calendar'&&<Calendar bookings={bookings} onNew={()=>setDialog({type:'new'})} onOpen={openBooking}/>}
  {section==='money'&&(user?.is_superuser?<Money bookings={bookings} onPay={pay} onOpen={openBooking}/>:<div className="card empty">This section is available to the owner only.</div>)}
  {section==='contacts'&&<Contacts/>}
  {section==='recovery'&&<RecoveryPanel/>}
  </>}</main><footer>Hill Horizon Manager · <button onClick={()=>void reload()} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</button> · {user?.is_superuser&&<><Link href="/recovery/">Backup & recovery</Link> · </>}<button onClick={()=>setDialog({type:'about'})}>Export & help</button></footer></div>
  <nav className="mobile-nav" aria-label="Mobile navigation">{nav(true)}</nav>
  {dialog?.type==='new'&&<BookingForm onClose={close} onSaved={id=>openBooking(id)}/>}
  {dialog?.type==='edit'&&selected&&<BookingForm booking={selected} onClose={()=>openBooking(selected.id)} onSaved={id=>openBooking(id)}/>}
  {dialog?.type==='payment'&&selected&&<PaymentForm booking={selected} intent={dialog.intent} onClose={()=>openBooking(selected.id,'Payments')} onSaved={id=>openBooking(id,'Payments')}/>}
  {dialog?.type==='cancel'&&selected&&<CancellationForm booking={selected} onClose={()=>openBooking(selected.id)} onSaved={id=>openBooking(id,'Pricing')}/>}
  {dialog?.type==='booking'&&selected&&<BookingDrawer key={selected.id+(dialog.tab||'')} booking={selected} initialTab={dialog.tab} onClose={close} onEdit={()=>setDialog({type:'edit',id:selected.id})} onPay={intent=>pay(selected.id,intent)} onCancel={()=>setDialog({type:'cancel',id:selected.id})}/>}
  {dialog?.type==='choose-payment'&&<Overlay title="Choose a booking" onClose={close}><div className="form-body"><label className="field">Record payment against<select value={selectedPaymentId} onChange={e=>setPaymentId(e.target.value)}>{paymentBookings.map(b=><option key={b.id} value={b.id}>{b.id} · {b.name} · {b.resort}</option>)}</select></label></div><div className="form-foot"><Button secondary onClick={close}>Cancel</Button><Button onClick={()=>pay(selectedPaymentId)}>Continue</Button></div></Overlay>}
  {dialog?.type==='about'&&<Overlay title="Help & exports" onClose={close}><div className="form-body"><p className="subtitle">Manage bookings, resort details, availability, payments and guest documents in Hill Horizon Manager.</p><div className="hint">Export downloads a booking snapshot to your computer. It is not a complete database backup. Use Backup & recovery for a complete recovery ZIP.</div><div className="actions">{user?.is_superuser&&<Link className="btn secondary" href="/recovery/">Backup & recovery</Link>}<Button secondary onClick={backup}>Export booking data</Button><Button secondary onClick={()=>void logout()}>Sign out</Button></div></div><div className="form-foot"><Button onClick={close}>Close</Button></div></Overlay>}
  </>;
}

type ListProps = { bookings: Booking[]; onOpen: (id: string, tab?: BookingTab) => void };
function NewButton({ onClick }: { onClick: () => void }) { return <Button onClick={onClick}><Icon name="plus" /> New booking</Button>; }
function BookingTable({ bookings, onOpen }: ListProps) {
  return <><div className="table-wrap desktop-bookings"><table><thead><tr>{['Guest / booking', 'Resort & room', 'Stay dates', 'Guest total', 'Guest balance', 'Status', ''].map((name, i) => <th key={i}>{name}</th>)}</tr></thead><tbody>{bookings.map(b => {
    const s = summary(b); return <tr key={b.id} className="booking-row" onClick={() => onOpen(b.id)}><td><button className="row-link" onClick={e => { e.stopPropagation(); onOpen(b.id); }} aria-label={`Open booking ${b.id} for ${b.name}`}><span className="person"><span className="avatar">{initials(b.name)}</span><span><strong>{b.name}</strong><small className="id">{b.id}</small></span></span></button></td><td><strong>{b.resort}</strong><small>{b.room} · {b.quantity} room(s)</small></td><td><strong>{shortDate(b.checkIn)} – {shortDate(b.checkOut)}</strong><small>{b.stays && b.stays.length > 1 ? b.stays.length+' stays' : nights(b)+' nights'} · {b.guests} guests</small></td><td className="money">{formatMoney(s.guestTotal)}</td><td><strong>{formatMoney(s.guestBalance)}</strong><small>{s.refund ? `${formatMoney(s.refund)} refund due` : 'Payable at resort'}</small></td><td><Tag>{b.status}</Tag></td><td className="arrow">›</td></tr>;
  })}</tbody></table></div><div className="mobile-bookings">{bookings.map(b => <button key={b.id} className="mobile-booking" onClick={() => onOpen(b.id)}><span className="mobile-booking-top"><strong>{b.name}</strong><Tag>{b.status}</Tag></span><span>{b.resort} · {b.room}</span><span>{shortDate(b.checkIn)} – {shortDate(b.checkOut)} · {b.guests} guests</span><span className="mobile-booking-bottom"><span className="id">{b.id}</span><strong>{formatMoney(summary(b).guestTotal)} <span className="arrow">›</span></strong></span></button>)}</div>{!bookings.length && <div className="empty">No bookings match your search.</div>}</>;
}
function exportBookings(bookings: Booking[],owner=true) {
  if(!owner){downloadFile('hill-horizon-guest-bookings.csv',csv([['Booking','Guest','Resort','Check-in','Check-out','Selling total','Guest balance'],...bookings.map(b=>[b.id,b.name,b.resort,b.checkIn,b.checkOut,summary(b).guestTotal/100,summary(b).guestBalance/100])]),'text/csv;charset=utf-8');return;}
  const rows: (string | number)[][] = [['Booking ID', 'Guest', 'Phone', 'Resort', 'Room', 'Check-in', 'Check-out', 'Guests', 'Status', 'Guest total BDT', 'Your earnings BDT', 'Net advance BDT', 'Guest balance BDT', 'Resort payable BDT', 'Resort receivable BDT']];
  bookings.forEach(b => { const s = summary(b); rows.push([b.id, b.name, b.phone, b.resort, b.room, b.checkIn, b.checkOut, b.guests, b.status, s.guestTotal / 100, s.earnings / 100, s.advance / 100, s.guestBalance / 100, s.resortDue / 100, s.resortReceivable / 100]); });
  downloadFile('hill-horizon-bookings.csv', csv(rows), 'text/csv;charset=utf-8');
}
function Bookings({ bookings, onNew, onOpen }: ListProps & { onNew: () => void }) {
  const {user}=useWorkspace();
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('All statuses');
  useEffect(() => { setQuery(new URLSearchParams(window.location.search).get('guest') || ''); }, []);
  const rows = bookings.filter(b => (filter === 'All statuses' || b.status === filter) && [b.name, b.phone, b.id, b.resort, b.room,...(b.stays || []).flatMap(s=>[s.resort,s.room])].join(' ').toLowerCase().includes(query.toLowerCase()));
  return <><Heading title="Every booking. One place." subtitle="From first inquiry to the final settlement." eyebrow="BOOKING DESK"><NewButton onClick={onNew} /></Heading><section className="card"><div className="card-header"><div><h2>All bookings</h2><p>Search a guest, booking ID, resort or phone number.</p></div><Button secondary onClick={() => exportBookings(rows,!!user?.is_superuser)}><Icon name="download" /> Export CSV</Button></div><div className="table-toolbar"><div className="search"><Icon name="search" /><input aria-label="Search bookings" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search bookings…" /></div><select aria-label="Filter booking status" className="filter" value={filter} onChange={e => setFilter(e.target.value)}><option>All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div><BookingTable bookings={rows} onOpen={onOpen} /><div className="table-footer"><span>Showing {rows.length} of {bookings.length} bookings</span></div></section></>;
}

function Today({ bookings, onNew, onOpen }: ListProps & { onNew: () => void }) {
  const {user}=useWorkspace();
  const TODAY=today();
  const live = bookings.filter(b => b.status !== 'Cancelled');
  const confirmed = live.filter(b => b.status === 'Confirmed');
  const totals = bookings.map(summary);
  const cash=cashPosition(bookings);
  const tasks: { id: string; title: string; sub: string; right: string; icon: string }[] = [];
  for (const b of bookings) {
    const s = summary(b);
    if (!['Cancelled', 'Completed'].includes(b.status)) {
      if (['Waiting for reply', 'Available when checked'].includes(b.availability)) tasks.push({ id: b.id, title: 'Check room availability', sub: `${b.name} · ${b.resort}`, right: 'Waiting for resort', icon: 'clock' });
      if (b.expectedAdvance > s.advance) tasks.push({ id: b.id, title: 'Follow up on advance', sub: `${b.name} · ${b.id}`, right: formatMoney(b.expectedAdvance - s.advance), icon: 'clock' });
    }
    if (s.resortDue) tasks.push({ id: b.id, title: 'Transfer resort share', sub: `${b.resort} · ${b.id}`, right: formatMoney(s.resortDue), icon: 'money' });
    if (bookingSettlementAmounts(b).receiveNow && ['Completed', 'Cancelled'].includes(b.status)) tasks.push({ id: b.id, title: 'Receive money from resort', sub: `${b.resort} · ${b.id}`, right: formatMoney(bookingSettlementAmounts(b).receiveNow), icon: 'money' });
    if (s.refund) tasks.push({ id: b.id, title: 'Resolve guest refund', sub: `${b.name} · ${b.id}`, right: formatMoney(s.refund), icon: 'money' });
  }
  const stays = live.filter(b => ['Confirmed', 'Completed'].includes(b.status)).flatMap(b => (b.stays || [b]).filter(stay=>!('cancelled' in stay && stay.cancelled) && (stay.checkIn===TODAY || stay.checkOut===TODAY)).map(stay=>({...b,...stay})));
  return <><Heading title="A little clarity for your day." subtitle="Here’s what’s happening at Hill Horizon today." eyebrow={shortDate(TODAY,true)}><NewButton onClick={onNew} /></Heading>{user?.is_superuser?<div className="stats"><Stat label="Confirmed bookings" value={confirmed.length} foot={`${confirmed.filter(b => (b.stays || [b]).some(stay=>!('cancelled' in stay && stay.cancelled) && stay.checkIn===TODAY)).length} check-ins today`} icon="bookings" /><Stat label="Booking cash in hand" value={formatMoney(cash.cashInHand)} foot={`${formatMoney(cash.pendingEarningsHeld)} pending earnings held until checkout`} /><Stat label="Resort transfers due" value={formatMoney(totals.reduce((s, v) => s + v.resortDue, 0))} foot={`${totals.filter(v => v.resortDue).length} bookings to settle`} icon="arrow" /><Stat label="Your earnings" value={formatMoney(bookings.filter(b => ['Completed', 'Cancelled'].includes(b.status)).reduce((s, b) => s + summary(b).earnings, 0))} foot="Recognized after checkout / cancellation" icon="check" /></div>:<div className="stats"><Stat label="Confirmed bookings" value={confirmed.length} foot="Active confirmed stays" icon="bookings"/><Stat label="Total bookings" value={bookings.length} foot="Your booking workspace" icon="bookings"/><Stat label="Guest balances" value={formatMoney(bookings.reduce((sum,b)=>sum+summary(b).guestBalance,0))} foot="Remaining guest payments"/><Stat label="Arrivals today" value={confirmed.filter(b=>(b.stays||[b]).some(s=>s.checkIn===TODAY)).length} foot="Check-in follow-ups" icon="calendar"/></div>}
    <div className="overview"><section className="card"><div className="card-header"><div><h2>Needs your attention <span className="tag">{tasks.length}</span></h2><p>A few next steps to keep things moving.</p></div></div>{tasks.map((task, i) => <button className="attention-row" key={task.id + task.title} onClick={() => onOpen(task.id)}><span className={'task-icon ' + (i > 1 ? 'teal' : '')}><Icon name={task.icon} /></span><span><strong>{task.title}</strong><small>{task.sub}</small></span><span className="right">{task.right} <span className="arrow">›</span></span></button>)}{!tasks.length && <div className="empty">You’re all caught up.</div>}</section>
      <section className="card"><div className="card-header"><div><h2>Today’s stays</h2><p>Arrivals and departures · {shortDate(TODAY)}</p></div><Link className="link-btn" href="/calendar/">Calendar ↗</Link></div><div className="schedule">{stays.map((b,i) => <div className="stay" key={b.id+':'+i}><div className="stay-time">{b.checkIn === TODAY ? 'CHECK-IN' : 'CHECK-OUT'} · {b.resort}</div><div className="stay-line"><button className="text-button" onClick={() => onOpen(b.id)}>{b.name}</button><Tag>{b.checkIn === TODAY ? 'Arriving' : 'Departing'}</Tag></div><p>{b.room} · {b.guests} guests</p></div>)}{!stays.length && <div className="empty">No arrivals or departures today.</div>}</div></section></div>
    <section className="card"><div className="card-header"><div><h2>Recent bookings</h2><p>Every stay, with the details in one place.</p></div><Link className="link-btn" href="/bookings/">View all bookings ↗</Link></div><BookingTable bookings={bookings.slice(0, 5)} onOpen={onOpen} /><div className="table-footer"><span>Showing {Math.min(5, bookings.length)} of {bookings.length} bookings</span></div></section></>;
}

function Calendar({ bookings, onNew, onOpen }: ListProps & { onNew: () => void }) {
  const TODAY=today();
  const currentPeriod={year:Number(TODAY.slice(0,4)),month:Number(TODAY.slice(5,7))-1};
  const [period, setPeriod] = useState(currentPeriod);
  const first = new Date(Date.UTC(period.year, period.month, 1));
  const offset = (first.getUTCDay() + 6) % 7, count = new Date(Date.UTC(period.year, period.month + 1, 0)).getUTCDate();
  const size = Math.ceil((offset + count) / 7) * 7;
  function move(delta: number) { const value = new Date(Date.UTC(period.year, period.month + delta, 1)); setPeriod({ year: value.getUTCFullYear(), month: value.getUTCMonth() }); }
  return <><Heading title="A clear view of every stay." subtitle="Bookings, holds and manual availability checks." eyebrow="STAY CALENDAR"><NewButton onClick={onNew} /></Heading><div className="hint">This shows Hill Horizon’s records. Verify room availability directly with the resort; an empty date does not mean a room is available.</div><section className="card calendar-card"><div className="card-header"><div className="month-bar"><button aria-label="Previous month" onClick={() => move(-1)}>‹</button><h2>{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><button aria-label="Next month" onClick={() => move(1)}>›</button></div><button className="link-btn" onClick={() => setPeriod(currentPeriod)}>This month</button></div><div className="calendar-inner"><div className="weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day}>{day}</div>)}</div><div className="calendar-grid">{Array.from({ length: size }, (_, i) => {
    const day = new Date(Date.UTC(period.year, period.month, i - offset + 1)), key = day.toISOString().slice(0, 10);
    const events = bookings.filter(b=>b.status!=='Cancelled').flatMap(b=>(b.stays || [b]).filter(stay=>!('cancelled' in stay && stay.cancelled) && key>=stay.checkIn && key<stay.checkOut).map(stay=>({...b,...stay})));
    return <div key={key} className={'cal-day ' + (day.getUTCMonth() !== period.month ? 'dim' : '')}><span className={'day-num ' + (key === TODAY ? 'current' : '')}>{day.getUTCDate()}</span>{events.map((b,i) => <button key={b.id+':'+i} className={'cal-event ' + (b.availability === 'Held' ? 'held' : b.status === 'Inquiry' || b.status === 'Pending confirmation' ? 'inquiry' : '')} onClick={() => onOpen(b.id)} title={`${b.resort} · ${b.room}`} >{b.name}<br />{b.resort}</button>)}</div>;
  })}</div></div><div className="legend"><span><i />Confirmed / completed</span><span><i className="amber" />Inquiry / pending</span><span><i className="purple" />Room hold</span><span>Checkout dates are not occupied nights.</span></div></section></>;
}

function Money({ bookings, onPay, onOpen }: ListProps & { onPay: (id?: string) => void }) {
  const [filter, setFilter] = useState('All transactions');
  const totals = bookings.map(summary);
  const cash=cashPosition(bookings);
  const tx = bookings.flatMap(b => b.transactions.map(t => ({ ...t, booking: b }))).filter(t => filter === 'All transactions' || t.type === filter).sort((a, b) => b.date.localeCompare(a.date));
  function exportTransactions() {
    const rows: (string | number)[][] = [['Booking ID', 'Guest', 'Record ID', 'Stay ID', 'Ledger', 'Date', 'Type', 'Amount BDT', 'Cash impact BDT', 'Method', 'Reference', 'Reverses record', 'Reversed by record', 'Reason / note']];
    tx.forEach(t => rows.push([t.booking.id, t.booking.name, t.id, t.segmentId || '', isExternal(t)?'Direct resort':'Hill Horizon', t.date, t.type, t.amount / 100, cashImpact(t)===null?'':cashImpact(t)!/100, t.method, t.reference, t.reverses || '', t.reversedBy || '', t.note]));
    downloadFile('hill-horizon-transactions.csv', csv(rows), 'text/csv;charset=utf-8');
  }
  return <><Heading title="Know where your money stands." subtitle="Advances, transfers and settlements, connected." eyebrow="MONEY & SETTLEMENTS"><Button onClick={() => onPay()}><Icon name="plus" /> Record payment</Button></Heading><div className="stats"><Stat label="Booking cash in hand" value={formatMoney(cash.cashInHand)} foot={`${formatMoney(cash.pendingEarningsHeld)} pending earnings held until checkout`} /><Stat label="Payable to resorts" value={formatMoney(totals.reduce((s, v) => s + v.resortDue, 0))} foot="After commission retention" icon="arrow" /><Stat label="Receive from resorts" value={formatMoney(bookings.reduce((sum,b)=>sum+bookingSettlementAmounts(b).receiveNow,0))} foot="Remaining agreed resort payments" icon="clock" /><Stat label="Your earnings" value={formatMoney(bookings.filter(b => ['Completed', 'Cancelled'].includes(b.status)).reduce((s, b) => s + summary(b).earnings, 0))} foot="After your discount and referrer share" icon="check" /></div>
    <SettlementQueue bookings={bookings} onOpen={id=>onOpen(id,'Payments')}/>
    <section className="card"><div className="card-header"><div><h2>Transaction history</h2><p>Every recorded movement of money.</p></div><Button secondary onClick={exportTransactions}><Icon name="download" /> Export CSV</Button></div><div className="table-toolbar"><select className="filter" aria-label="Filter transaction type" value={filter} onChange={e => setFilter(e.target.value)}><option>All transactions</option>{TRANSACTION_TYPES.map(t => <option key={t}>{t}</option>)}</select></div><div className="table-wrap"><table><thead><tr>{['Date', 'Transaction', 'Booking', 'Amount', 'Method / reference'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{tx.map(t => <tr className="booking-row" key={t.id} onClick={() => onOpen(t.booking.id, 'Payments')}><td>{shortDate(t.date)}</td><td><button className="row-link" onClick={e => { e.stopPropagation(); onOpen(t.booking.id, 'Payments'); }}><strong>{t.type}{t.reverses?' · Reversal':t.reversedBy?' · Reversed':''}</strong><small>{t.booking.name}</small></button></td><td className="id">{t.booking.id}</td><td className="money">{formatMoney(cashImpact(t) ?? t.amount)}</td><td><strong>{t.method}</strong><small>{t.reference || 'No reference'}</small></td></tr>)}</tbody></table></div>{!tx.length && <div className="empty">No transactions match this filter.</div>}</section></>;
}

function Contacts() {
  const [filter, setFilter] = useState<'Customers' | 'Resorts & rooms'>('Customers');
  return <><Heading title="Familiar people. Useful details." subtitle="Customer history, resort contacts and room categories." eyebrow="YOUR DIRECTORY"/><div className="actions" style={{ marginBottom: 22 }}>{(['Customers', 'Resorts & rooms'] as const).map(t => <Button key={t} secondary={filter !== t} onClick={() => setFilter(t)}>{t}</Button>)}</div>{filter === 'Resorts & rooms' ? <ResortDirectory/> : <CustomerDirectory/>}</>;
}
