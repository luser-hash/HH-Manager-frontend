import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agreementMargin} from '../src/lib/agreements.ts';
import {chooseRoom,effectiveAgreement,refreshRoomRate} from '../src/lib/catalog.ts';
import {newLine,newStay,priceStay,draftFromBooking,editorPayload} from '../src/lib/booking-editor.ts';
import type {Resort} from '../src/lib/api.ts';
const resort:Resort={id:'r',name:'Agreement resort',is_archived:false,default_agreement_type:'b2b',default_agreement_value:'5000.00',rooms:[{id:'room',name:'Couple',max_occupancy:2,default_public_price:'6500.00',default_price_basis:'night',default_commission_type:'inherit'}]};
test('B2B and flat supplier rates calculate rack minus supplier cost for rooms and nights',()=>{
  for(const model of ['b2b','flat_rate'] as const)assert.equal(agreementMargin(model,'5000.00','6500.00',2,2),600000);
  assert.equal(agreementMargin('flat_rate','9000.00','6500.00',1,2,'line_total'),400000);
});
test('percentage and fixed commissions support per-unit or entire-line amounts',()=>{
  assert.equal(agreementMargin('percent','20','6500.00',2,2),520000);
  assert.equal(agreementMargin('amount','1500','6500.00',2,2),600000);
  assert.equal(agreementMargin('amount','1500','6500.00',2,2,'line_total'),150000);
  assert.equal(agreementMargin('percent','33.33','3.33',3,1),333);
});
test('inheritance fills a resort agreement and a room override takes precedence',()=>{
  const stay=newStay(resort,'2026-11-01','2026-11-03');
  assert.equal(stay.items[0].pricingModel,'b2b');assert.equal(stay.items[0].agreementValue,'5000.00');assert.equal(stay.items[0].commission,'3000.00');
  const override={...resort,rooms:[{...resort.rooms[0],default_commission_type:'percent' as const,default_commission:'10.00'}]};
  const line=chooseRoom(newLine(),'room',stay,override);assert.equal(line.pricingModel,'percent');assert.equal(line.commission,'1300.00');
  assert.equal(effectiveAgreement(override.rooms[0],override).inherited,false);
});
test('discounts and referrer share reduce the derived margin without changing supplier entitlement',()=>{
  const stay=newStay(resort,'2026-11-01','2026-11-02');stay.items[0].ownDiscount='500';stay.referral='500';stay.referrer='Partner';
  const totals=priceStay(stay);assert.equal(totals.agreed_commission,150000);assert.equal(totals.guest_total,600000);assert.equal(totals.your_earnings,50000);assert.equal(totals.resort_entitlement,500000);
});
test('booking-specific supplier rates remain stable when catalog defaults change',()=>{
  const stay=newStay(resort,'2026-11-01','2026-11-02');const changed={...resort,default_agreement_value:'6000.00'};
  const line=refreshRoomRate({...stay.items[0],catalogPrice:false},stay,changed);
  assert.equal(line.agreementValue,'5000.00');assert.equal(line.commission,'1500.00');
});
test('payload saves agreement terms and independently derives canonical margin',()=>{
  const draft=draftFromBooking(undefined,[resort],'2026-11-01');draft.name='Guest';draft.phone='01700000000';draft.stays[0].items[0].commission='0.01';
  const payload=editorPayload(draft,[resort]);const line=payload.segments[0].items[0];
  assert.equal(line.pricing_model,'b2b');assert.equal(line.agreement_value,'5000.00');assert.equal(line.agreed_commission,'1500.00');assert.equal(line.agreement_basis,'unit');
});
test('invalid supplier costs and percentages are rejected instead of silently creating a negative margin',()=>{
  assert.throws(()=>agreementMargin('b2b','7000','6500',1,1),/exceeds/);
  assert.throws(()=>agreementMargin('percent','101','6500',1,1),/100/);
  assert.throws(()=>agreementMargin('flat_rate','14000','6500',1,2,'line_total'),/exceeds/);
});
