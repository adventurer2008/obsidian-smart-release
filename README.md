# 无界同步

China edition of Smart Sync. Plugin ID: `smart-sync`.

This repository distributes the China edition. Installable versions are available only after a matching GitHub Release is published. A prepared file or draft release does not establish service acceptance.

## Installation after publication

Install and enable BRAT from Obsidian Community plugins. In BRAT, add `adventurer2008/obsidian-smart-release`, then enable 无界同步. This repository tracks the China edition only. GitHub access is required for BRAT installation and updates. An official manual download may provide the same files and checksums.

## Account and service

An approved China account and notebook encryption passphrase are required. The service origin is `[service endpoint configured by client]`. Project home: https://github.com/adventurer2008/obsidian-smart-release . Overseas Smart Sync accounts and data are separate. Do not enable both editions in the same vault.

Contents and paths are encrypted on the client before upload; the service still processes account and workspace identifiers, enrollment email, notebook/device labels, timestamps, ciphertext sizes, diagnostics and opaque identifiers. Keep the notebook encryption passphrase safe: the service cannot recover it. See [the privacy notice](PRIVACY.md). Public-beta access is subject to approval; no payment or permanent free-service guarantee is announced. Windows acceptance and physical Android/iOS/macOS acceptance are tracked separately; do not treat `isDesktopOnly: false` as proof of physical-device validation.

## Release files and source review

Install files are `main.js`, `manifest.json`, and `styles.css` from a matching GitHub Release. Do not install a source-code archive. Client and Server source repositories remain private. The plugin includes licensed dependencies; see LICENSE and THIRD-PARTY-NOTICES.md. No credentials or test data are distributed.
