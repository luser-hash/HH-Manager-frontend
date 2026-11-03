'use client';
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Booking } from '@/lib/types';
import { ApiError, today, loadBookings, loadCatalog, login as signIn, logout as signOut, persistBooking, request, type Customer, type Resort, type User } from '@/lib/api';
type WorkspaceContext = {
  bookings: Booking[]; resorts: Resort[]; customers: Customer[]; user: User | null;
  ready: boolean; saving: boolean; problem: string;
  saveBooking: (booking: Booking) => Promise<string>; refresh: () => Promise<void>;
  mutate: <T>(operation: () => Promise<T>) => Promise<T>;
  logout: () => Promise<void>; notify: (message: string) => void;
};
const Context = createContext<WorkspaceContext | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [bookings,setBookings] = useState<Booking[]>([]), [resorts,setResorts] = useState<Resort[]>([]), [customers,setCustomers] = useState<Customer[]>([]);
  const [user,setUser] = useState<User|null>(null), [ready,setReady] = useState(false), [checking,setChecking] = useState(true), [saving,setSaving] = useState(false);
  const [problem,setProblem] = useState(''), [message,setMessage] = useState('');
  const lock = useRef(false);
  const synchronizedDay=useRef(today());
  async function refresh(currentUser:User|null=user) {
    try {
      const catalog = await loadCatalog();
      const records = await loadBookings(catalog.resorts,catalog.customers,!!currentUser?.is_superuser);
      setResorts(catalog.resorts); setCustomers(catalog.customers); setBookings(records); setProblem(''); setReady(true); synchronizedDay.current=today();
    } catch(e) {
      if (e instanceof ApiError && e.status === 403) { setUser(null); setBookings([]); setResorts([]); setCustomers([]); setReady(false); }
      setProblem(e instanceof Error ? e.message : 'Could not load bookings.'); throw e;
    }
  }
  useEffect(() => {
    void (async () => {
      try { const me = await request<User>('/api/v1/auth/me/'); setUser(me); await refresh(me); }
      catch(e) { if (!(e instanceof ApiError && e.status === 403)) setProblem(e instanceof Error ? e.message : 'Cannot connect.'); }
      finally {setChecking(false);}
    })();
  },[]);
  useEffect(()=>{
    if(!user)return;
    const catchUp=()=>{if(!lock.current&&synchronizedDay.current!==today())void refresh(user).catch(()=>{});};
    const timer=setInterval(catchUp,60000);
    document.addEventListener('visibilitychange',catchUp);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',catchUp);};
  },[user?.id]);
  useEffect(() => { if (!message) return; const timer=setTimeout(()=>setMessage(''),5000); return ()=>clearTimeout(timer); },[message]);
  async function saveBooking(booking: Booking) {
    if (lock.current) throw new Error('A save is already in progress.');
    if (problem || !ready) throw new Error('Refresh the workspace before saving.');
    lock.current=true; setSaving(true);
    try { const id = await persistBooking(booking,bookings.find(b=>b.id===booking.id),resorts,customers); await refresh(); return id; }
    catch(e) { try { await refresh(); } catch { /* refresh exposes the connection error */ } throw e; }
    finally {lock.current=false;setSaving(false);}
  }
  async function mutate<T,>(operation: () => Promise<T>): Promise<T> {
    if (lock.current) throw new Error('A save is already in progress.');
    if (problem || !ready) throw new Error('Refresh the workspace before saving.');
    lock.current = true; setSaving(true); let committed = false;
    try { const result = await operation(); committed = true; await refresh(); return result; }
    catch(e) { if (committed) throw new Error('Saved successfully, but the workspace could not refresh. Close this dialog and refresh before making another change.'); setMessage(e instanceof Error ? e.message : 'The change could not be saved.'); try { await refresh(); } catch {} throw e; }
    finally { lock.current = false; setSaving(false); }
  }
  async function logout() {
    try {await signOut();setUser(null);setBookings([]);setResorts([]);setCustomers([]);setReady(false);setProblem('');}
    catch(e) {setMessage(e instanceof Error ? e.message : 'Could not sign out.');}
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(saving) return; const form=new FormData(event.currentTarget); setSaving(true); setProblem('');
    try {const me=await signIn(String(form.get('username')),String(form.get('password')));setUser(me);await refresh(me);}
    catch(e) {setProblem(e instanceof Error ? e.message : 'Sign-in failed.');}
    finally {setSaving(false);}
  }
  return <Context.Provider value={{bookings,resorts,customers,user,ready,saving,problem,refresh,logout,saveBooking,mutate,notify:setMessage}}>
    {checking ? <div className="auth-screen" role="status">Connecting to Hill Horizon Manager…</div> : !user ? <div className="auth-screen"><form className="auth-card" onSubmit={submit}><img src="/assets/logo.png" alt="Hill Horizon Tours & Travels" /><h1>Welcome back.</h1><p>Sign in with your Django account.</p><label className="field">Username<input name="username" autoComplete="username" required /></label><label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>{problem && <p className="error" role="alert">{problem}</p>}<button className="btn" disabled={saving} type="submit">{saving ? 'Signing in…' : 'Sign in'}</button><small>Start Django on port 8000 and this frontend on port 3000. No demo bookings are loaded.</small></form></div> : children}
    <div id="toast" className={message ? 'show' : ''} role="status" aria-live="polite">{message}</div>
  </Context.Provider>;
}
export function useWorkspace() { const context=useContext(Context); if(!context) throw new Error('Workspace provider is missing.'); return context; }
