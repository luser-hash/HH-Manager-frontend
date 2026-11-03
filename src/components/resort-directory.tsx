'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { loadResortDirectory, request, type ResortRecord, type RoomCategory } from '@/lib/api';
import { useWorkspace } from './workspace';
import { CatalogProfileFields, ProfileDetails } from './catalog-profile';
import { profilePayload } from '@/lib/catalog';
import { Button, Icon, Overlay, Tag } from './ui';

type Dialog = {kind: 'resort'; record?: ResortRecord; edit: boolean}
  | {kind: 'room'; record?: RoomCategory; resort: ResortRecord; edit: boolean}
  | {kind: 'archive'; record: ResortRecord | RoomCategory; resource: 'resorts' | 'rooms'};
const resortFields = [
  ['name', 'Resort name', 150], ['location', 'Location', 200],
  ['contact_name', 'Contact person', 150], ['phone', 'Contact phone', 40],
] as const;
const resortTextFields = [['address', 'Address'], ['policies', 'Policies'], ['payment_terms', 'Payment terms'], ['notes', 'Internal notes']] as const;
const messageOf = (e: unknown) => e instanceof Error ? e.message : 'Could not complete the request.';

export function ResortDirectory() {
  const {user, refresh, notify} = useWorkspace();
  const [data, setData] = useState<{resorts: ResortRecord[]; rooms: RoomCategory[]}>({resorts: [], rooms: []});
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [status, setStatus] = useState('active');
  const [mode, setMode] = useState('resorts'), [parent, setParent] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const generation = useRef(0);
  const can = (permission: string) => !!user?.permissions.includes(`resorts.${permission}`);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setError('');
    try { const result = await loadResortDirectory(); if (version === generation.current) setData(result); }
    catch (e) { if (version === generation.current) setError(messageOf(e)); throw e; }
    finally { if (version === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { void reload().catch(() => {}); return () => { generation.current++; }; }, [reload]);
  const close = useCallback(() => setDialog(null), []);
  async function saved() {
    await reload();
    await refresh();
    notify('Resort directory saved.');
    close();
  }
  function matches(record: ResortRecord | RoomCategory, text: string) {
    return (status === 'all' || record.is_archived === (status === 'archived')) && text.toLowerCase().includes(query.trim().toLowerCase());
  }
  const resorts = data.resorts.filter(r => matches(r, [r.name, r.location, r.address, r.contact_name, r.phone].join(' ')));
  const rooms = data.rooms.filter(r => (!parent || r.resort === parent) && matches(r, [r.name, r.bed_description, r.notes, data.resorts.find(p => p.id === r.resort)?.name].join(' ')));
  return <section className="card resort-directory">
    <div className="card-header"><div><h2>Resorts & room categories</h2><p>Contacts, occupancy, policies and payment terms.</p></div><div className="actions">
      {can('add_resort') && <Button onClick={() => setDialog({kind: 'resort', edit: true})}>Add resort</Button>}
      {can('add_roomcategory') && <Button secondary disabled={!data.resorts.some(r => !r.is_archived)} onClick={() => setDialog({kind: 'room', resort: data.resorts.find(r => !r.is_archived)!, edit: true})}>Add room category</Button>}
    </div></div>
    <div className="table-toolbar directory-toolbar">
      <div className="search"><Icon name="search"/><input aria-label="Search resorts and rooms" placeholder="Search names, contacts or rooms…" value={query} onChange={e => setQuery(e.target.value)}/></div>
      <select className="filter" aria-label="Directory type" value={mode} onChange={e => setMode(e.target.value)}><option value="resorts">Resorts</option><option value="rooms">Room categories</option></select>
      <select className="filter" aria-label="Archive status" value={status} onChange={e => setStatus(e.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All records</option></select>
      {mode === 'rooms' && <select className="filter" aria-label="Filter rooms by resort" value={parent} onChange={e => setParent(e.target.value)}><option value="">All resorts</option>{data.resorts.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
      <Button secondary disabled={loading} onClick={() => void reload().catch(() => {})}>Refresh</Button>
    </div>
    {error ? <div className="empty error" role="alert">{error}</div> : loading ? <div className="empty" role="status">Loading resort directory…</div> : <>
      <div className="table-wrap"><table><thead><tr>{(mode === 'resorts' ? ['Resort', 'Contact', 'Room categories', 'Status', ''] : ['Room category', 'Resort', 'Occupancy / beds', 'Status', '']).map((label, i) => <th key={i}>{label}</th>)}</tr></thead><tbody>
        {mode === 'resorts' ? resorts.map(r => <tr key={r.id}><td><strong>{r.name}</strong><small>{r.location || 'Location not added'}</small></td><td><strong>{r.contact_name || 'Contact not added'}</strong><small>{r.phone}</small></td><td>{data.rooms.filter(room => room.resort === r.id && !room.is_archived).length} active</td><td><Tag>{r.is_archived ? 'Archived' : 'Active'}</Tag></td><td><Button secondary onClick={() => setDialog({kind: 'resort', record: r, edit: false})}>View details</Button></td></tr>) : rooms.map(r => {
          const resort = data.resorts.find(p => p.id === r.resort);
          return <tr key={r.id}><td><strong>{r.name}</strong></td><td><strong>{resort?.name}</strong>{resort?.is_archived && <small>Resort archived</small>}</td><td>{r.max_occupancy} guests<small>{r.bed_description || 'Beds not added'}</small></td><td><Tag>{r.is_archived ? 'Archived' : 'Active'}</Tag></td><td><Button secondary onClick={() => resort && setDialog({kind: 'room', record: r, resort, edit: false})}>View details</Button></td></tr>;
        })}
      </tbody></table></div>
      {!(mode === 'resorts' ? resorts : rooms).length && <div className="empty">No {mode === 'resorts' ? 'resorts' : 'room categories'} match these filters.</div>}
      <div className="table-footer">Showing {(mode === 'resorts' ? resorts : rooms).length} records · Archived resorts and rooms are excluded from new booking choices.</div>
    </>}
    {dialog && <DirectoryDialog key={dialog.kind + ('record' in dialog ? dialog.record?.id || 'new' : '') + ('edit' in dialog ? dialog.edit : '')} dialog={dialog} resorts={data.resorts} rooms={data.rooms} can={can} onChange={setDialog} onClose={close} onSaved={saved}/>}
  </section>;
}

function DirectoryDialog({dialog, resorts, rooms, can, onChange, onClose, onSaved}: {
  dialog: Dialog; resorts: ResortRecord[]; rooms: RoomCategory[]; can: (permission: string) => boolean;
  onChange: (dialog: Dialog) => void; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [committed, setCommitted] = useState(false);
  const lock = useRef(false);
  const {user}=useWorkspace();
  const pricingAllowed=!!user?.is_superuser;
  const record = dialog.record;
  const resource = dialog.kind === 'archive' ? dialog.resource : dialog.kind === 'resort' ? 'resorts' : 'rooms';
  const model = resource === 'resorts' ? 'resort' : 'roomcategory';
  const close = useCallback(() => { if (!lock.current) onClose(); }, [onClose]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || committed) return;
    const form = new FormData(event.currentTarget);
    let payload: Record<string, unknown>;
    if (dialog.kind === 'archive') payload = {is_archived: !dialog.record.is_archived};
    else if (dialog.kind === 'resort') payload = Object.fromEntries([...resortFields.map(([key]) => key), ...resortTextFields.filter(([key])=>pricingAllowed||!['payment_terms','notes'].includes(key)).map(([key]) => key)].map(key => [key, String(form.get(key) || '').trim()]));
    else payload = {resort: record ? dialog.resort.id : String(form.get('resort')), name: String(form.get('name') || '').trim(), max_occupancy: Number(form.get('max_occupancy')), bed_description: String(form.get('bed_description') || '').trim(), ...(pricingAllowed?{notes:String(form.get('notes') || '').trim()}:{})};
    if(dialog.kind!=='archive')payload={...payload,...profilePayload(form,dialog.kind,pricingAllowed)};
    lock.current = true; setBusy(true); setError('');
    let persisted = false;
    try {
      await request(`/api/v1/${resource}/${record ? record.id + '/' : ''}`, record ? 'PATCH' : 'POST', payload);
      persisted = true; setCommitted(true); await onSaved();
    } catch (e) { setError((persisted ? 'Saved successfully, but the workspace could not refresh. Close this dialog and refresh. ' : '') + messageOf(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  if (dialog.kind === 'archive') {
    const restoring = dialog.record.is_archived;
    return <Overlay title={`${restoring ? 'Restore' : 'Archive'} ${dialog.record.name}`} onClose={close}><form onSubmit={submit}><div className="form-body"><p>{restoring ? 'Make this record available again?' : 'Remove this record from new booking choices? Existing bookings and historical records are preserved.'}</p>{resource === 'resorts' && <p>Room categories keep their own archive status. Restoring the resort makes its active categories available again.</p>}{error && <p className="error" role="alert">{error}</p>}</div><div className="form-foot"><Button secondary disabled={busy} onClick={close}>Close</Button><Button type="submit" disabled={busy || committed}>{busy ? 'Saving…' : restoring ? 'Restore' : 'Archive'}</Button></div></form></Overlay>;
  }
  if (dialog.edit) return <Overlay title={`${record ? 'Edit' : 'Add'} ${dialog.kind === 'resort' ? 'resort' : 'room category'}`} onClose={close}><form onSubmit={submit}><div className="form-body"><fieldset className="directory-fields" disabled={busy || committed}><div className="form-grid">
    {dialog.kind === 'resort' ? <>
      {resortFields.map(([key, label, max]) => <label className="field" key={key}>{label}<input name={key} type={key === 'phone' ? 'tel' : 'text'} required={key === 'name'} maxLength={max} defaultValue={dialog.record?.[key] || ''}/></label>)}
      {resortTextFields.filter(([key])=>pricingAllowed||!['payment_terms','notes'].includes(key)).map(([key, label]) => <label className="field full" key={key}>{label}<textarea name={key} rows={3} defaultValue={dialog.record?.[key] || ''}/></label>)}
    </> : <>
      <label className="field full">Resort<select name="resort" defaultValue={dialog.resort.id} disabled={!!record} required>{(record ? resorts.filter(r => r.id === dialog.resort.id) : resorts.filter(r => !r.is_archived)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="field">Category name<input name="name" required maxLength={150} defaultValue={dialog.record?.name || ''}/></label>
      <label className="field">Maximum guests per room<input name="max_occupancy" type="number" min={1} max={100} step={1} required defaultValue={dialog.record?.max_occupancy || 2}/></label>
      <label className="field full">Bed description<input name="bed_description" maxLength={200} defaultValue={dialog.record?.bed_description || ''}/></label>
      {pricingAllowed&&<label className="field full">Internal notes<textarea name="notes" rows={3} defaultValue={dialog.record?.notes || ''}/></label>}
    </>}
    <CatalogProfileFields kind={dialog.kind} record={dialog.record} pricingAllowed={pricingAllowed}/>
  </div></fieldset>{error && <p className="error" role="alert">{error}</p>}</div><div className="form-foot"><Button secondary disabled={busy} onClick={close}>Close</Button><Button type="submit" disabled={busy || committed}>{busy ? 'Saving…' : 'Save changes'}</Button></div></form></Overlay>;
  const detail = record!;
  const parent = dialog.kind === 'room' ? dialog.resort : undefined;
  const parentArchived = !!parent?.is_archived;
  return <Overlay title={detail.name} onClose={close} drawer><div className="drawer-body">
    <div className="actions"><Tag>{detail.is_archived ? 'Archived' : 'Active'}</Tag>{can(`change_${model}`) && <><Button secondary onClick={() => onChange({...dialog, edit: true})}>Edit details</Button>{!(detail.is_archived && parentArchived) && <Button secondary onClick={() => onChange({kind: 'archive', record: detail, resource})}>{detail.is_archived ? 'Restore' : 'Archive'}</Button>}</>}</div>
    {dialog.kind === 'resort' ? <>
      <dl className="directory-details">{[...resortFields, ...resortTextFields].filter(([key]) => key !== 'name'&&(pricingAllowed||!['payment_terms','notes'].includes(key))).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{dialog.record?.[key] || 'Not added'}</dd></div>)}</dl>
      <section className="section-card"><h3>Arrival & resort information</h3><ProfileDetails kind="resort" record={dialog.record}/></section><section className="section-card"><div className="card-header"><h3>Room categories</h3>{can('add_roomcategory') && !detail.is_archived && <Button secondary onClick={() => onChange({kind: 'room', resort: dialog.record!, edit: true})}>Add category</Button>}</div>
      {rooms.filter(r => r.resort === detail.id).map(r => <div className="directory-room" key={r.id}><div><strong>{r.name}</strong><p>{r.max_occupancy} guests · {r.is_archived ? 'Archived' : 'Active'}</p></div><Button secondary onClick={() => onChange({kind: 'room', record: r, resort: dialog.record!, edit: false})}>View</Button></div>)}
      {!rooms.some(r => r.resort === detail.id) && <p>No room categories yet.</p>}</section>
    </> : <><dl className="directory-details"><div><dt>Resort</dt><dd>{dialog.resort.name}{parentArchived ? ' (archived)' : ''}</dd></div><div><dt>Maximum occupancy</dt><dd>{dialog.record?.max_occupancy} guests per room</dd></div><div><dt>Beds</dt><dd>{dialog.record?.bed_description || 'Not added'}</dd></div>{pricingAllowed&&<div><dt>Internal notes</dt><dd>{dialog.record?.notes || 'Not added'}</dd></div>}</dl><section className="section-card"><h3>Room experience & inclusions</h3><ProfileDetails kind="room" record={dialog.record}/></section><section className="section-card"><h3>Saved booking defaults</h3><ProfileDetails kind="room" record={dialog.record} rates/></section>{parentArchived && <p className="hint">Restore the resort before restoring a room category or using it for new bookings.</p>}<Button secondary onClick={() => onChange({kind: 'resort', record: dialog.resort, edit: false})}>View resort policies & payment terms</Button></>}
  </div></Overlay>;
}
