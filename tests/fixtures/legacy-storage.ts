import { AVAILABILITY, STATUSES, TRANSACTION_TYPES } from '../../src/lib/types.ts';
import type { Workspace, Booking } from '../../src/lib/types.ts';
import { validateBooking } from '../../src/lib/booking.ts';

export const STORAGE_KEY = 'hill-horizon-next-prototype-v2';
export function validateWorkspace(value: unknown): asserts value is Workspace {
  if (!value || typeof value !== 'object' || (value as Workspace).version !== 2 || !Array.isArray((value as Workspace).bookings)) throw new Error('This is not a compatible prototype backup.');
  const workspace = value as Workspace;
  if (workspace.bookings.length > 1000) throw new Error('The prototype supports up to 1,000 sample bookings.');
  const ids = new Set<string>();
  for (const b of workspace.bookings) {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || ids.has(b.id)) throw new Error('Duplicate or invalid booking ID.');
    ids.add(b.id);
    for (const key of ['name', 'phone', 'resort', 'room', 'checkIn', 'checkOut', 'referrer', 'notes', 'checkedAt', 'checkedWith', 'holdUntil'] as const) {
      if (typeof b[key] !== 'string') throw new Error('Booking details are incomplete.');
    }
    if (!STATUSES.includes(b.status) || !AVAILABILITY.includes(b.availability) || !['stay', 'night'].includes(b.priceBasis)) throw new Error('Invalid booking state.');
    if (!Array.isArray(b.transactions) || !Array.isArray(b.history)) throw new Error('Invalid booking history.');
    const txIds = new Set<string>();
    for (const t of b.transactions) {
      if (!t || typeof t.id !== 'string' || txIds.has(t.id) || !TRANSACTION_TYPES.includes(t.type) || !Number.isSafeInteger(t.amount) || t.amount <= 0 || t.amount > 1_000_000_000) throw new Error('Invalid payment record.');
      txIds.add(t.id);
      for (const field of ['date', 'method', 'reference', 'note'] as const) if (typeof t[field] !== 'string') throw new Error('Incomplete payment details.');
      if (t.proof && (typeof t.proof !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(t.proof) || t.proof.length > 1_100_000)) throw new Error('Invalid payment attachment.');
    }
    for (const entry of b.history) if (!entry || typeof entry.date !== 'string' || typeof entry.text !== 'string') throw new Error('Invalid activity entry.');
    validateBooking(b);
  }
}
export const workspaceOf = (bookings: Booking[]): Workspace => ({ version: 2, bookings });
