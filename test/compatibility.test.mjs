import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { cancellationScope, withCancellation, fetchWithDeadline, WorkspaceApi, responseBytes } from '../src/client.js';
import { compressBytes, decompressBytes, verifyIdentitySignature, requireRuntime } from '../src/compatibility.js';
import { packNote, unpackNote, freshSalt, unlockWorkspace } from '../src/codec.js';
import { routedFetch } from '../src/routing.js';
const replace = (t, object, name, value) => { const descriptor=Object.getOwnPropertyDescriptor(object,name);Object.defineProperty(object,name,{configurable:true,writable:true,value});t.after(()=>descriptor?Object.defineProperty(object,name,descriptor):delete object[name]); };
const noAbortStatics=t=>{replace(t,AbortSignal,'any',undefined);replace(t,AbortSignal,'timeout',undefined);};
const noCompression=t=>{replace(t,globalThis,'CompressionStream',undefined);replace(t,globalThis,'DecompressionStream',undefined);};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('cancellation settles fetch and body waits even when the underlying operation ignores abort', async () => {
	for (const body of [false, true]) {
		const parent = new AbortController();
		let release;
		let cancelled = false;
		const response = new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } }));
		const api = new WorkspaceApi('https://synthetic.invalid', 'synthetic-key', 'a'.repeat(36), () =>
			body ? response : new Promise(resolve => { release = resolve; }));
		api.signal = parent.signal;
		const request = api.feed(0);
		await tick();
		parent.abort(new DOMException('synthetic stop', 'AbortError'));
		await assert.rejects(request, error => error.name === 'AbortError');
		if (release) release(response);
		await tick();
		assert.equal(cancelled, true);
	}
	await assert.rejects(withCancellation([], 5, () => new Promise(() => {})), error => error.name === 'TimeoutError');
});

test('routing identity checks inherit parent cancellation and never pin a late response', async () => {
	const parent = new AbortController();
	let pins = 0;
	const work = routedFetch({ origin: 'https://synthetic.invalid', signal: parent.signal,
		fetcher: () => new Promise(() => {}), savePin: async () => { pins++; } });
	await tick();
	parent.abort();
	await assert.rejects(work, error => error.name === 'AbortError');
	assert.equal(pins, 0);
});

test('legacy cancellation merges first reasons, pre-aborted parents, and releases all listeners',async t=>{
 noAbortStatics(t);const a=new AbortController(),b=new AbortController(),reason=new Error('synthetic user stop');let adds=0,removes=0;
 for(const signal of [a.signal,b.signal]){const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);t.mock.method(signal,'addEventListener',(...args)=>{adds++;return add(...args)});t.mock.method(signal,'removeEventListener',(...args)=>{removes++;return remove(...args)});}
 const scope=cancellationScope([a.signal,a.signal,b.signal],10000);assert.equal(adds,2);b.abort(reason);a.abort(new Error('later'));assert.equal(scope.signal.reason,reason);assert.equal(removes,2);scope.dispose();assert.equal(removes,2);
 const already=cancellationScope([a.signal,b.signal],10000);assert.equal(already.signal.aborted,true);already.dispose();
 const c=new AbortController(),success=cancellationScope([c.signal]);success.dispose();c.abort();assert.equal(success.signal.aborted,false);
});

test('legacy deadline bounds waiting and disposal clears timers on success and exceptions',async t=>{
 noAbortStatics(t);let active=0;const set=globalThis.setTimeout,clear=globalThis.clearTimeout;const handles=new Set();
 t.mock.method(globalThis,'setTimeout',(work,ms)=>{let id;id=set(()=>{if(handles.delete(id))active--;work();},ms);handles.add(id);active++;return id;});t.mock.method(globalThis,'clearTimeout',id=>{if(handles.delete(id))active--;return clear(id);});
 assert.equal(await withCancellation([],10000,async()=>42),42);assert.equal(active,0);
 await assert.rejects(withCancellation([],10000,async()=>{throw Error('synthetic failure')}),/synthetic failure/);assert.equal(active,0);
 await assert.rejects(withCancellation([],5,signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))),e=>e.name==='TimeoutError');assert.equal(active,0);
});

test('legacy transport stops before fetch for an already cancelled request and cancels a response after headers',async t=>{
 noAbortStatics(t);const controller=new AbortController();let calls=0;
 const api=new WorkspaceApi('https://synthetic.invalid','synthetic-key','a'.repeat(36),async(url,{signal})=>{calls++;return new Response(new ReadableStream({start(target){signal.addEventListener('abort',()=>target.error(signal.reason),{once:true});}}));});api.signal=controller.signal;
 const request=api.feed(0);await tick();controller.abort(new DOMException('synthetic stop','AbortError'));await assert.rejects(request,e=>e.name==='AbortError');assert.equal(calls,1);
 await assert.rejects(api.feed(0),e=>e.name==='AbortError');assert.equal(calls,1);
});

