import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seasonalAgreement,type B2BSeason} from '../src/lib/seasons.ts';
import {chooseRoom,refreshRoomRate,profilePayload} from '../src/lib/catalog.ts';
import {newLine,newStay} from '../src/lib/booking-editor.ts';
import type {Resort} from '../src/lib/api.ts';

const rows:B2BSeason[]=[{season:'off',price:'5000.01',valid_from:'2026-10-01',valid_until:'2026-10-31'},{season:'peak',price:'7000.02',valid_from:'2026-11-01',valid_until:'2027-03-31'}];
const resort:Resort={id:'r',name:'Seasons',is_archived:false,default_agreement_type:'b2b',b2b_seasons:rows,rooms:[{id:'room',name:'Room',max_occupancy:2,default_commission_type:'inherit',default_price_basis:'night',default_public_price:'10000.00'}]};
test('season matching excludes checkout, sums exact costs across seasons and checks gaps',()=>{
  assert.deepEqual(seasonalAgreement(rows,'2026-10-30','2026-11-01',2,'night','unit'),{value:'5000.01',basis:'unit'});
  assert.deepEqual(seasonalAgreement(rows,'2026-10-31','2026-11-02',3,'night','unit'),{value:'36000.09',basis:'line_total'});
  assert.throws(()=>seasonalAgreement(rows,'2027-04-01','2027-04-02',1,'night','unit'),/No valid/);
  assert.throws(()=>seasonalAgreement(rows,'2026-10-31','2026-11-02',1,'unit','unit'),/Split/);
});
test('owner editor selects inherited rates and refreshes when dates or quantity change',()=>{
  const stay=newStay(resort,'2026-10-30','2026-10-31');
  assert.equal(stay.items[0].agreementValue,'5000.01');
  const changed=refreshRoomRate({...stay.items[0],quantity:2},{...stay,checkIn:'2026-10-31',checkOut:'2026-11-02'},resort);
  assert.equal(changed.agreementValue,'24000.06');assert.equal(changed.agreementBasis,'line_total');
  assert.equal(changed.commission,'15999.94');
  const expired=refreshRoomRate(changed,{...stay,checkIn:'2027-04-01',checkOut:'2027-04-02'},resort);
  assert.match(expired.rateProblem||'',/No valid/);assert.equal(expired.agreementValue,'');
  const snapshot=refreshRoomRate({...changed,catalogCommission:false},{...stay,checkIn:'2027-04-01',checkOut:'2027-04-02'},resort);
  assert.equal(snapshot.agreementValue,'24000.06');
});
test('room override and seasonal form payload preserve two private prices and dates',()=>{
  const own={...resort,rooms:[{...resort.rooms[0],default_commission_type:'b2b' as const,b2b_seasons:rows.map(s=>({...s,price:'6000.00'}))}]};
  const stay=newStay(own,'2026-11-01','2026-11-02');
  assert.equal(chooseRoom(newLine(),'room',stay,own).agreementValue,'6000.00');
  const form=new FormData();form.set('default_commission_type','b2b');form.set('seasonal_b2b','on');
  for(const s of rows){form.set(`${s.season}_price`,s.price);form.set(`${s.season}_from`,s.valid_from);form.set(`${s.season}_until`,s.valid_until);}
  const payload=profilePayload(form,'room',true);
  assert.deepEqual(payload.b2b_seasons,[rows[1],rows[0]]);assert.equal(payload.default_commission,null);
  assert.equal(profilePayload(form,'room',false).b2b_seasons,undefined);
});
