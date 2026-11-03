'use client';

import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';

const paths: Record<string, string> = {
  today: 'M3 10l9-7 9 7v10H15v-7H9v7H3z', bookings: 'M7 3h10v4H7z M5 5H3v16h18V5h-2 M7 12h10 M7 16h6',
  calendar: 'M4 5h16v16H4z M7 3v4 M17 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2',
  money: 'M3 5h18v14H3z M16 12h5 M7 9h5 M7 13h2', contacts: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87',
  plus: 'M12 5v14 M5 12h14', search: 'M21 21l-5-5 M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16',
  arrow: 'M5 12h14 M13 6l6 6-6 6', clock: 'M12 8v4l3 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
  check: 'M5 12l4 4L19 6', download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  building: 'M4 21V3h12v18 M16 9h4v12 M8 7h4 M8 11h4 M8 15h4 M3 21h18',
};
export function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.bookings} /></svg>;
}
export function Tag({ children }: { children: string }) { return <span className={'tag ' + children.toLowerCase().split(' ')[0]}>{children}</span>; }
export function Button({ children, onClick, secondary = false, type = 'button', disabled = false }: {
  children: ReactNode; onClick?: () => void; secondary?: boolean; type?: 'button' | 'submit'; disabled?: boolean;
}) { return <button type={type} className={'btn ' + (secondary ? 'secondary' : '')} onClick={onClick} disabled={disabled}>{children}</button>; }
export function Heading({ title, subtitle, eyebrow, children }: { title: string; subtitle: string; eyebrow: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div><div className="actions">{children}</div></div>;
}
export function Stat({ label, value, foot, icon = 'money' }: { label: string; value: string | number; foot: string; icon?: string }) {
  return <div className="stat"><div className="stat-top">{label}<span className="stat-icon"><Icon name={icon} /></span></div><strong>{value}</strong><small>{foot}</small></div>;
}
export function Overlay({ title, onClose, children, drawer = false, heading, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; drawer?: boolean; heading?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeFromKeyboard = useEffectEvent(() => onClose());
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button,input,select,textarea')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeFromKeyboard(); }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select,textarea,a[href]') || []).filter(el => el.offsetParent !== null);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  const section = <section ref={ref} className={drawer ? 'drawer' : 'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
    <div className={drawer ? 'drawer-head' : 'modal-head'}><div>{heading || <h2>{title}</h2>}</div><button type="button" className="close" onClick={onClose} aria-label="Close dialog">×</button></div>{children}
  </section>;
  return <div className="overlay-root"><div className="scrim" onClick={onClose} />{drawer ? section : <div className="modal-wrap">{section}</div>}</div>;
}
export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
