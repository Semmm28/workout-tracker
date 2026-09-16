# iOS-builds vanuit Windows

Deze branch (`ios-app`) bevat de eerste Capacitor-versie van Workout Log.
De bestaande PWA blijft op `main`. De workflows hieronder publiceren geen website,
schrijven geen commits terug en starten alleen handmatig.

## Wat nu al kan

1. Open dit project in Codemagic.
2. Selecteer de branch **ios-app**.
3. Gebruik **Check for configuration file** om `codemagic.yaml` te laden.
4. Start **iOS - controlebuild zonder Apple-koppeling** (`ios-check`).

Deze workflow installeert de vastgelegde npm-pakketten, draait de tests, bundelt
de app en compileert hem met Xcode voor de iOS Simulator. Hiervoor zijn geen
Apple-certificaten, API-sleutel of provisioningprofiel nodig.

Het resultaat `WorkoutLog-simulator.zip` is alleen geschikt voor een iOS Simulator
op een Mac. Het is **geen installeerbare IPA voor je iPhone**. De belangrijkste
uitkomst is dat de native compilatie succesvol is; bekijk bij fouten de logs.

Op 16 september 2026 is deze controlebuild succesvol uitgevoerd met Xcode 26.6
op Codemagic: alle 56 tests geslaagd, native compilatie geslaagd en
`WorkoutLog-simulator.zip` aangemaakt. [Bekijk build 1](https://codemagic.io/app/6aa9f51e50714ad0defcbcb7/build/6aa9fa73bb36a18bce7d2428).
Deze controle test nog geen installatie of gebruik op een echte iPhone.

## Daarna: een IPA en TestFlight

De voorbereide identifiers zijn:

| Instelling | Waarde |
| --- | --- |
| Appnaam | Workout Log |
| Bundle ID | `nl.sem.workouttracker` |
| Codemagic Apple-koppeling | `Codemagic` |
| Appversie | `0.1.0` |
| Eerste ondersteunde iOS-versie | iOS 16 |

De Bundle ID is nog niet geregistreerd bij Apple. Registreer deze in Apple
Developer en maak een apprecord aan in App Store Connect met dezelfde ID.
Maak een App Store Connect API-sleutel en voeg deze in Codemagic toe onder
**Team settings > Team integrations > Developer Portal**, met de naam `Codemagic`.
Voeg ook een **Apple Distribution**-certificaat en een bijpassend
**App Store Connect**-provisioningprofiel toe aan Codemagic's Code signing identities.
Bewaar `.p8`, `.p12` en `.mobileprovision`-bestanden buiten GitHub.

Start daarna **iOS - IPA en upload naar TestFlight** (`ios-testflight`). De workflow
maakt een ondertekende `.ipa` en uploadt hem naar App Store Connect. De upload
verschijnt na Apples verwerking in TestFlight. Automatische indiening voor
beta-review en de openbare App Store staat uit; configureer bij de eerste upload
de testinformatie en interne/externe groepen in App Store Connect.

Voor vrienden gebruik je externe testers. Dien de build in voor beta-review en
deel na goedkeuring de uitnodiging. Exporteer niet met 'TestFlight Internal Only',
want zo'n build kan niet naar externe testers. Elke TestFlight-build vervalt
90 dagen na uploaden.

## Ontwikkelen en controleren

Gebruik Node.js 22 of nieuwer:

```sh
npm ci
npm test
npm run ios:sync
npm run check:ios
```

`npm run build` maakt uitsluitend de native webbundle in `dist/`. De statische
PWA blijft draaien via de oorspronkelijke `index.html`, `app.js` en `js/`.
Capacitor gebruikt Swift Package Manager; CocoaPods is niet nodig voor dit project.
Het Xcode-project staat in `ios/App/App.xcodeproj`, de gedeelde scheme heet `App`.
Compileren en ondertekenen gebeurt op Codemagic's macOS-machine.

Het buildnummer wordt gebaseerd op Codemagic's `PROJECT_BUILD_NUMBER + 1`.
Wanneer je later vanuit een ander buildsysteem hogere nummers uploadt, moet deze
teller/strategie worden aangepast. De appversie staat in `package.json`.

De Bundle ID wijzigen: pas `capacitor.config.json` en
`codemagic.yaml > workflows > ios-testflight > environment > ios_signing` aan,
voer `npm run ios:sync` uit en registreer dezelfde ID bij Apple. Wijzig na eerste
distributie de appidentiteit niet zomaar: een andere ID wordt een andere app.

De override voor `xcode > uuid` gebruikt de laatste CommonJS-compatibele v11-fix
voor de transitive npm-advisory in Capacitor CLI. `xcode` gebruikt alleen `uuid.v4()`.

## Gedrag van deze eerste versie

- Alle webcode, stijlen en afbeeldingen zijn lokaal in de app opgenomen.
- Native builds registreren geen serviceworker; updates komen via TestFlight/App Store.
- JSON-export gebruikt het native deelmenu, met de optie om de backup in Bestanden te bewaren.
- JSON-import gebruikt de bestaande bestandskiezer en importvalidatie.
- Safari/PWA-data worden niet automatisch overgenomen. Exporteer uit de PWA en importeer in de app.
- De eerste versie gebruikt nog de bestaande IndexedDB-database. Maak backups;
  de in het advies genoemde native SQLite-opslag is nog een vervolgstap voor langdurig gebruik.
- De privacy-manifest bevat de door Filesystem vereiste file-timestampreden. Er is
  geen analytics, account of backend toegevoegd. Controleer privacy-informatie opnieuw
  wanneer er later SDK's of netwerkfuncties bijkomen.

## Nog op een echte iPhone te testen

Na een geslaagde cloudbuild: offline starten, workouts opslaan, afsluiten/heropenen,
import/export via Bestanden, toetsenbord/schermranden en gegevensbehoud na een
TestFlight-update. Een geslaagde Windows-webbuild bewijst de native iOS-werking niet.

## Documentatie

- [Capacitor-installatie](https://capacitorjs.com/docs/getting-started)
- [Codemagic iOS-signing](https://docs.codemagic.io/yaml-code-signing/signing-ios/)
- [Codemagic App Store Connect-upload](https://docs.codemagic.io/yaml-publishing/app-store-connect/)
- [Apple: externe testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers)
