# 无界同步

China edition of Smart Sync. Plugin ID: `wujie-sync`.

This repository distributes the China edition of 无界同步 through GitHub Releases and BRAT.

## Installation

Install and enable BRAT from Obsidian Community plugins. In BRAT, add `adventurer2008/obsidian-smart-release`, then enable 无界同步. This repository tracks the China edition only. GitHub access is required for BRAT installation and updates. An official manual download may provide the same files and checksums.

## Version 0.1.74 — 2026-10-19

Version 0.1.74 includes the accepted gray outline pin icon and supports independently pinning multiple notes, attachments and folders, including empty folders, with encrypted pin-state synchronization between devices. Note contents and original modification times are preserved. The matching service has been deployed to staging and production.

BRAT can detect 0.1.74 as an update from 0.1.73. Enable BRAT automatic updates or run its update command, and keep the repository subscription on latest rather than a frozen version. GitHub access is required. Verify the downloaded files against the release's SHA256SUMS.txt. Physical-device acceptance is separate from Windows synthetic-vault and production API checks. Existing 0.1.73 assets remain available.

## Account and service

An approved China account and notebook encryption passphrase are required. The service origin is `[service endpoint configured by client]`. Project home: https://github.com/adventurer2008/obsidian-smart-release . Overseas Smart Sync accounts and data are separate. Do not enable both editions in the same vault.

Contents and paths are encrypted on the client before upload; the service still processes account and workspace identifiers, enrollment email, notebook/device labels, timestamps, ciphertext sizes, diagnostics and opaque identifiers. Keep the notebook encryption passphrase safe: the service cannot recover it. See [the privacy notice](PRIVACY.md). Public-beta access is subject to approval; no payment or permanent free-service guarantee is announced. Windows acceptance and physical Android/iOS/macOS acceptance are tracked separately; do not treat `isDesktopOnly: false` as proof of physical-device validation.

## Release files and source review

Install files are `main.js`, `manifest.json`, and `styles.css` from a matching GitHub Release. Do not install a source-code archive. Client and Server source repositories remain private. The plugin includes licensed dependencies; see LICENSE and THIRD-PARTY-NOTICES.md. No credentials or test data are distributed.

## Migration from 0.1.72 (smart-sync)

Version 0.1.73 changes the China plugin ID to `wujie-sync`. Obsidian treats this as a separate plugin, so it is not an automatic in-place upgrade. Back up your vault and plugin settings first. In the old plugin, export an encrypted connection backup and keep its password safe. Disable the old `smart-sync` plugin without signing out or revoking its device authorization. Remove the old repository entry from BRAT, then add the same repository again and enable the new plugin. Import the encrypted connection backup, verify the selected notebook, direction, exclusions and attachment preferences before resuming synchronization. Alternatively, sign in to the same China account and select the existing notebook with its original encryption passphrase; do not create a duplicate notebook.

Connection import transfers connection credentials, not all preferences or synchronization checkpoints. Review preferences explicitly. Existing cloud data and local notes stay in place. Keep the disabled old plugin directory until synchronization is verified; never enable old and new sync plugins together. Never copy plaintext credentials into data.json. The 0.1.72 tag and assets remain available for reference.
