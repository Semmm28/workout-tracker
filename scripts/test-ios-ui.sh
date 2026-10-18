#!/bin/bash
set -euo pipefail
mkdir -p build
report() {
  xcrun xcresulttool export attachments --path build/PhoneUITests.xcresult --output-path build/ui-evidence || true
  xcrun xcresulttool get test-results summary --path build/PhoneUITests.xcresult || true
}
trap report EXIT
xcrun simctl list -j > build/simulators.json
device_id=$(python3 - <<'PY'
import json, subprocess
d = json.load(open("build/simulators.json"))
runtimes = [r for r in d["runtimes"] if r["isAvailable"] and "iOS" in r["name"]]
runtime = max(runtimes, key=lambda r: tuple(map(int, r["version"].split("."))))
compact = next((t for t in d["devicetypes"] if t["name"] == "iPhone SE (3rd generation)"), None)
if compact:
    print(subprocess.check_output(["xcrun", "simctl", "create", "Workout compact UI tests", compact["identifier"], runtime["identifier"]], text=True).strip())
else:
    phones = [x for x in d["devices"][runtime["identifier"]] if x["isAvailable"] and "iPhone" in x["name"]]
    assert phones, "No iPhone simulator installed"
    print(phones[0]["udid"])
PY
)
xcodebuild -quiet -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,id=$device_id" \
  -derivedDataPath build/DerivedData -resultBundlePath build/PhoneUITests.xcresult \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  test 2>&1 | tee build/xcode-ui-tests.log
