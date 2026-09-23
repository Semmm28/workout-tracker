# CloudKit sync

The native iOS app uses the private database of `iCloud.nl.sem.workouttracker`.
Synchronization is opt-in in Settings and needs iOS 17+. iOS 16 and the PWA
continue to work locally, including JSON import/export. No Apple sign-in screen
or separate server is needed.

## Storage and schema

- Custom zone: `WorkoutLogV1`.
- Record type: `WorkoutEntry`; one field, `payload`, type **Encrypted String**.
- Each brand, machine, set and bodyweight measurement has its own record. The
  record name is SHA-256 of the entity type plus its stable local ID.
- The encrypted envelope contains schema version, entity type, ID, a revision,
  deletion flag and the JSON for that single entity. No workout data is logged.
- Deploy this schema from Development to Production before TestFlight testing.
  No query indexes or public database permissions are needed. The deployed
  WorkoutEntry type has no grants for `_world` or `_icloud`; private database
  access is scoped to the iCloud owner. Capacitor payload logging is disabled.

IndexedDB v3 atomically writes entity changes and `syncRecords`. The retained
journal includes tombstones and survives app/WebView termination. A native
actor persists a replica, revision-specific dirty records, server system fields
and CKSyncEngine serialization together in an atomic, file-protected snapshot.
Unacknowledged revisions are restored to CKSyncEngine on restart. A corrupt
native snapshot is never replaced with an empty replica.

Only changed records cross the network. For simplicity this initial version
exchanges the complete retained journal over the on-device Capacitor bridge;
this can be optimized to paginated deltas for very large histories. Individual
encrypted record payloads must be smaller than 900 KB.

## Merge rules

Existing records are migrated once using stable IDs and their saved timestamps.
Subsequent changes receive a monotonically increasing timestamp plus UUID.
Received revisions advance the local clock. The greater revision wins for edits
to the same entity; an exact tie is resolved by deletion, then UTF-16 value order.
Independent additions on two phones remain separate, even with the same name.
The app does not attempt to combine two simultaneous edits to different fields
of one record; the later revision wins the whole record.

Deletes remain as tombstones indefinitely so a long-offline phone cannot revive
old data. Explicit undo and JSON import generate new revisions and can restore
deleted IDs. Cascades and import commit in a single local transaction; undo only
restores the affected entities. Out-of-order child records remain stored and
exportable, but are hidden until their parent is present.

The first enabled account is bound to the local dataset. Signing out or using a
different iCloud account pauses syncing, retaining local data and pending edits.
The original account must be restored to resume; this release does not offer an
in-app account migration/reset action. Disabling sync keeps local and cloud data.
External deletion of the entire CloudKit zone blocks automatic re-upload and
requires deliberate recovery after exporting a backup.

## Validation

`npm test` exercises migration, replay, stale responses, tombstones, clocks,
account isolation, import and cascade undo. Both Codemagic workflows also compile
and execute the native model tests. `ios-check` compiles the iOS Simulator app;
`ios-testflight` archives/signs and uploads a release build.

Live device checks still needed before broad release:

1. Export a JSON backup. Enable iCloud on an existing installation and wait for
   pending changes to reach zero; verify the JSON export still works.
2. On a second iPhone with the same iCloud account, enable sync and compare
   brands, machines, sets, RPE, notes and bodyweights.
3. Add/edit on both phones offline; reconnect, sync and verify convergence.
4. Delete a set/machine/brand; reconnect a phone that was offline during deletion.
   Verify it stays deleted. Verify Undo and an explicit JSON restore.
5. Terminate/reopen during sync. Verify queued edits and downloads survive.
6. Sign out/switch iCloud accounts: verify a paused status and no data transfer
   to the other account. Return to the original account and resume.
7. Verify no-account, offline and quota feedback, plus iOS 16 local-only behavior.

CKSyncEngine's background schedule is controlled by iOS. Foreground/manual sync
is available; immediate background delivery is not guaranteed.
