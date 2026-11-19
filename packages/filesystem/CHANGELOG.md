# Changelog

All notable changes to `filesystem-schema` are documented here.

## 0.1.1

### Fixed

- Trash and history restores now rehydrate storage-shaped JSON through the
  field read transforms, preserving mapped field names and `Date` values.
- `restoreRecord({ trashFileName })` now restores the requested snapshot
  instead of always choosing the newest trash entry.
- Create, update, delete, trash restore, and history restore now serialize the
  complete read/check/write sequence. Web Locks coordinate tabs, with an
  in-process fallback for runtimes without Web Locks.
- Concurrent conditional updates can no longer both pass the same stale
  revision, and concurrent single-file creates no longer lose records.
- Clarified the `$rev` / `ifMatch` concurrency contract.

## 0.1.0

Initial public release.
