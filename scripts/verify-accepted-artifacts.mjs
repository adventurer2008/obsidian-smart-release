// R321: CI must reproduce the production-accepted bytes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const binding=JSON.parse(readFileSync('SOURCE-SNAPSHOT.json'));
if(binding.previewOnly===false){assert.match(binding.releaseCandidateDigest,/^[a-f0-9]{64}$/);assert.match(binding.runtimeManifest,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(binding.acceptedArtifacts).sort(),['main.js','manifest.json','styles.css'].sort());for(const [path,digest]of Object.entries(binding.acceptedArtifacts))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),digest,'Accepted artifact differs: '+path);}
