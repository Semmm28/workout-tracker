import XCTest

final class PhoneUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    private func launch(_ mode: String, reset: Bool = true, largeText: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [mode, "-AppleLanguages", "(nl)", "-AppleLocale", "nl_NL"] + (reset ? ["--ui-test-reset"] : [])
        if largeText { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Workouts"].waitForExistence(timeout: 35), app.debugDescription)
        return app
    }
    private func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testLegacyMigrationAndRelaunch() {
        let app = launch("--ui-test-migration")
        XCTAssertTrue(app.staticTexts["Technogym"].waitForExistence(timeout: 10))
        app.staticTexts["Technogym"].tap()
        XCTAssertTrue(app.staticTexts["Chest Press"].waitForExistence(timeout: 5))
        app.staticTexts["Chest Press"].tap()
        XCTAssertTrue(app.staticTexts["Stoel op stand 4"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["set-fixture-set"].label.contains("80 kg × 8"))
        shot("Migrated native history")
        app.tabBars.buttons["Gewicht"].tap()
        XCTAssertTrue(app.staticTexts["80,5 kg"].waitForExistence(timeout: 5))
        shot("Bodyweight")
        app.terminate()
        app.launchArguments.removeAll { $0 == "--ui-test-reset" }; app.launch()
        XCTAssertTrue(app.staticTexts["Technogym"].waitForExistence(timeout: 20))
    }
    func testCreateEditZeroAndNativeNavigation() {
        let app = launch("--ui-test-empty")
        app.buttons["Merk toevoegen"].firstMatch.tap()
        let name = app.textFields["entity-name"]; XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("Testmerk")
        app.buttons["save-top"].tap()
        XCTAssertTrue(app.staticTexts["Testmerk"].waitForExistence(timeout: 5)); app.staticTexts["Testmerk"].tap()
        app.buttons["Apparaat toevoegen"].firstMatch.tap()
        let machine = app.textFields["entity-name"]; XCTAssertTrue(machine.waitForExistence(timeout: 5)); machine.tap(); machine.typeText("Leg Press")
        app.buttons["save-top"].tap()
        XCTAssertTrue(app.staticTexts["Leg Press"].waitForExistence(timeout: 5)); app.staticTexts["Leg Press"].tap()
        app.buttons["Set toevoegen"].firstMatch.tap()
        let weight = app.textFields["set-weight"], reps = app.textFields["set-reps"]
        XCTAssertTrue(weight.waitForExistence(timeout: 5)); weight.tap(); weight.typeText("0"); reps.tap(); reps.typeText("8")
        XCTAssertTrue(app.buttons["save-top"].isEnabled); shot("Native set editor with keyboard")
        app.buttons["save-top"].tap()
        let zero = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "0 kg × 8")).firstMatch
        XCTAssertTrue(zero.waitForExistence(timeout: 5))
        let setID = zero.identifier
        zero.tap()
        XCTAssertTrue(weight.waitForExistence(timeout: 5)); XCTAssertTrue((weight.value as? String ?? "").hasPrefix("0"))
        weight.tap()
        weight.coordinate(withNormalizedOffset: CGVector(dx: 0.99, dy: 0.5)).tap()
        weight.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (weight.value as? String ?? "").count))
        weight.typeText("2,5")
        app.buttons["save-top"].tap()
        let changed = app.buttons[setID]
        XCTAssertTrue(changed.waitForExistence(timeout: 5)); XCTAssertTrue(changed.label.contains("2,5 kg × 8"))
        changed.tap()
        XCTAssertTrue(weight.waitForExistence(timeout: 5))
        app.buttons["Annuleer"].tap()
        app.tabBars.buttons["Recent"].tap(); shot("Recent activity")
        app.tabBars.buttons["Instellingen"].tap()
        XCTAssertTrue(app.buttons["Exporteer data"].exists); XCTAssertTrue(app.buttons["Importeer data"].exists)
        shot("Native backup settings")
    }
    func testLargeTextLoggingAndNavigation() {
        let app = launch("--ui-test-migration", largeText: true)
        app.staticTexts["Technogym"].tap()
        app.staticTexts["Chest Press"].tap()
        shot("Accessibility text on compact screen")
        app.buttons["Set toevoegen"].firstMatch.tap()
        let weight = app.textFields["set-weight"], reps = app.textFields["set-reps"]
        XCTAssertTrue(weight.waitForExistence(timeout: 5)); weight.tap(); weight.typeText("82,5")
        if !reps.isHittable { app.swipeUp() }
        reps.tap(); reps.typeText("8")
        XCTAssertTrue(app.buttons["save-top"].isHittable)
        shot("Large text editor with keyboard")
        app.buttons["save-top"].tap()
        XCTAssertTrue(app.navigationBars["Chest Press"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Gewicht"].tap()
        XCTAssertTrue(app.buttons["Meting toevoegen"].waitForExistence(timeout: 5))
        shot("Large text bodyweight")
    }
}
