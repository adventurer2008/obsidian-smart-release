# Wujie Sync

Wujie Sync (无界同步) is designed for users in China. Plugin ID: `wujie-sync`.

Wujie Sync is designed for users in China and is currently in a free public beta. An account and approval are required to use the hosted synchronization service. Paid plans have not been announced. Any future pricing and changes to beta access will be communicated in advance.

This repository distributes the China edition of 无界同步 through GitHub Releases and BRAT.

## Installation

Install and enable BRAT from Obsidian Community plugins. In BRAT, add `adventurer2008/obsidian-smart-release`, then enable 无界同步. This repository tracks the China edition only. GitHub access is required for BRAT installation and updates. An official manual download may provide the same files and checksums.

## Version 0.1.79 — 2026-10-20

This maintenance release retains the functionality of 0.1.78 and exercises the maintained release pipeline with four independent Windows content environments, paired Linux validation, staging and same-runtime production acceptance. No synchronization protocol or dependency changes are introduced. BRAT users tracking latest can update to 0.1.79 when GitHub is reachable.

## Previously released: 0.1.78

Device management gives each device a separate card and revoke action, identifies the current device and collapses revoked records into an expandable history. Revoking an account device also invalidates its notebook sessions and pending pairing, removing those sessions from the active list. Revocation does not delete notes stored on the device.

Storage cleanup uses a confirmation dropdown for the current notebook, explains each action and reports released capacity. Storage sizes and transfer rates consistently use B, KB, MB and GB. Existing encryption, pinning, local search, synchronization, history and recovery remain available.

Release validation includes repeated enrollment/revocation and four isolated environments with four synthetic devices and about 512 MB of files each, covering file and folder changes through the encrypted sync engine. These automated tests do not establish physical Android/iOS/iPad/macOS performance or installation acceptance. The paired service 0.1.25 remains schema compatible. BRAT users tracking latest can update from 0.1.77 when GitHub is reachable. Verify release files against SHA256SUMS.txt. Previous release assets remain unchanged.

## Account and service

An approved China account and notebook encryption passphrase are required. The service origin is `[service endpoint configured by client]`. Project home: https://github.com/adventurer2008/obsidian-smart-release . Overseas Smart Sync accounts and data are separate. Do not enable both editions in the same vault.

Contents and paths are encrypted on the client before upload; the service still processes account and workspace identifiers, enrollment email, notebook/device labels, timestamps, ciphertext sizes, diagnostics and opaque identifiers. Keep the notebook encryption passphrase safe: the service cannot recover it. See [the privacy notice](PRIVACY.md). Public-beta access is subject to approval; no payment or permanent free-service guarantee is announced. Windows acceptance and physical Android/iOS/macOS acceptance are tracked separately; do not treat `isDesktopOnly: false` as proof of physical-device validation.

## Release files and source review

Install files are `main.js`, `manifest.json`, and `styles.css` from a matching GitHub Release. Do not install a source-code archive. Client and Server source repositories remain private. The plugin includes licensed dependencies; see LICENSE and THIRD-PARTY-NOTICES.md. No credentials or test data are distributed.

## Migration from 0.1.72 (smart-sync)

Version 0.1.73 changes the China plugin ID to `wujie-sync`. Obsidian treats this as a separate plugin, so it is not an automatic in-place upgrade. Back up your vault and plugin settings first. In the old plugin, export an encrypted connection backup and keep its password safe. Disable the old `smart-sync` plugin without signing out or revoking its device authorization. Remove the old repository entry from BRAT, then add the same repository again and enable the new plugin. Import the encrypted connection backup, verify the selected notebook, direction, exclusions and attachment preferences before resuming synchronization. Alternatively, sign in to the same China account and select the existing notebook with its original encryption passphrase; do not create a duplicate notebook.

Connection import transfers connection credentials, not all preferences or synchronization checkpoints. Review preferences explicitly. Existing cloud data and local notes stay in place. Keep the disabled old plugin directory until synchronization is verified; never enable old and new sync plugins together. Never copy plaintext credentials into data.json. The 0.1.72 tag and assets remain available for reference.
