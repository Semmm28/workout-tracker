# Apple Watch companion

The `WorkoutWatch` target is embedded in the existing iPhone app. The minimum
version is watchOS 9; the iPhone app still requires iOS 16. Both targets receive
the same app version and Codemagic build number.

## Use

Open the iPhone app after installing the update to send its brands, machines and
last set values to the paired Watch. On the Watch, choose a recent machine or
**Alle apparaten → Merken → Apparaat**. Tap weight or repetitions to adjust with
the Digital Crown or plus/minus, then **Log set**. The set is saved on the Watch
before the confirmation and rest timer appear. **Vandaag** lets you correct
Watch-created sets. Manage brands and machines on the iPhone.

The Watch retains changes offline. The iPhone keeps a durable native inbox until
its app has committed them to IndexedDB. Only a snapshot containing that saved
revision acknowledges a Watch change. Open the iPhone app to finish processing
queued changes when it has been suspended or closed. Existing iCloud sync can
then distribute them to other phones; iCloud is not required for Watch pairing.
Duplicate messages do not duplicate sets. Deletion records are retained so an
older offline copy cannot resurrect a deleted set.

## Signing and release

The release workflow registers `nl.sem.workouttracker.watchkitapp` and creates
its App Store profile through the existing Codemagic Apple integration when
needed. It reuses the distribution certificate from `Workout Log App Store`,
and checks the bundle identifier and certificate before installing the profile.
No new signing certificate, private key export or Watch capabilities are needed.

Run `ios-check` first. It runs JavaScript and native model tests, builds the
simulator application, and verifies the embedded Watch app exists. Then run
`ios-testflight`; it checks the Watch executable is present in the exported IPA
before uploading to App Store Connect. The actual build and signing still need
to succeed before this source change can be described as a TestFlight release.

## Device acceptance check

WatchConnectivity background transfers require a real paired iPhone and Watch.
On the pair, verify first sync and brand ordering, Crown input, one-tap logging,
rest notification with the screen asleep, edit and undo, and appearance in the
iPhone history. Turn off connectivity, log multiple sets, close/reopen both apps,
reconnect and verify each set appears exactly once. Also edit/delete a synced
Watch set on the iPhone before reconnecting the Watch, and check the newer phone
revision is preserved. Test on a small watchOS 9 device as well as Series 9.
