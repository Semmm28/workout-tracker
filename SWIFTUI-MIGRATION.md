# SwiftUI rebuild and verification

The iPhone interface moves to SwiftUI, keeping iOS 16 support and the existing bundle ID, CloudKit container, Watch companion and version-1 PWA backup format. The PWA on `main` stays compatible.

Design: background #0B0B0F, surface #13141A, raised surface #22252D, text #F4F5F8, action #9DB8FF, destructive #FF6F7F. Use the system typeface with Dynamic Type, left-aligned lists and monospaced training values. Native navigation, sheets, swipe actions and forms replace custom web gestures. Charts and set values carry the emphasis; omit decorative dashboards.

```
Workouts             Machine              Log set
Search brands        Machine note         Weight | Repetitions
Brand > machines     Progress chart       Date/time, RPE, notes
Recent activity      Day > sets           Save
                     Add set
Tabs: Workouts / Recent / Log set / Bodyweight / Settings
```

## Preserved behavior

Brands and machines retain search, counts, add/edit/delete, cascade confirmation, undo, reorder and machine notes. Sets retain quick logging, add/edit/delete/undo, dates and times, zero values, optional RPE/notes, chronological day groups and e1RM personal records. Charts retain all five selections. Recent activity retains expandable days and navigation to machines. Bodyweight retains adding measurements, dated history, charts and delete/undo. The interface uses Dutch text and system controls with Dynamic Type.

## Data and compatibility

The first launch reads the original Capacitor IndexedDB origin once, including all four collections, synchronization revisions/tombstones, owner binding and chart preference. The original database is retained. A separate recovery copy is written before migration is marked complete. Subsequent screens and storage are native; Capacitor is retained only for this migration.

Native writes are atomic. Failed imports and failed disk writes leave the previous snapshot intact. Version-1 backups preserve IDs, timestamps, numeric strings and unknown record fields. Repeated imports update matching IDs without duplicates. Orphaned records are retained in storage and exports. Existing opt-in CloudKit services and the Watch transport are reused; Watch acknowledgements follow durable native storage.

## Verification evidence

- 89 JavaScript tests and the iOS configuration validation pass.
- Swift model checks cover migration/relaunch, idempotence, backup compatibility, invalid/future files, storage failure, account conflicts, cascade deletion/undo, chart calculations and sparse chart ranges. Existing CloudKit and Watch model checks also pass.
- Codemagic check build 12, commit `986d30af9102e917f951745dc70e5cadc6046b8a`, passed all three UI tests and the simulator build including the Watch app. The tests run on an iPhone SE (3rd generation), iOS 26.5, and cover real IndexedDB-to-SwiftUI migration/relaunch, new brands/machines/sets, editing zero values, native navigation, backup controls, accessibility text sizing and keyboard access. Screenshots are exported as CI artifacts.
- An actual Swift export was imported and exported again using the current PWA code at `d8738bf0f5df81335ac010bcd894c58488c185b5`; all collection contents and fields matched.
- Visual inspection prompted fixes for the full set-row tap area, constant chart scales, whole-day axis labels and the compact bodyweight navigation title.

## Release procedure

Run `ios-testflight` on `ios-app`. It repeats the checks, including the added zero-repetition Watch regression, before archiving. Simulator tests use ad-hoc signing so CloudKit entitlements remain present. Distribution uses the existing Apple profiles and uploads the IPA with its Watch companion to App Store Connect. The project-wide Codemagic counter sets the build number; the marketing version is 0.2.0. Verify Apple's processing result after upload. This workflow does not submit an App Store review or assign tester groups.

Physical iPhone/Watch communication, live multi-device iCloud exchange and the iOS 16 runtime are not tested here. Existing local changes in IOS-SETUP.md belong to the user and are excluded from this release.
