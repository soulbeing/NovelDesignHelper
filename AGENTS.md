# Project Agent Instructions

Read `docs/storage-and-github-history-plan.md` before implementing storage, compatibility, GitHub history, or starter-project changes. It records confirmed user requirements, proposed defaults, implementation phases, and handoff progress; keep its progress accurate as work proceeds.

## Karpathy coding guidelines

- Think before coding: state material assumptions and tradeoffs; ask when the request is genuinely unclear.
- Simplicity first: use the smallest adequate design without speculative features or abstractions.
- Make surgical changes that match existing style. Every changed line must trace to the user's request; preserve unrelated work.
- Define success criteria for non-trivial work and verify against the user's goal.

## Persistent story data and compatibility

The user will use this application for real writing while it evolves. Existing user data must remain readable across application upgrades. Treat persisted files, imports/exports, and browser recovery drafts as a compatibility contract.

- Keep the data-format version independent of the application release version. Change the format version when persisted structure or meaning changes, not for every application release.
- Preserve support for the original version-1 Board JSON files and exports. Introduce explicit, validated migrations when the format evolves; route all loading entry points through the same compatibility logic.
- Do not silently discard user-authored content, relationships, IDs, layout, or supported extension data during loading, migration, saving, or export. Define an explicit policy for unknown fields; do not rely on schema parsing that silently strips them.
- Detect unsupported future versions and invalid data before changing the active document or overwriting its file. Explain the failure and retain the original data; never substitute an empty/example board and then autosave over it.
- Preserve original files before an on-disk format migration. Use serialized, atomic file replacement for saves, and retain a recoverable previous copy when changing persistence behavior.
- The user's purpose for save-as is version traceability. The agreed direction replaces save-as with local persistence plus GitHub-backed version history. Keep portable JSON export for independent backup.
- When adding multiple documents, scope autosave queues and recovery drafts to document identity. A delayed save or recovery action must never write one document's content into another.
- For every persistence-format change, commit immutable historical fixtures containing synthetic story data and automated regression tests for migration, semantic round trips, invalid/future-version rejection without overwrite, and preservation of content, relationships, IDs, and layout. Do not regenerate old fixtures from the current model or commit private writing.
- Run the relevant automated tests and build before declaring persistence changes complete. Document format changes and compatibility behavior.

## GitHub-backed project history

- Keep this application's public source repository separate from user-selected story repositories. New story projects collect the target GitHub repository and user-provided credentials. Recommend private repositories, but respect the user's choice of repository visibility; never change visibility automatically.
- Store repository/branch/path bindings per project. Never upload private writing to this application's source repository by default. Keep credentials out of story files, exports, commits, logs, and browser recovery drafts.
- Distinguish successful local saves from successful GitHub synchronization in the UI. Network failures, expired credentials, or remote conflicts must leave local writing intact and expose pending synchronization accurately.
- Preserve historical commits. Restore an older story as a new current revision; do not reset or force-push history. Read historical documents through the same version-validation and migration pipeline used for other imports.
- Check the expected remote revision before publishing. Never silently overwrite remote edits or automatically resolve conflicts by taking one side.
- Test remote behavior with simulated GitHub responses, including authentication failure, network failure, stale revisions, and historical restore. Do not publish user data or incur real external writes in routine tests.

The first implementation and adopted defaults are documented in `docs/storage-and-github-history-plan.md` and `README.md`. Preserve its compatibility tests and update the plan's actual progress and limitations when changing this system. These requirements do not authorize unrelated features or a speculative schema redesign.
