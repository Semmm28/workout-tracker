#!/bin/bash
set -euo pipefail
mkdir -p build
trap 'xcrun xcresulttool export attachments --path build/PhoneUITests.xcresult --output-path build/ui-evidence || true' EXIT
xcrun simctl list devices available -j > build/simulators.json
device_id=$(python3 -c 'import json; d=json.load(open("build/simulators.json")); phones=[x for k,v in d["devices"].items() if "iOS" in k for x in v if "iPhone" in x["name"]]; assert phones,"No iPhone simulator installed"; print(phones[0]["udid"])')
xcodebuild -quiet -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,id=$device_id" \
  -derivedDataPath build/DerivedData -resultBundlePath build/PhoneUITests.xcresult \
  CODE_SIGNING_ALLOWED=NO test 2>&1 | tee build/xcode-ui-tests.log
