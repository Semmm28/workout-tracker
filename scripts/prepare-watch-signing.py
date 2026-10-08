"""Provision the companion with the same existing distribution certificate as iOS."""
import base64
import json
import plistlib
import subprocess

PHONE = "nl.sem.workouttracker"
WATCH = PHONE + ".watchkitapp"


def apple(*arguments):
    result = subprocess.check_output(["app-store-connect", *arguments, "--json", "--no-color"])
    return json.loads(result)


def profile_data(profile):
    content = base64.b64decode(profile["attributes"]["profileContent"], validate=True)
    decoded = subprocess.run(["security", "cms", "-D"], input=content, capture_output=True, check=True)
    return plistlib.loads(decoded.stdout)


def matches(profile, identifier, certificate):
    data = profile_data(profile)
    return (data["Entitlements"]["application-identifier"].split(".", 1)[1] == identifier
            and certificate in data["DeveloperCertificates"])


def main():
    # Reuse the uploaded iPhone profile's public certificate; never export its private key.
    phones = apple("profiles", "list", "--name", "Workout Log App Store", "--type", "IOS_APP_STORE", "--state", "ACTIVE")
    phones = [p for p in phones if profile_data(p)["Entitlements"]["application-identifier"].split(".", 1)[1] == PHONE]
    if len(phones) != 1:
        raise RuntimeError("Expected one active Workout Log App Store profile")
    trusted = profile_data(phones[0])["DeveloperCertificates"]
    certificates = apple("certificates", "list", "--profile-type", "IOS_APP_STORE")
    certificates = [c for c in certificates if base64.b64decode(c["attributes"]["certificateContent"]) in trusted]
    if len(certificates) != 1:
        raise RuntimeError("Expected the existing iPhone distribution certificate")
    certificate = certificates[0]
    der = base64.b64decode(certificate["attributes"]["certificateContent"])

    bundles = apple("bundle-ids", "list", "--bundle-id-identifier", WATCH, "--strict-match-identifier")
    if not bundles:
        bundles = [apple("bundle-ids", "create", WATCH, "--name", "Workout Log Watch", "--platform", "IOS")]
    if len(bundles) != 1 or bundles[0]["attributes"]["identifier"] != WATCH:
        raise RuntimeError("Unexpected Watch bundle identifier")
    profiles = apple("bundle-ids", "profiles", "--bundle-ids", bundles[0]["id"], "--type", "IOS_APP_STORE", "--state", "ACTIVE")
    profile = next((p for p in profiles if matches(p, WATCH, der)), None)
    if profile is None:
        profile = apple("profiles", "create", bundles[0]["id"], "--certificate-ids", certificate["id"], "--type", "IOS_APP_STORE")
    if not matches(profile, WATCH, der):
        raise RuntimeError("Watch profile does not match the companion and iPhone certificate")
    apple("profiles", "get", profile["id"], "--save")
    print(f"Watch App Store profile ready for {WATCH}")


if __name__ == "__main__":
    main()
