import base64
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("watch_signing", Path(__file__).resolve().parents[1] / "scripts/prepare-watch-signing.py")
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)


class WatchSigningTests(unittest.TestCase):
    def test_reuses_existing_certificate_and_valid_profile(self):
        self.run_flow(existing=True)

    def test_creates_only_the_missing_companion_identifier_and_profile(self):
        self.run_flow(existing=False)

    def run_flow(self, existing):
        der = b"existing-public-certificate"
        certificate = {"id": "cert-one", "attributes": {"certificateContent": base64.b64encode(der).decode()}}
        bundle = {"id": "watch-bundle", "attributes": {"identifier": signing.WATCH}}
        phone = {"identifier": signing.PHONE}
        watch = {"id": "watch-profile", "identifier": signing.WATCH}
        answers = [[phone], [certificate], [bundle] if existing else []]
        if not existing:
            answers.append(bundle)
        answers.append([watch] if existing else [])
        if not existing:
            answers.append(watch)
        answers.append(watch)
        def decoded(profile):
            return {"Entitlements": {"application-identifier": "TEAM." + profile["identifier"]}, "DeveloperCertificates": [der]}
        with patch.object(signing, "apple", side_effect=answers) as api, patch.object(signing, "profile_data", side_effect=decoded):
            signing.main()
            calls = [call.args for call in api.call_args_list]
        self.assertEqual(calls[-1], ("profiles", "get", "watch-profile", "--save"))
        creations = [args for args in calls if args[1] == "create"]
        self.assertEqual(len(creations), 0 if existing else 2)
        if not existing:
            self.assertIn("cert-one", creations[-1])
            self.assertEqual(creations[-1][:3], ("profiles", "create", "watch-bundle"))

    def test_ambiguous_phone_profiles_stop_before_creating_resources(self):
        data = {"Entitlements": {"application-identifier": "TEAM." + signing.PHONE}}
        with patch.object(signing, "apple", return_value=[{}, {}]) as api, patch.object(signing, "profile_data", return_value=data):
            with self.assertRaisesRegex(RuntimeError, "one active"):
                signing.main()
            self.assertEqual(api.call_count, 1)


if __name__ == "__main__":
    unittest.main()
