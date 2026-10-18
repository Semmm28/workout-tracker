import XCTest

final class PhoneUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    private func launch(_ mode: String, reset: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [mode, "-AppleLanguages", "(nl)", "-AppleLocale", "nl_NL"] + (reset ? ["--ui-test-reset"] : [])
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
        XCTAssertTrue(app.staticTexts["80 kg × 8"].exists)
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
        XCTAssertTrue(app.staticTexts["0 kg × 8"].waitForExistence(timeout: 5))
        app.staticTexts["0 kg × 8"].tap()
        XCTAssertTrue(weight.waitForExistence(timeout: 5)); XCTAssertTrue((weight.value as? String ?? "").hasPrefix("0"))
        app.buttons["Annuleer"].tap()
        app.tabBars.buttons["Recent"].tap(); shot("Recent activity")
        app.tabBars.buttons["Instellingen"].tap()
        XCTAssertTrue(app.buttons["Exporteer data"].exists); XCTAssertTrue(app.buttons["Importeer data"].exists)
        shot("Native backup settings")
    }
}
