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
    func testTrainingPlanSaveResumeAndFinish() {
        let app = launch("--ui-test-migration")
        XCTAssertTrue(app.navigationBars["Workouts"].staticTexts["Workouts"].isHittable)
        shot("Workouts - visible title and machine controls")
        app.staticTexts["Technogym"].tap()
        XCTAssertTrue(app.staticTexts["Vorige set: 80 kg × 8"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.segmentedControls.buttons["Schema’s"].tap()
        XCTAssertTrue(app.navigationBars["Workouts"].staticTexts["Workouts"].isHittable)
        XCTAssertTrue(app.buttons["edit-plans"].exists)
        XCTAssertTrue(app.buttons["new-plan"].isHittable)
        app.buttons["new-plan"].tap()
        let name = app.textFields["plan-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("Bovenlichaam A")
        app.buttons["plan-add-machine"].tap()
        app.buttons["choose-machine-fixture-machine"].tap()
        XCTAssertTrue(app.steppers["Sets: 2"].exists)
        app.buttons["save-plan"].tap()
        XCTAssertTrue(app.staticTexts["Bovenlichaam A"].waitForExistence(timeout: 5))
        app.buttons["edit-plans"].tap()
        shot("Schemas - visible title and edit controls")
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "edit-plan-")).firstMatch.tap()
        XCTAssertTrue(app.textFields["plan-name"].waitForExistence(timeout: 5))
        app.buttons["Annuleer"].tap()
        app.buttons["edit-plans"].tap()
        app.staticTexts["Bovenlichaam A"].tap()
        app.buttons["start-training"].tap()
        let save = app.buttons["training-save-1"]
        XCTAssertTrue(save.waitForExistence(timeout: 5)); save.tap()
        XCTAssertTrue(app.buttons["Set 1 ongedaan maken"].waitForExistence(timeout: 5))
        shot("Schema - saved set and brand history")
        app.terminate()
        app.launchArguments.removeAll { $0 == "--ui-test-reset" }; app.launch()
        XCTAssertTrue(app.tabBars.buttons["Workouts"].waitForExistence(timeout: 20))
        app.segmentedControls.buttons["Schema’s"].tap()
        app.buttons["Hervat Bovenlichaam A"].tap()
        XCTAssertTrue(app.buttons["Set 1 ongedaan maken"].waitForExistence(timeout: 5))
        app.swipeUp()
        app.buttons["finish-training"].tap()
        app.buttons["Bewaar training"].tap()
        XCTAssertTrue(app.staticTexts["1 sets · 640 kg volume"].waitForExistence(timeout: 5))
        shot("Schema - completed workout")
    }
    func testTrainingPreferencesPersistAndControlNewSetsAndTimer() {
        let app = launch("--ui-test-migration")
        app.tabBars.buttons["Instellingen"].tap()
        let count = app.steppers["default-set-count"]
        XCTAssertTrue(count.waitForExistence(timeout: 5))
        XCTAssertTrue(count.label.contains("2"))
        count.buttons.element(boundBy: 1).tap()
        XCTAssertTrue(count.label.contains("3"))
        let timer = app.switches["training-rest-timer"]
        // SwiftUI exposes the whole row; its center is the label, not the switch.
        timer.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        XCTAssertEqual(timer.value as? String, "0")
        shot("Training settings - three sets and timer disabled")
        app.terminate()
        app.launchArguments.removeAll { $0 == "--ui-test-reset" }; app.launch()
        app.tabBars.buttons["Instellingen"].tap()
        XCTAssertTrue(count.waitForExistence(timeout: 5)); XCTAssertTrue(count.label.contains("3"))
        XCTAssertEqual(timer.value as? String, "0")
        app.tabBars.buttons["Workouts"].tap()
        app.segmentedControls.buttons["Schema’s"].tap()
        app.buttons["new-plan"].tap()
        let name = app.textFields["plan-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("Instellingen test")
        app.buttons["plan-add-machine"].tap(); app.buttons["choose-machine-fixture-machine"].tap()
        XCTAssertTrue(app.steppers["Sets: 3"].exists)
        XCTAssertFalse(app.steppers["Rust: 90 seconden"].exists)
        app.buttons["save-plan"].tap()
        XCTAssertTrue(app.staticTexts["Instellingen test"].waitForExistence(timeout: 5))
        app.staticTexts["Instellingen test"].tap(); app.buttons["start-training"].tap()
        XCTAssertTrue(app.buttons["training-save-1"].waitForExistence(timeout: 5)); app.buttons["training-save-1"].tap()
        XCTAssertTrue(app.buttons["Set 1 ongedaan maken"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Rust overslaan"].exists)
        app.tabBars.buttons["Instellingen"].tap(); timer.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        app.tabBars.buttons["Workouts"].tap()
        if !app.buttons["training-save-2"].isHittable { app.swipeUp() }
        app.buttons["training-save-2"].tap()
        XCTAssertTrue(app.buttons["Set 2 ongedaan maken"].waitForExistence(timeout: 5))
        app.swipeUp()
        XCTAssertTrue(app.buttons["Rust overslaan"].waitForExistence(timeout: 5))
        shot("Training - timer enabled after saving")
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
    func testSetSummaryFollowsChartMetric() {
        let app = launch("--ui-test-migration")
        app.staticTexts["Technogym"].tap()
        app.staticTexts["Chest Press"].tap()
        let row = app.buttons["set-fixture-set"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(row.label.contains("101,33 kg e1RM"), row.label)
        for (selection, summary) in [
            ("Hoogste volume per dag", "640 kg volume"),
            ("Hoogste e1RM per dag", "101,33 kg e1RM"),
            ("Eerste set · e1RM", "101,33 kg e1RM"),
            ("Tweede set · e1RM", "101,33 kg e1RM"),
            ("Derde set · e1RM", "101,33 kg e1RM"),
            ("Hoogste volume per dag", "640 kg volume")
        ] {
            app.buttons["chart-mode"].tap()
            app.buttons[selection].tap()
            let updated = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", summary), object: row)
            XCTAssertEqual(XCTWaiter.wait(for: [updated], timeout: 5), .completed, row.label)
            XCTAssertTrue(row.label.contains("80 kg × 8"))
        }
        shot("Volume chart with matching set summary")
        app.terminate()
        app.launchArguments.removeAll { $0 == "--ui-test-reset" }; app.launch()
        XCTAssertTrue(app.staticTexts["Technogym"].waitForExistence(timeout: 20))
        app.staticTexts["Technogym"].tap()
        app.staticTexts["Chest Press"].tap()
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(row.label.contains("640 kg volume"), "The persisted graph choice must also apply to set summaries after reopening")
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
        XCTAssertTrue(app.navigationBars["Instellingen"].waitForExistence(timeout: 5))
        // Training preferences move the backup section below the fold on compact phones.
        app.swipeUp()
        XCTAssertTrue(app.buttons["Exporteer data"].isHittable); XCTAssertTrue(app.buttons["Importeer data"].isHittable)
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
    func testLargeHistorySaveAndScroll() {
        let app = launch("--ui-test-large-history")
        app.staticTexts["Testhistorie"].tap()
        XCTAssertTrue(app.staticTexts["Apparaat 00"].waitForExistence(timeout: 5))
        app.swipeUp(); app.swipeDown()
        app.staticTexts["Apparaat 00"].tap()
        let addButton = app.buttons["Set toevoegen"].firstMatch
        XCTAssertTrue(addButton.waitForExistence(timeout: 5))
        app.swipeUp(); app.swipeUp(); app.swipeDown()
        addButton.tap()
        let weight = app.textFields["set-weight"], reps = app.textFields["set-reps"]
        XCTAssertTrue(weight.waitForExistence(timeout: 5))
        weight.tap(); weight.typeText("12,5"); reps.tap(); reps.typeText("8")
        let start = Date()
        app.buttons["save-top"].tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: weight)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 3), .completed, "Saving must dismiss the form promptly with 5000 sets")
        let elapsed = Date().timeIntervalSince(start)
        let timing = XCTAttachment(string: String(format: "5000-set simulator save and dismissal: %.3fs", elapsed))
        timing.name = "Large history save timing"; timing.lifetime = .keepAlways; add(timing)
        app.tabBars.buttons["Recent"].tap()
        XCTAssertTrue(app.navigationBars["Recent"].waitForExistence(timeout: 3))
        app.swipeUp(); app.swipeDown()
        shot("5000 sets - recent history")
    }
}
