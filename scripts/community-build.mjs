// Generated regional production build. R308 / CHG-20261021-12.
import {execFileSync} from 'node:child_process';
import {copyFileSync} from 'node:fs';
execFileSync(process.execPath,['scripts/verify-source-snapshot.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/build.mjs','--edition=cn'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/check-isolation.mjs','cn'],{stdio:'inherit'});
for(const name of ['main.js','manifest.json','styles.css'])copyFileSync('artifacts/cn/'+name,name);
execFileSync(process.execPath,['scripts/verify-accepted-artifacts.mjs'],{stdio:'inherit'});
