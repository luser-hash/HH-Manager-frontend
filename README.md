# Hill Horizon Manager — Next.js + Django

The frontend uses the existing Django booking API and database. No sample bookings or hardcoded resorts are loaded. Old prototype browser data is ignored and is never uploaded to Django.

## Run locally

Start or restart Django in one PowerShell terminal:

```powershell
Set-Location 'D:\Hill Horizon Manager\HH Manager backend'
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Start or restart Next.js in another terminal:

```powershell
Set-Location 'D:\Hill Horizon Manager\HH Manager frontend'
npm run dev
```

Open http://127.0.0.1:3000 and sign in with your existing Django account. Both terminals must remain running. No hosting or paid services are needed. Use `npm ci` if dependencies have not been installed. To create an account when setting up a fresh backend, run `manage.py createsuperuser` in its environment; no default credentials are bundled.

The database currently starts empty. Use **Contacts → Resorts & rooms → Add resort**, add room categories, then **Bookings → New booking**. Django stores the customer, stay, rates, discounts, optional referrer share and required advance. Record received money under Payments. To confirm, enter **Verified**, who replied, the reply time and the supplier confirmation reference, then choose **Confirmed**. Backend rules and permissions remain enforced.

## Connected functions

- Session login/logout with CSRF protection; passwords and session tokens are not kept in local storage.
- Paginated bookings, customers, resorts and rooms from Django.
- Customer directory under **Contacts → Customers** with create/search/edit/archive/restore, phone/email/WhatsApp/source/notes, and booking/payment history linked by customer UUID. History includes archived bookings, guest payments/refunds, direct resort payments and reversals, subject to existing booking/financial permissions.
- New booking saves resolve customers on the backend by normalized phone, creating a customer only when absent. Select an existing customer explicitly when phones are shared. Optional email, WhatsApp and source fields are copied to newly created customers. Existing profiles are preserved; archived matches must be restored. Customer and booking creation commit together, so a failed booking leaves no extra customer. The existing confirmation workflow keeps this same customer.
- Resort and room-category directory with search, active/archived/all filters, details, create/edit, archive and restore. Manage resort location/address, contact person/phone, policies/payment terms/notes, and room occupancy/beds/notes. Controls follow Django add/change permissions. Archived resorts and categories remain in the directory and existing booking history but are excluded from new booking choices. Restore a resort before restoring its archived categories.
- Complete booking creation and editing with multiple resort stays, separate dates/guest counts, multiple room categories/quantities, optional identified-room assignments, meal lines and additional charges. Versioned amendments preserve paid stay IDs and save guest details, notes and pricing together.
- Live per-line, per-stay and whole-booking pricing in BDT: unit/night multipliers, both funding sources for discounts, commission, referrer share, guest total, Hill Horizon earnings and resort entitlement. Saved pricing and settlement balances come from Django.
- Per-stay supplier responses and a backend confirmation checklist showing unagreed prices, missing supplier evidence, capacity warnings, advance outstanding and identified-room conflicts. Amendments return to pending and require fresh verification; authorized overrides retain backend permission/reason checks.
- Availability checks, supplier confirmation, booking status transitions and explicit cancellation settlements.
- Advances, resort transfers, commission receipts, referrer payments, fees, refunds and direct guest-to-resort payment records.
- **Payments** inside a booking now shows settlement blockers, per-stay referrer shares/paid amounts/payouts/recoveries, split guest refunds, and resort balances. Quick actions preselect the stay, transaction type and available amount; partial payments remain possible.
- Incorrect cash or direct-resort records can be reversed with a required reason. Original records and linked reversal records remain visible, with corrected balances and direction. Corrections use stable idempotency keys; refunds record actual money returned after a cancellation or price amendment.
- Completed/cancelled bookings with every guest, resort and referrer balance cleared can be closed from **Payments → Close settlement**. Closed settlements block posting, corrections and amendments; users with close-booking permission can reopen with a reason. **Money** includes open, ready-to-close and closed settlement filters.
- Django financial summaries, transaction reversals, audit timeline and issued PDF quotations/vouchers/invoices/cancellation summaries.
- **Documents** now manages each stay's saved policy and acknowledgement (person/time). Load current resort terms for review or enter agreed booking-specific terms with a reason. A policy change clears its acknowledgement and flags earlier PDFs; resort-wide edits remain separate in **Contacts → Resorts & rooms**.
- Issue payment/refund receipts against an original, unreversed Hill Horizon guest transaction. Download current PDFs or explicitly download historical revisions. Voided PDFs cannot be downloaded; reversed-source receipts are clearly flagged.
- Record manual document delivery with channel, recipient, Dhaka time and note, and view its history. Downloading does not mark a document sent, and recording delivery sends no external message. Delivery retries use an idempotency key to avoid duplicate records.
- Current Dhaka dates, loading/error/retry states, CSV downloads and JSON booking exports.

**Refresh** reloads database records after changes made elsewhere; each successful save also reloads from Django. A failed multi-step workflow reloads confirmed server state. Stale versions show a conflict instead of overwriting another team member's changes.

Use **Bookings → New booking** to add stays and charge lines. An empty unit price means the price is not agreed; enter an explicit zero for an agreed free service. Commission and discounts are totals per line; a referrer share is a total per stay. After saving, open **Details** to record the supplier response for every stay, submit the inquiry, review the checklist and confirm. **Edit rooms, stays & charges** saves an amendment with a reason. Paid stays cannot be removed or reassigned to another resort; use **Cancel booking** to settle the whole booking or a selected stay. Previously cancelled stays retain their charges and history.

Payments now select the stay they apply to, including multi-stay bookings. Price reductions can create refund balances. A stale editor requires reopening with the latest data before saving. Payment-proof uploads are not exposed because the current API has no attachment endpoint. Google Sheets import and automatic offline sync are separate work.

## Local copies and recovery

**Export & help → Export booking data** downloads a snapshot of loaded bookings, transactions and history. CSV exports are also available. These are exports, not a full database recovery format; browser prototype JSON restore was removed to prevent demo data entering the live database.

Owner administrators can open **Backup & recovery** to see the latest copy, create a complete recovery ZIP and download it. ZIPs include the database, backend/frontend source, renderer assets and media; keep deployment secrets separately. Upload a trusted ZIP to review compatibility and record counts, then prepare using your password, reason and exact confirmation phrase. Stop Django and all workers before running the displayed offline restore command. It creates a fresh safety copy and signs out restored sessions.

See the backend [recovery guide](../HH%20Manager%20backend/docs/RECOVERY.md) for recovery on a new installation, configuration and limits. `manage.py backup_complete` creates the same archive from the command line. Local copies are not automatically synchronized to offsite storage.

## Configuration and checks

Next.js proxies `/api/` to Django at `http://127.0.0.1:8000`. Copy `.env.example` to `.env.local` to change `DJANGO_API_ORIGIN`; restart Next.js afterward. Keep the origin server-side. Django development settings trust frontend origins `http://127.0.0.1:3000` and `http://localhost:3000` for CSRF. Other ports or deployment domains require explicit trusted-origin configuration.

