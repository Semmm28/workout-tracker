#!/bin/bash
set -euo pipefail
mkdir -p build
swiftc ios/App/App/WorkoutEnvelope.swift tests/native-cloud-model.swift -o build/cloud-model-tests
build/cloud-model-tests
swiftc ios/App/App/WorkoutEnvelope.swift ios/App/Shared/WatchModels.swift tests/native-watch-model.swift -o build/watch-model-tests
build/watch-model-tests
swiftc ios/App/App/WorkoutEnvelope.swift ios/App/Shared/WatchModels.swift ios/App/App/PhoneModel.swift tests/native-phone-model.swift -o build/phone-model-tests
build/phone-model-tests
node scripts/verify-native-backup.mjs
