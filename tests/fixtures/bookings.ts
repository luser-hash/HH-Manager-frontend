import type { Booking, Transaction } from '../../src/lib/types.ts';

export const SAMPLE_DATE = '2026-10-26';
export const RESORTS = [
  { name: 'De Jure Resort', rooms: ['Premium Batighor', 'JhumGhor', 'Taabu'] },
  { name: 'River Hill Lama', rooms: ['Riverview PodHouse', 'Riverview JhumGhor', 'Riverside Taabu'] },
  { name: 'Mirinja Laa Tong Valley', rooms: ['Surjo Digol Bari', 'Chile Kothar Sepai', 'Chander Bari Premium'] },
  { name: 'Cloudy Inn Resort', rooms: ['Standard Couple Room', 'Deluxe Couple Room', 'Premium Family Room'] },
];
const tx = (id: string, type: Transaction['type'], amount: number, date: string): Transaction => ({ id, type, amount: amount * 100, date, method: 'bKash', reference: 'DEMO-' + id, note: '' });
const base: Booking = {
  id: '', name: '', phone: '01XXXXXXXXX', resort: '', room: '', checkIn: SAMPLE_DATE, checkOut: '2026-10-27',
  guests: 2, quantity: 1, priceBasis: 'stay', publicUnitPrice: 0, resortDiscount: 0, ownDiscount: 0,
  agreedCommission: 0, referralShare: 0, referrer: '', expectedAdvance: 0, status: 'Confirmed',
  availability: 'Verified', checkedAt: '2026-10-24T15:30', checkedWith: 'Demo reservation desk',
  holdUntil: '', notes: '', transactions: [], history: [{ text: 'Sample booking created', date: '2026-10-24' }],
};
export function sampleBookings(): Booking[] {
  const bookings: Booking[] = [
    { ...base, id: 'HH-1048', name: 'Arif Rahman', resort: 'De Jure Resort', room: 'Premium Batighor', guests: 4,
      checkOut: '2026-10-28', publicUnitPrice: 1300000, ownDiscount: 100000, agreedCommission: 300000,
      transactions: [tx('1001', 'Advance received', 3000, '2026-10-24')], notes: 'Fictional family stay. Follow up on resort transfer.' },
    { ...base, id: 'HH-1047', name: 'Nadia Islam', resort: 'River Hill Lama', room: 'Riverview PodHouse',
      checkIn: '2026-10-27', checkOut: '2026-10-28', publicUnitPrice: 700000, agreedCommission: 150000,
      expectedAdvance: 200000, status: 'Pending confirmation', availability: 'Held', holdUntil: '2026-10-26T18:00',
      notes: 'Fictional booking. Follow up on advance before the hold expires.' },
    { ...base, id: 'HH-1046', name: 'Tanvir Ahmed', resort: 'Mirinja Laa Tong Valley', room: 'Chander Bari Premium',
      guests: 6, publicUnitPrice: 950000, ownDiscount: 50000, agreedCommission: 230000,
      transactions: [tx('1002', 'Advance received', 3000, '2026-10-23'), tx('1003', 'Resort transfer', 1200, '2026-10-24')] },
    { ...base, id: 'HH-1045', name: 'Sadia Chowdhury', resort: 'Cloudy Inn Resort', room: 'Premium Family Room',
      checkIn: '2026-10-30', checkOut: '2026-11-01', guests: 4, publicUnitPrice: 1400000, agreedCommission: 250000,
      status: 'Inquiry', availability: 'Waiting for reply', checkedAt: '', checkedWith: '', notes: 'Verify availability and weekend rate.' },
    { ...base, id: 'HH-1044', name: 'Rafiq Hasan', resort: 'River Hill Lama', room: 'Riverview JhumGhor',
      checkIn: '2026-10-24', checkOut: SAMPLE_DATE, guests: 3, publicUnitPrice: 1000000, agreedCommission: 250000,
      status: 'Completed', transactions: [tx('1004', 'Advance received', 1500, '2026-10-21'), tx('1005', 'Guest paid resort', 8500, SAMPLE_DATE)],
      notes: 'Fictional completed stay. Remaining commission is receivable from resort.' },
    { ...base, id: 'HH-1043', name: 'Farhana Akter', resort: 'De Jure Resort', room: 'JhumGhor',
      checkIn: '2026-10-23', checkOut: '2026-10-24', publicUnitPrice: 650000, ownDiscount: 50000,
      agreedCommission: 150000, referralShare: 50000, referrer: 'Demo referrer', status: 'Completed',
      transactions: [tx('1006', 'Advance received', 2000, '2026-10-20'), tx('1007', 'Resort transfer', 1000, '2026-10-21'),
        tx('1008', 'Referrer payout', 500, '2026-10-22'), tx('1009', 'Guest paid resort', 4000, '2026-10-24')],
      notes: 'Discount came from Hill Horizon’s margin. Referral share is optional.' },
  ];
  return bookings.map(b => structuredClone(b));
}
export const emptyBooking = (): Booking => ({ ...structuredClone(base), id: '', status: 'Inquiry', resort: RESORTS[0].name,
  room: RESORTS[0].rooms[0], availability: 'Waiting for reply', checkedAt: '', checkedWith: '', history: [] });