Apply backend migrations (`.\.venv\Scripts\python.exe manage.py migrate` in the backend folder) before using automatic customer creation. Customer migration `0002` adds phone lookup locking and refreshes normalized search values while preserving existing customer records.

Document migration `0003` adds a nullable unique delivery request key, preserving existing sent records. Apply it before using the new document delivery workflow.

```powershell
npm test
npm run typecheck
npm run build
npm start
```

`npm start` serves a production build; Django must also run. The API proxy requires a Next.js server, so the former static `out/` export is no longer used. Fonts and the official logo remain local. Fixtures exist only under `tests/fixtures/`; the application never loads them.


## Detailed resort and room profiles

In **Contacts → Resorts & rooms**, edit each resort and category once. Resort profiles now hold reservation email/WhatsApp, website and map links, check-in/out times, facilities, meal information, child/cancellation terms and directions, alongside the existing address, contacts, policies and supplier payment terms.

Room categories hold descriptions, size, view/balcony, bathroom, beds, included and maximum occupancy, extra guests/beds and reference fees, facilities, inclusions/exclusions, meals and room-specific policies. Saved public rates can be per room per night or for the whole stay. Commission defaults can be a fixed amount per room/pricing unit or a percentage of the public line total. Rate validity covers occupied nights, excluding checkout day. Leave a rate blank when it needs a fresh quote; an explicit zero means an agreed free room.

