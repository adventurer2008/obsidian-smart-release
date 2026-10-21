import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { packNote, unpackNote, unpackToSink, inspectNote, freshSalt, unlockWorkspace, SEGMENT_BYTES } from '../src/codec.js';
const keys=await unlockWorkspace('synthetic read ahead test',freshSalt());

test('download prefetch overlaps decryption with exactly one next segment and preserves bytes and mtime', async t => {
	const bytes = new Uint8Array(SEGMENT_BYTES * 3 + 19).fill(11), mtime = 1577836800123;
	const packet = await packNote(keys, 'download-ahead', 'large.bin', bytes, undefined, undefined, 'file', mtime);
	const objects = new Map(packet.objects.map(object => [object.address, object.body]));
	const info = await inspectNote(keys, 'download-ahead', packet.id, packet.manifest, async address => objects.get(address));
	const decrypt = crypto.subtle.decrypt.bind(crypto.subtle), loaded = [], timings = [];
	let release, nextReady, calls = 0;
	const gate = new Promise(resolve => { release = resolve; });
	const next = new Promise(resolve => { nextReady = resolve; });
	crypto.subtle.decrypt = async (...args) => { if (calls++ === 0) await gate; return decrypt(...args); };
	t.after(() => { release(); crypto.subtle.decrypt = decrypt; });
	const download = unpackNote(keys, 'download-ahead', packet.id, packet.manifest, async address => {
		loaded.push(address);
		if (loaded.length === 2) nextReady();
		return objects.get(address);
	}, info, (stage, milliseconds) => timings.push({ stage, milliseconds }));
	await next;
	assert.equal(calls, 1);
	assert.equal(loaded.length, 2);
	release();
	assert.deepEqual((await download).contents, bytes);
	assert.equal(info.mtime, mtime);
	assert.equal(timings.filter(row => row.stage === 'decrypt').length, info.segments.length);
	assert.ok(timings.every(row => Number.isFinite(row.milliseconds) && row.milliseconds >= 0));
});

test('download failure drains the one pending read before aborting the sink and never commits partial content', async () => {
	const bytes = new Uint8Array(SEGMENT_BYTES * 3).fill(13);
	const packet = await packNote(keys, 'failed-download', 'large.bin', bytes);
	const objects = new Map(packet.objects.map(object => [object.address, object.body]));
	const info = await inspectNote(keys, 'failed-download', packet.id, packet.manifest, async address => objects.get(address));
	let release, nextReady, reads = 0, aborted = false, settled = false;
	const gate = new Promise(resolve => { release = resolve; });
	const next = new Promise(resolve => { nextReady = resolve; });
	const download = unpackToSink(keys, 'failed-download', packet.id, packet.manifest, async address => {
		if (++reads === 2) { nextReady(); await gate; throw Error('prefetch fault'); }
		return objects.get(address);
	}, async () => ({ write: async () => { throw Error('write fault'); }, commit: async () => assert.fail('partial commit'), abort: async () => { aborted = true; } }), info).finally(() => { settled = true; });
	const failure = assert.rejects(download, /write fault/);
	await next;
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(settled, false);
	assert.equal(aborted, false);
	assert.equal(reads, 2);
	release();
	await failure;
	assert.equal(aborted, true);
	assert.equal(reads, 2);
});
function source(){
 const bytes=new Uint8Array(SEGMENT_BYTES*2+16).fill(7),events=[];
 return{events,streamed:true,length:bytes.length,digest:createHash('sha256').update(bytes).digest('hex'),createDigest(){const digest=createHash('sha256');return{update:b=>digest.update(b),finish:()=>digest.digest('hex')}},async chunk(offset,length){events.push('read'+offset);return bytes.slice(offset,offset+length)},async verify(){},async spool(object){events.push('spool');return object},async dispose(){events.push('dispose')}};
}
test('stream packing reads at most one segment ahead and retains compression/encryption and digest checks',async()=>{
 const input=source(),packed=await packNote(keys,crypto.randomUUID(),'n.bin',input);
 assert.ok(input.events.indexOf('read'+SEGMENT_BYTES)<input.events.indexOf('spool'));assert.equal(packed.info.bytes,input.length);assert.equal(packed.info.digest,input.digest);await packed.dispose();assert.equal(input.events.at(-1),'dispose');
});
test('packing failure drains the prefetched read before disposing temporary storage',async()=>{
 const input=source(),read=input.chunk;let release,started;const gate=new Promise(done=>{release=done}),ready=new Promise(done=>{started=done});
 input.chunk=async(offset,length)=>{if(offset){started();await gate}return read(offset,length)};
 input.spool=async()=>{throw Error('spool fault')};let settled=false;
 const packed=packNote(keys,crypto.randomUUID(),'n.bin',input).finally(()=>{settled=true});const failure=assert.rejects(packed,/spool fault/);
 await ready;await new Promise(done=>setImmediate(done));assert.equal(settled,false);assert.equal(input.events.includes('dispose'),false);release();await failure;assert.equal(input.events.at(-1),'dispose');
});

test('packing overlaps at most two segment encryptions and preserves ordinal authentication and original mtime',async(t)=>{
 const original=crypto.subtle.encrypt.bind(crypto.subtle);let active=0,peak=0;
 crypto.subtle.encrypt=async(...args)=>{active++;peak=Math.max(peak,active);try{await new Promise(done=>setTimeout(done,15));return await original(...args)}finally{active--}};
 t.after(()=>{crypto.subtle.encrypt=original});
 const bytes=new Uint8Array(SEGMENT_BYTES*5+19);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 const packet=await packNote(keys,'bounded-packing','ordered.bin',bytes,undefined,undefined,'file',1577836800123);
 const objects=new Map(packet.objects.map(object=>[object.address,object.body])),load=async address=>objects.get(address);
 assert.equal(peak,2);assert.equal(active,0);assert.deepEqual((await unpackNote(keys,'bounded-packing',packet.id,packet.manifest,load)).contents,bytes);
 assert.equal((await inspectNote(keys,'bounded-packing',packet.id,packet.manifest,load)).mtime,1577836800123);
});

test('packing drains the other encryption before disposing on an injected segment failure',async(t)=>{
 const original=crypto.subtle.encrypt.bind(crypto.subtle);let active=0,disposedWhileActive=false,calls=0;
 crypto.subtle.encrypt=async(...args)=>{active++;const index=calls++;try{await new Promise(done=>setTimeout(done,index===0?25:5));if(index===1)throw Error('encrypt fault');return await original(...args)}finally{active--}};
 t.after(()=>{crypto.subtle.encrypt=original});
 const input=source();input.dispose=async()=>{disposedWhileActive=active!==0};
 await assert.rejects(packNote(keys,'failure-packing','failed.bin',input),/encrypt fault/);
 assert.equal(active,0);assert.equal(disposedWhileActive,false);
});
