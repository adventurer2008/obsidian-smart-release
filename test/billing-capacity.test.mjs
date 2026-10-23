import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {capacityWarning,billingCard} from '../src/billing.js';
globalThis.window={};
registerHooks({resolve(specifier,context,next){return specifier==='obsidian'?{url:new URL('./obsidian-double.mjs',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
const {default:Plugin}=await import('../src/plugin.js');
const {modals}=await import('./obsidian-double.mjs');
const mb=1024**2;
const summary=(used=801.4*mb,capacity=100*mb)=>({entitlement:{plan:'cn-free',paid:false,logical:capacity},usage:{logicalBytes:Math.round(used)}});
function fixture(){
 let key='synthetic-account',data=summary(),opened=0;
 const plugin={app:{},data:{localId:'one',settings:{origin:'https://sync.example.invalid',workspace:'one'}},secret:()=>key,billingSummary:async()=>data,openBilling:async()=>{opened++;}};
 return {plugin,setKey:value=>{key=value;},setData:value=>{data=value;},opened:()=>opened,warn:()=>Plugin.prototype.warnCapacity.call(plugin)};
}
test('free and paid over-capacity plans show the approved short copy; full, unknown and malformed usage do not',()=>{
 assert.deepEqual(capacityWarning(summary()),{title:'套餐容量不足',message:'已用 801.4 MB / 100 MB，请增加额度后继续上传。',action:'购买更多额度'});
 assert.ok(capacityWarning({...summary(6*1024**3,5*1024**3),entitlement:{plan:'cn-5gb-year',paid:true,logical:5*1024**3}}));
 assert.ok(capacityWarning(summary(1,0)));
 for(const data of [undefined,summary(100*mb),summary(99*mb),{entitlement:{logical:100*mb}},{usage:{logicalBytes:800*mb}},summary(800*mb,-1),{...summary(),usage:{logicalBytes:NaN}}])assert.equal(capacityWarning(data),undefined);
 assert.equal(billingCard(summary(),true).overage,'已超出套餐容量');assert.equal(billingCard(summary(),false).overage,'');assert.equal(billingCard(summary(0),true).overage,'');
});
test('one capacity dialog has one purchase action, is deduplicated, and opens the existing identity-bound plans entry',async()=>{
 const f=fixture(),dialog=await f.warn();
 assert.equal(dialog.title,'套餐容量不足');assert.equal(dialog.contentEl.children[0].text,'已用 801.4 MB / 100 MB，请增加额度后继续上传。');
 assert.equal(dialog.contentEl.settings.length,1);const button=dialog.contentEl.settings[0].controls[0];assert.equal(button.text,'购买更多额度');
 assert.equal(await f.warn(),dialog);await button.click();assert.equal(f.opened(),1);assert.equal(f.plugin.capacityWindow,undefined);
 await button.click();assert.equal(f.opened(),1);
});
test('late summary, logout, a changed workspace, dismissed actions and unavailable billing cannot open plans for another identity',async()=>{
 const f=fixture();let resolve;f.plugin.billingSummary=()=>new Promise(done=>{resolve=done;});
 const pending=f.warn(),before=modals.length;f.setKey('other');resolve(summary());assert.equal(await pending,undefined);assert.equal(modals.length,before);
 f.plugin.billingSummary=async()=>summary();let dialog=await f.warn();const action=dialog.contentEl.settings[0].controls[0].click;f.plugin.data.settings.workspace='other';await action();assert.equal(f.opened(),0);
 dialog=await f.warn();dialog.close();f.plugin.billingSummary=async()=>{throw Error('offline');};assert.equal(await f.warn(),undefined);
 f.setKey('');f.plugin.billingSummary=()=>assert.fail('signed-out identity cannot query capacity');assert.equal(await f.warn(),undefined);
});
test('after purchasing capacity or reducing usage a fresh check closes the old warning',async()=>{
 const f=fixture();await f.warn();f.setData(summary(801.4*mb,5*1024**3));await f.warn();assert.equal(f.plugin.capacityWindow,undefined);
});