test('routed fetch preserves parent cancellation until body consumption and honors response deadline',async t=>{
 noAbortStatics(t);const controller=new AbortController();let rawSignal;
 const fetcher=async(url,{signal})=>{rawSignal=signal;return new Response(new ReadableStream({start(target){signal.addEventListener('abort',()=>target.error(signal.reason),{once:true});}}));};
 const response=await fetchWithDeadline(fetcher,'https://synthetic.invalid',{signal:controller.signal},10000),read=responseBytes(response,100);
 controller.abort(new DOMException('stop after headers','AbortError'));await assert.rejects(read,e=>e.name==='AbortError');assert.equal(rawSignal.aborted,true);
 const timed=await fetchWithDeadline(fetcher,'https://synthetic.invalid',{},5);await assert.rejects(responseBytes(timed,100),e=>e.name==='TimeoutError');
});

test('fallback deflate interoperates with native streams and enforces length and checksum',async t=>{
 const body=new TextEncoder().encode('跨平台正文 '.repeat(10000));const native=await compressBytes(body,body.length+1024);
 noCompression(t);const fallback=await compressBytes(body,body.length+1024);assert.deepEqual(await decompressBytes(native,body.length),body);assert.deepEqual(await decompressBytes(fallback,body.length),body);
 await assert.rejects(decompressBytes(deflateSync(new Uint8Array(1024*1024)),127),/declared limit/);
 const corrupt=Uint8Array.from(fallback);corrupt[corrupt.length-1]^=1;await assert.rejects(decompressBytes(corrupt,body.length),/checksum/);
 await assert.rejects(decompressBytes(fallback,body.length-1),/declared limit/);
});

test('fallback ciphertext roundtrip retains original mtime and is readable by native decoding',async t=>{
 const keys=await unlockWorkspace('synthetic legacy password',freshSalt()),body=new TextEncoder().encode('压缩先于加密 '.repeat(10000)),mtime=1577836800123;
 const Compress=globalThis.CompressionStream,Decompress=globalThis.DecompressionStream,blobStream=Blob.prototype.stream;noCompression(t);replace(t,Blob.prototype,'stream',undefined);
 const packed=await packNote(keys,'a'.repeat(36),'旧版/正文.md',body,undefined,undefined,'file',mtime),objects=new Map(packed.objects.map(o=>[o.address,o.body]));
 const {inspectNote}=await import('../src/codec.js');assert.equal((await inspectNote(keys,'a'.repeat(36),packed.id,packed.manifest,async a=>objects.get(a))).mtime,mtime);assert.deepEqual((await unpackNote(keys,'a'.repeat(36),packed.id,packed.manifest,async a=>objects.get(a))).contents,body);
 // Native transform uses Blob.stream; restore it before the cross-decoder check.
 replace(t,Blob.prototype,'stream',blobStream);
 replace(t,globalThis,'CompressionStream',Compress);replace(t,globalThis,'DecompressionStream',Decompress);
 assert.deepEqual((await unpackNote(keys,'a'.repeat(36),packed.id,packed.manifest,async a=>objects.get(a))).contents,body);
});

test('Ed25519 fallback verifies real signatures while rejecting forged DER, keys, signatures and messages',async t=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),spki=new Uint8Array(publicKey.export({format:'der',type:'spki'})),message=new TextEncoder().encode('synthetic authority binding'),signature=new Uint8Array(sign(null,message,privateKey));
 assert.equal(await verifyIdentitySignature(spki,signature,message),true);
 const importKey=crypto.subtle.importKey.bind(crypto.subtle);t.mock.method(crypto.subtle,'importKey',async(format,key,algo,...rest)=>{if(algo==='Ed25519')throw new DOMException('Synthetic older WebKit','NotSupportedError');return importKey(format,key,algo,...rest);});
 assert.equal(await verifyIdentitySignature(spki,signature,message),true);const bad=Uint8Array.from(signature);bad[0]^=1;assert.equal(await verifyIdentitySignature(spki,bad,message),false);
 assert.equal(await verifyIdentitySignature(spki,signature,new Uint8Array([1])),false);const der=Uint8Array.from(spki);der[8]^=1;assert.equal(await verifyIdentitySignature(der,signature,message),false);assert.equal(await verifyIdentitySignature(spki,signature.subarray(0,63),message),false);
 const other=generateKeyPairSync('ed25519');assert.equal(await verifyIdentitySignature(new Uint8Array(other.publicKey.export({format:'der',type:'spki'})),signature,message),false);
});

test('native authentication failures never switch to fallback and missing core APIs report capability failure',async t=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),spki=new Uint8Array(publicKey.export({format:'der',type:'spki'})),msg=new Uint8Array([1]),sig=new Uint8Array(sign(null,msg,privateKey));
 t.mock.method(crypto.subtle,'verify',async()=>false);t.mock.method(crypto.subtle,'digest',async()=>{throw Error('Fallback must not run')});assert.equal(await verifyIdentitySignature(spki,sig,msg),false);
 requireRuntime();replace(t,globalThis,'structuredClone',undefined);assert.throws(requireRuntime,e=>e.code==='HOST_RUNTIME_UNSUPPORTED');
});