Selecting a room in a new booking copies its description and fills the saved rate and calculated commission. Automatic commission totals follow quantity and nights; editing a price or commission makes that field manual. **Load current room defaults** deliberately replaces that line's price, commission, description and discounts with current catalog values. Review rate notes for weekend, seasonal or special-date exceptions; there is no automatic seasonal/weekend rate engine. Extra-bed prices are references, not automatic charges: add a separate extra line when agreed.

Expand selected resort/room information in the editor to review copied details. Saved bookings show frozen room and resort profiles under **Details**, and new PDFs include guest-facing arrival information, room facilities, inclusions and policies. Internal supplier terms and commissions stay out of customer documents. Catalog edits do not silently change an existing booking's amounts or stored profile. Amendment payloads retain each original source item to preserve its details; loading current room defaults explicitly captures the current room profile. Legacy bookings have no reconstructed historical profile; their original prices, dates, policies and issued PDFs are preserved.

Apply backend migrations and restart Django/Next.js after updating. The additive catalog migrations preserve existing records. A pre-migration database snapshot was created before applying these changes.


## Automatic margin from supplier agreements

Set **Regular / rack rate** on each room category. In a resort profile, set its default supplier agreement; a room can inherit it or use its own override. Available agreements:

- **B2B / net resort cost:** base margin = rack total minus B2B cost total.
- **Commission percentage:** base margin = rack total multiplied by commission percentage, rounded to cents.
- **Flat resort cost:** base margin = rack total minus the fixed supplier amount.
- **Fixed commission:** base margin is the fixed amount retained by Hill Horizon.

For fixed currency amounts, choose **Each room / rack pricing unit** or **Fixed total for the entire room line**. A flat line total is applied once, regardless of room quantity or nights. Percentages always apply to the full rack line total. Supplier costs and fixed commission have distinct labels to avoid confusing money payable to the resort with money kept by Hill Horizon.

Bookings copy the chosen agreement and its value; changing supplier defaults does not reprice saved bookings. Rack rate, quantity, dates, and agreement inputs recalculate base margin automatically, and Django independently derives it on save/preview. **Net margin = base margin − Hill Horizon-funded discount − referrer share**, before payment fees. Guest selling total and supplier settlement balances retain their existing calculation rules. An extra resort-funded discount reduces guest price and supplier entitlement together.

Example: rack 6,500 and B2B cost 5,000 gives base margin 1,500. Your discount of 500 reduces it to 1,000; a referrer share of 500 leaves 500. For multiple rooms/nights, per-unit agreements scale automatically. Manual line-margin mode remains available for existing records and exceptional quotes. Historical booking lines retain their original amounts and are migrated as manual agreements.


## Booking officer and owner screens

The workspace uses `is_superuser` to select the owner editor. Booking officers get guest details, resort/room selections, dates, quantities, an approved discount field, a server quote, supplier availability checks and guest documents. Money and supplier agreement screens are owner-only. Staff requests never contain supplier costs, commissions or margin inputs; staff workspace loading skips all internal money and timeline endpoints.

The owner configures each room's published regular rate, supplier agreement and **Officer discount allowance** in Contacts. Allowance is BDT per room per pricing unit (per night for nightly rates), defaults to zero, and additionally requires `bookings.apply_booking_discount`. Customer-facing totals come from `/api/v1/bookings/quote/`; saving checks the reviewed total again. Rooms without approved rate/agreement defaults need owner review. Staff can update guest contacts and operational notes on saved bookings; room or price amendments require the owner.

Run the backend's `setup_booking_officer` management command, then assign existing users to **Booking Officer** in Django admin as the owner. This command creates the group only and never changes account membership or passwords.
