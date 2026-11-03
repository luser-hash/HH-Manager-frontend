export const STATUSES = ['Inquiry', 'Pending confirmation', 'Confirmed', 'Completed', 'Cancelled'] as const;
export const AVAILABILITY = ['Waiting for reply', 'Available when checked', 'Held', 'Verified', 'Unavailable'] as const;
export const TRANSACTION_TYPES = ['Advance received', 'Resort transfer', 'Commission received', 'Customer refund', 'Resort refund', 'Referrer payout', 'Referrer refund', 'Payment fee', 'Guest paid resort', 'Resort refunded guest'] as const;
export type BookingStatus = typeof STATUSES[number];
export type Availability = typeof AVAILABILITY[number];
export type TransactionType = typeof TRANSACTION_TYPES[number];
export type Section = 'today' | 'bookings' | 'calendar' | 'money' | 'contacts' | 'recovery';
export interface Transaction {
  source?: 'hill_horizon' | 'resort'; reverses?: string | null; reversedBy?: string | null;
  segmentId?: string;
  id: string; type: TransactionType; amount: number; date: string;
  method: string; reference: string; note: string; proof?: string;
}
export interface PaymentIntent {segmentId?: string; type?: TransactionType; amount?: number}
export interface Activity { text: string; date: string }
export interface Cancellation { guestCharge: number; supplierCharge: number; referralShare: number; reason: string }
export interface Booking {
  guestSummary?:Record<string,string>;
  record?: import('./api.ts').ApiBooking;
  customerDetails?: {whatsapp?: string; email?: string; acquisition_source?: string};
  apiId?: string; version?: number; customerId?: string; segmentId?: string;
  resortId?: string; roomId?: string; confirmationReference?: string; revisionReason?: string;
  createKey?: string; complex?: boolean; serverSummary?: Record<string, string>;
  stays?: { resort: string; room: string; checkIn: string; checkOut: string; guests: number; cancelled?: boolean }[];
  id: string; name: string; phone: string; resort: string; room: string;
  checkIn: string; checkOut: string; guests: number; quantity: number;
  priceBasis: 'stay' | 'night'; publicUnitPrice: number; resortDiscount: number;
  ownDiscount: number; agreedCommission: number; referralShare: number; referrer: string;
  expectedAdvance: number; status: BookingStatus; availability: Availability;
  checkedAt: string; checkedWith: string; holdUntil: string; notes: string;
  transactions: Transaction[]; history: Activity[]; cancellation?: Cancellation;
}
export interface Workspace { version: 2; bookings: Booking[] }
