# Wujie Sync

Wujie Sync (无界同步) is designed for users in China. Plugin ID: `wujie-sync`.

**Professional cloud storage. Encrypted notes.**

Notes and attachments are encrypted on your device before upload to a mainstream third-party commercial cloud storage platform. The cloud stores ciphertext; the protected content cannot be read directly without the corresponding decryption key.

Free hosted sync includes 100 MB. Optional annual plans add storage shared across your vaults. Core sync and encryption are available on the free plan. Paid plans do not renew automatically. Available plans and current prices are shown on the purchase page.

This repository distributes the China edition of 无界同步 through GitHub Releases and BRAT.

## Installation

Install and enable BRAT from Obsidian Community plugins. In BRAT, add `adventurer2008/obsidian-smart-sync-release-cn`, then enable Wujie Sync. This repository tracks the China edition only. GitHub access is required for BRAT installation and updates. An official manual download may provide the same files and checksums.

## Version 0.1.82 — 2026-10-21

Device pairing can be approved while file synchronization is running. Pairing requests, device revocation and storage overview refresh do not contend with the file transfer lock. Operations that require a stable file or version state explain when to wait or stop the current round.

Fingerprint verification, encrypted key transfer and account/notebook checks remain required. File contents and original modification times are preserved. The paired hosted service remains 0.1.26, with no new protocol or database schema change. All 0.1.81 functionality remains included; older notebooks still require an updated client to verify original-size metadata.

Complete local checks, paired CI, staging and same-runtime production acceptance are required. Physical Android/iOS/iPad/macOS installation and performance remain unverified. BRAT users tracking latest can update to 0.1.82 when GitHub is reachable. Previous releases are retained. Verify downloaded files against SHA256SUMS.txt.

## Release files and source review

Install files are `main.js`, `manifest.json`, and `styles.css` from a matching GitHub Release. Do not install a source-code archive. Development takes place in [obsidian-smart-sync-client](https://github.com/adventurer2008/obsidian-smart-sync-client). This repository also contains an automatically exported, fixed China source snapshot for Community review. SOURCE-SNAPSHOT.json records its source commit, input hashes and explicit regional transformations. Server source and internal operational tools remain private. The plugin includes licensed dependencies; see LICENSE and THIRD-PARTY-NOTICES.md. No credentials or populated test data are distributed.

### Reproduce the China source preview

Use Node.js 26.11.1. Run `npm ci --ignore-scripts`, `npm test`, then `npm run build`. The default build verifies the snapshot, selects the China production configuration, checks the dependency closure and writes `main.js`, `manifest.json` and `styles.css` at the repository root. A second build must produce the same bytes. The 0.1.82 Release is built from its tagged regional source and checked against the accepted Client/Server candidate. Historical 0.1.81 binaries are unchanged.

CHG-20261021-12 / R308: the former metadata-only boundary is superseded for generated public Client snapshots. Do not develop an independent Client fork here. No version bump, service deployment or new Release is included in this change.

## Migration from 0.1.72 (smart-sync)

Version 0.1.73 changes the China plugin ID to `wujie-sync`. Obsidian treats this as a separate plugin, so it is not an automatic in-place upgrade. Back up your vault and plugin settings first. In the old plugin, export an encrypted connection backup and keep its password safe. Disable the old `smart-sync` plugin without signing out or revoking its device authorization. Remove the old repository entry from BRAT, then add the same repository again and enable the new plugin. Import the encrypted connection backup, verify the selected notebook, direction, exclusions and attachment preferences before resuming synchronization. Alternatively, sign in to the same China account and select the existing notebook with its original encryption passphrase; do not create a duplicate notebook.

Connection import transfers connection credentials, not all preferences or synchronization checkpoints. Review preferences explicitly. Existing cloud data and local notes stay in place. Keep the disabled old plugin directory until synchronization is verified; never enable old and new sync plugins together. Never copy plaintext credentials into data.json. The 0.1.72 tag and assets remain available for reference.

## License scope

Copyright (c) 2026 lihy. First-party Client code in new candidates after the existing 0.1.81 release uses Apache License 2.0; see LICENSE. Existing 0.1.81 and earlier releases retain their original MIT terms and unchanged assets. Dependencies retain their own licenses in THIRD-PARTY-NOTICES.md. The Client license does not cover Server software or grant access to the hosted service. Apache-2.0 permits commercial reuse. This repository update does not replace any published release assets.

## Repository transition — 2026-10-21

CHG-20261021-06; requirement R304 / DEC282: this repository was renamed from obsidian-smart-release. Existing release tags, assets and plugin ID wujie-sync are retained. Old repository links redirect to this location; new BRAT entries should use the current name. The new public Client source does not issue a new plugin version or replace installed 0.1.81 binaries.

## 0.1.82 source and distribution

The fixed public Client 25ccf61bc44fffd4ecaa058aeddbb99f3b5e33e6 is exported here with a China production build entry. Apache-2.0 applies to this new release; historical MIT assets are unchanged. Runtime functionality and the approved China login remain available. Full local validation, exact paired CI, staging and same-package production synthetic acceptance passed for the bound candidate before publication. Community release review and physical-device installation remain separate checks.
