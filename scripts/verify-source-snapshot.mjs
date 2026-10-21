import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const binding=JSON.parse(readFileSync('SOURCE-SNAPSHOT.json'));
for(const [path,digest] of Object.entries(binding.exportedFiles))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),digest,'Source snapshot changed: '+path);
console.log('Verified fixed public Client '+binding.sourceCommit+' (cn)');
