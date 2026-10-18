# SwiftUI release checklist

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

## Required verification

- [ ] Automatic read-only migration of all IndexedDB collections, sync revisions/tombstones, owner binding and chart preference; original database retained.
- [ ] Atomic native writes; failed migration/import/write leaves prior data untouched.
- [ ] Brands/machines: search, counts, add/edit/delete with cascade confirmation, undo, reorder, machine notes.
- [ ] Sets: quick logging, add/edit/delete/undo, date/time, zero values, optional RPE/notes, chronological day groups, e1RM personal records.
- [ ] Charts: daily maximum e1RM/volume and first/second/third set, persistent selection; bodyweight chart/history.
- [ ] Recent activity: daily expandable groups and navigation to machines.
- [ ] Bodyweight: add and delete/undo with dates.
- [ ] PWA backup round trip, optional/unknown fields, number strings, IDs/timestamps, repeat import, corrupt/unsupported file rejection.
- [ ] Existing opt-in iCloud sync/account binding and Watch inbox acknowledgement only after durable storage.
- [ ] Simulator launch, migration/relaunch, native navigation/forms and screenshots; small screen and accessibility sizing.
- [ ] Existing JS/native tests, signed archive including Watch, processed App Store Connect upload.

Physical iPhone/Watch testing remains separate from simulator and model checks. Existing local changes in IOS-SETUP.md belong to the user and are excluded from this release.
