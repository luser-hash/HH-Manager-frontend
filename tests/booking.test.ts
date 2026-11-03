import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary, parseMoney, validateBooking, validateTransaction, csv } from '../src/lib/booking.ts';
import { sampleBookings, SAMPLE_DATE } from './fixtures/bookings.ts';
import { validateWorkspace } from './fixtures/legacy-storage.ts';

test('discount and optional referrer share reduce earnings separately', () => {
  const b = sampleBookings()[5];
  assert.equal(summary(b).guestTotal, 600000);
  assert.equal(summary(b).earnings, 50000);
  assert.equal(summary(b).held, 50000);
  assert.equal(summary(b).resortDue, 0);
  assert.equal(summary(b).guestBalance, 0);
  b.referralShare = 0;
  assert.equal(summary(b).earnings, 100000);
});
test('resort-funded discounts do not reduce Hill Horizon earnings', () => {
  const b = sampleBookings()[0];
  const before = summary(b);
  b.resortDiscount = 50000;
  assert.equal(summary(b).earnings, before.earnings);
  assert.equal(summary(b).guestTotal, before.guestTotal - 50000);
});
test('money uses exact paisa and rejects excess precision', () => {
  assert.equal(parseMoney('123.45'), 12345);
  assert.equal(parseMoney('0.10') + parseMoney('0.20'), 30);
  assert.throws(() => parseMoney('12.345'));
});
test('direct resort payments create the correct commission receivable', () => {
  assert.equal(summary(sampleBookings()[4]).resortReceivable, 100000);
});
test('cancellation records explicit final charges and refunds', () => {
  const b = sampleBookings()[0];
  b.status = 'Cancelled';
  b.cancellation = { guestCharge: 100000, supplierCharge: 50000, referralShare: 0, reason: 'Agreed cancellation' };
  validateBooking(b);
  assert.equal(summary(b).refundFromHH, 200000);
  assert.equal(summary(b).supplierEntitlement, 50000);
  assert.equal(summary(b).earnings, 50000);
});
test('overpayments and corrupt backups are rejected', () => {
  const b = sampleBookings()[0];
  assert.throws(() => validateTransaction(b, { id: 'new', type: 'Resort transfer', amount: 99999999, date: SAMPLE_DATE, method: 'Bank', reference: '', note: '' }, SAMPLE_DATE));
  assert.throws(() => validateWorkspace({ version: 2, bookings: [{ id: 'bad' }] }));
  validateWorkspace({ version: 2, bookings: sampleBookings() });
});
test('CSV escapes formulas in user-entered text', () => {
  assert.ok(csv([['=1+1']]).includes("'=1+1"));
});
