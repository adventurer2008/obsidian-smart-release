# Privacy notice — 无界同步 (China edition)

Effective date: 18 October 2026.

## Scope and contact

This notice describes the China edition, plugin ID `wujie-sync` from version 0.1.73 (legacy ID `smart-sync` through 0.1.72), and its service at `[service endpoint configured by client]`. The service is maintained by the 无界同步 project maintainer. Contact: **admin@wujiesync.cc**. The separate Global edition is outside this notice; China and Global accounts and cloud data are independent.

## Information processed

The plugin encrypts file contents, file paths and original file modification times on the client before uploading them. The service stores encrypted objects and cannot recover a lost notebook encryption passphrase. This is a description of the implementation, not a claim of independent security certification.

The service also processes account and workspace identifiers, enrollment email, application purpose and requested storage, notebook and device labels, authorizations, operation timestamps, sequence numbers, ciphertext sizes and digests, usage/quota information, and opaque object identifiers. These operational fields are not all protected by notebook encryption. Web infrastructure may process connection information such as IP addresses and request times according to its configuration.

The plugin has no third-party client analytics SDK or advertising. It can report bounded, sanitized synchronization task metadata to its own service for diagnostics; this is not a claim that no operational data is collected. Service audit and diagnostic records support access control, troubleshooting and service operation. Server versions can also maintain account-level usage and activity aggregates; availability depends on the deployed version.

## Providers and network access

Synchronization connects to the configured China service. Its hosting and object storage use Alibaba Cloud. Enrollment and access-key delivery use the operator's configured mail provider; the current China setup uses QQ Mail SMTP with the `admin@wujiesync.cc` sender. The email provider processes recipient addresses and delivery contents, including issued login keys. Never put your notebook encryption passphrase into an enrollment application or support email.

Installation and updates through BRAT connect to GitHub and download release files from `adventurer2008/obsidian-smart-release`. BRAT is a separate plugin with its own behavior. Optional local-network acceleration can transfer authenticated ciphertext between devices and falls back to the cloud path when unavailable.

## Storage, deletion and local files

Encrypted notes, revision history and operational records remain subject to configured service retention, quota and backup policies. There is no fixed universal retention period promised by this notice. Account deletion revokes access and schedules removal of the account's cloud records and objects; failed object cleanup can retry. Backup copies may remain until their retention expires. Signing out or uninstalling the plugin does not by itself delete a cloud account, and account deletion does not remove your local notes.

Credentials are managed through Obsidian's secret-storage facilities where supported. Keep local devices, vaults and backups secure. Contact the maintainer about account data or deletion questions. Do not send passwords or login keys to the public GitHub issue tracker.

## Changes

Material changes to service data handling will be reflected in this notice and relevant release notes. Review the notice accompanying the version you install.
