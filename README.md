# Smart Sync

Sync notes, attachments and selected Obsidian settings using client-side encryption and a separate synchronization service.

## Distribution repository

Official project distribution location: https://github.com/adventurer2008/obsidian-smart-release .

This public repository contains user documentation, plugin metadata and license notices. Client and Server implementation sources are maintained in separate private repositories. Obsidian Community reviewers can be granted read access to the private Client source repository through the official Community directory GitHub App, so the released client can be checked against its source. That setup and Community approval are not completed merely by creating this repository.

The current candidate metadata is version 0.1.1 with plugin ID `smart-sync`. No installable GitHub Release is published yet. When a version is ready, its matching version tag will provide main.js, manifest.json and styles.css as Release attachments. This repository does not announce a release or completed Community review.

## Features

- Client-side compression and authenticated encryption of note contents and paths.
- Automatic/manual synchronization, offline retry and preserved conflicting changes.
- Version history, recoverable deletion and on-demand attachments.
- Optional synchronization of selected settings, themes and other-plugin configuration.
- Device pairing, encrypted recovery and device revocation.

## Service, account and privacy

A compatible Smart Sync service, an issued login key or approved device pairing, and a notebook encryption passphrase are required. The plugin connects to the service address configured by the user to synchronize ciphertext and manage devices/history. There is no service-side recovery of a lost notebook passphrase. No production service availability, pricing or permanent free-service promise is made here.

Contents and paths are encrypted on the client before upload. The service still processes account/workspace identifiers, email for enrollment, timestamps, sequence numbers, ciphertext sizes/digests and opaque identifiers. Keys are recorded as digests; a configured email provider receives issued login keys for delivery. Audit records include opaque actors and API actions. No client analytics are included. Deployment-specific service operators must disclose their endpoints, providers and applicable privacy terms before public service use.

The plugin uses the selected vault, selected configuration scope and Obsidian secret storage. A local plaintext merge-base cache and archived pending state may remain in plugin data and are excluded from synchronization. Selected other-plugin settings can contain sensitive values; enable this scope deliberately.

## Compatibility and validation

The current protocol 2 implementation is incompatible with protocol 1 ciphertext, service databases and device state. Earlier synthetic `smartSync` installations use a different plugin ID and are not silently migrated. Use a fresh synthetic test vault and a separate service dataset; do not overwrite a configured protocol 1 installation or connect a production vault. Windows native trust confirmation and dependent host integration checks are deferred. Physical Android, public-network and production acceptance are not claimed.

## License and support

The client distribution is MIT licensed, copyright 2026 lihy. Bundled dependency notices are retained in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) and the client artifact. Keeping source repositories private does not change permissions already granted under the applicable license. See [LICENSE](./LICENSE).

Use this repository's Issues for bug reports. Do not attach credentials, recovery packages or private note data. Smart Sync is an independent community project and is not an official Obsidian product.
