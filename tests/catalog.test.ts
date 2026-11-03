import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseRoom,refreshRoomRate,rateCovers,profilePayload} from '../src/lib/catalog.ts';
import {newLine,newStay,editorPayload,draftFromBooking} from '../src/lib/booking-editor.ts';
import type {Resort} from '../src/lib/api.ts';
const resort:Resort={id:'resort',name:'Saved resort',is_archived:false,check_in_time:'14:00:00',rooms:[{id:'room',name:'Couple cottage',max_occupancy:3,standard_occupancy:2,max_extra_guests:1,bed_description:'King bed',inclusions:'Breakfast',default_public_price:'6500.00',default_price_basis:'night',default_commission_type:'amount',default_commission:'1500.00'}]};
test('selecting a room fills nightly price and scales the fixed commission by nights and quantity',()=>{
  const stay=newStay(resort,'2026-11-01','2026-11-03');
  assert.equal(stay.items[0].price,'6500.00');assert.equal(stay.items[0].commission,'3000.00');
  assert.equal(stay.items[0].description,'Couple cottage');
  assert.equal(refreshRoomRate({...stay.items[0],quantity:2},stay,resort).commission,'6000.00');
});
test('percentage commissions use public line total with exact rounding',()=>{
  const percent={...resort,rooms:[{...resort.rooms[0],default_commission_type:'percent' as const,default_commission:'12.50'}]};
  const stay=newStay(percent,'2026-11-01','2026-11-03');
  assert.equal(stay.items[0].commission,'1625.00');
  assert.equal(refreshRoomRate({...stay.items[0],price:'6500.01',catalogPrice:false},stay,percent).commission,'1625.00');
});
test('manual price and commission overrides survive date and quantity changes',()=>{
  const stay=newStay(resort,'2026-11-01','2026-11-03');
  const manual={...stay.items[0],pricingModel:'manual' as const,price:'6000.00',commission:'900.00',quantity:2,catalogPrice:false,catalogCommission:false};
  const updated=refreshRoomRate(manual,{...stay,checkOut:'2026-11-10'},resort);
  assert.equal(updated.price,'6000.00');assert.equal(updated.commission,'900.00');
});
test('rate validity includes occupied nights but excludes checkout day',()=>{
  const dated={...resort.rooms[0],rate_valid_from:'2026-11-01',rate_valid_until:'2026-11-02'};
  const stay=newStay(resort,'2026-11-01','2026-11-03');assert.equal(rateCovers(dated,stay),true);
  assert.equal(rateCovers(dated,{...stay,checkOut:'2026-11-04'}),false);
  const expired=chooseRoom(newLine(),'room',{...stay,checkOut:'2026-11-04'},{...resort,rooms:[dated]});
  assert.equal(expired.price,'');assert.equal(expired.commission,'0.00');
});
test('quote-only defaults stay blank, while explicit free rates remain agreed zero',()=>{
  const stay=newStay({...resort,rooms:[{...resort.rooms[0],default_public_price:null}]},'2026-11-01','2026-11-02');
  assert.equal(stay.items[0].price,'');assert.equal(stay.items[0].commission,'0.00');
  const free=newStay({...resort,rooms:[{...resort.rooms[0],default_public_price:'0.00',default_commission:'0.00'}]},'2026-11-01','2026-11-02');
  assert.equal(free.items[0].price,'0.00');
});
test('profile form preserves nullable values, explicit zeros and protected commission fields',()=>{
  const form=new FormData();form.set('default_public_price','0.00');form.set('extra_bed_available','on');form.set('default_price_basis','night');
  const payload=profilePayload(form,'room',false);
  assert.equal(payload.default_public_price,undefined);assert.equal(profilePayload(form,'room',true).default_public_price,'0.00');assert.equal(payload.extra_bed_price,null);assert.equal(payload.extra_bed_available,true);assert.equal(payload.standard_occupancy,null);assert.equal('default_commission' in payload,false);
});
