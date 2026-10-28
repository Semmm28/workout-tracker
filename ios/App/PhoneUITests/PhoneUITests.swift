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
    private func reveal(_ app: XCUIApplication, _ element: XCUIElement, upward: Bool = true) {
        for _ in 0..<5 {
            if element.exists && element.isHittable { return }
            if upward { app.swipeUp() } else { app.swipeDown() }
        }
        XCTAssertTrue(element.isHittable, app.debugDescription)
    }
    private func number(_ app: XCUIApplication, _ identifier: String, _ value: String) {
        let button = app.buttons[identifier]
        XCTAssertTrue(button.waitForExistence(timeout: 5))
        // The empty edge of the value is a real touch target, not only its digits.
        button.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.5)).tap()
        let input = app.textFields[identifier + "-input"]
        if !input.exists { app.segmentedControls["numeric-entry-mode"].buttons["Typen"].tap() }
        XCTAssertTrue(input.waitForExistence(timeout: 5)); input.tap()
        let displayed = input.value as? String ?? ""
        let old = displayed == input.placeholderValue ? "" : displayed
        if !old.isEmpty { input.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count)) }
        input.typeText(value)
        let entered = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: input)
        XCTAssertEqual(XCTWaiter.wait(for: [entered], timeout: 5), .completed, input.debugDescription)
        let done = app.buttons["numeric-done"]
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: done)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed, done.debugDescription)
        done.tap()
        XCTAssertTrue(button.waitForExistence(timeout: 5))
    }
    private func chooseFixtureMachine(_ app: XCUIApplication) {
        let machine = app.buttons["choose-machine-fixture-machine"]
        XCTAssertFalse(machine.isHittable, "Brands start collapsed")
        let brand = app.descendants(matching: .any).matching(identifier: "training-brand-fixture-brand").firstMatch
        brand.tap()
        XCTAssertTrue(machine.waitForExistence(timeout: 5))
        brand.tap()
        XCTAssertFalse(machine.isHittable)
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("Chest")
        XCTAssertTrue(machine.waitForExistence(timeout: 5)); machine.tap()
    }
    private func assertNumber(_ element: XCUIElement, _ expected: Double) {
        XCTAssertEqual(Double((element.value as? String ?? "").replacingOccurrences(of: ",", with: ".")), expected)
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
        chooseFixtureMachine(app)
        XCTAssertTrue(app.staticTexts["2 × 5–8 herhalingen · 90 sec. rust"].exists)
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
        let count = app.buttons["default-set-count"]
        XCTAssertTrue(count.waitForExistence(timeout: 5))
        XCTAssertEqual(count.value as? String, "2")
        XCTAssertEqual(app.buttons["default-rep-min"].value as? String, "5")
        XCTAssertEqual(app.buttons["default-rep-max"].value as? String, "8")
        app.buttons["default-set-count-increment"].tap()
        XCTAssertEqual(count.value as? String, "3")
        app.buttons["default-rep-min"].tap()
        XCTAssertTrue(app.pickerWheels.firstMatch.waitForExistence(timeout: 5))
        app.pickerWheels.firstMatch.adjust(toPickerWheelValue: "6")
        app.buttons["numeric-done"].tap()
        number(app, "default-rep-max", "9")
        let timer = app.switches["training-rest-timer"]
        reveal(app, timer)
        // SwiftUI exposes the whole row; its center is the label, not the switch.
        timer.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        XCTAssertEqual(timer.value as? String, "0")
        shot("Training settings - three sets and timer disabled")
        app.terminate()
        app.launchArguments.removeAll { $0 == "--ui-test-reset" }; app.launch()
        app.tabBars.buttons["Instellingen"].tap()
        XCTAssertTrue(count.waitForExistence(timeout: 5)); XCTAssertEqual(count.value as? String, "3")
        XCTAssertEqual(app.buttons["default-rep-min"].value as? String, "6")
        XCTAssertEqual(app.buttons["default-rep-max"].value as? String, "9")
        XCTAssertEqual(timer.value as? String, "0")
        app.tabBars.buttons["Workouts"].tap()
        app.segmentedControls.buttons["Schema’s"].tap()
        app.buttons["new-plan"].tap()
        let name = app.textFields["plan-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("Instellingen test")
        app.buttons["plan-add-machine"].tap(); chooseFixtureMachine(app)
        XCTAssertTrue(app.staticTexts["3 × 6–9 herhalingen"].exists)
        app.buttons["save-plan"].tap()
        XCTAssertTrue(app.staticTexts["Instellingen test"].waitForExistence(timeout: 5))
        app.staticTexts["Instellingen test"].tap()
        let exercise = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "edit-plan-item-")).firstMatch
        XCTAssertTrue(exercise.waitForExistence(timeout: 5)); exercise.tap()
        number(app, "plan-item-rep-min", "5")
        app.buttons["save-plan-item"].tap()
        XCTAssertTrue(exercise.waitForExistence(timeout: 5)); exercise.tap()
        XCTAssertEqual(app.buttons["plan-item-rep-min"].value as? String, "5")
        number(app, "plan-item-rep-min", "4")
        app.buttons["Annuleer"].tap()
        exercise.tap(); XCTAssertEqual(app.buttons["plan-item-rep-min"].value as? String, "5")
        app.buttons["Annuleer"].tap()
        app.buttons["start-training"].tap()
        XCTAssertTrue(app.buttons["training-weight-1"].waitForExistence(timeout: 5))
        assertNumber(app.buttons["training-weight-1"], 80)
        number(app, "training-weight-1", "82,75")
        reveal(app, app.buttons["training-weight-2"]); number(app, "training-weight-2", "90")
        reveal(app, app.buttons["training-save-1"], upward: false); app.buttons["training-save-1"].tap()
        XCTAssertTrue(app.buttons["Set 1 ongedaan maken"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Rust overslaan"].exists)
        reveal(app, app.buttons["training-weight-2"])
        assertNumber(app.buttons["training-weight-2"], 90)
        reveal(app, app.buttons["training-weight-3"])
        assertNumber(app.buttons["training-weight-3"], 82.75)
        app.tabBars.buttons["Instellingen"].tap(); reveal(app, timer); timer.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        app.tabBars.buttons["Workouts"].tap()
        reveal(app, app.buttons["training-save-2"], upward: false)
        app.buttons["training-save-2"].tap()
        XCTAssertTrue(app.buttons["Set 2 ongedaan maken"].waitForExistence(timeout: 5))
        reveal(app, app.buttons["Rust overslaan"])
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
        let weight = app.buttons["set-weight"]
        number(app, "set-weight", "0"); number(app, "set-reps", "8")
        XCTAssertTrue(app.buttons["save-top"].isEnabled); shot("Native broad numeric controls")
        app.buttons["save-top"].tap()
        let zero = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "0 kg × 8")).firstMatch
        XCTAssertTrue(zero.waitForExistence(timeout: 5))
        let setID = zero.identifier
        zero.tap()
        XCTAssertTrue(weight.waitForExistence(timeout: 5)); XCTAssertTrue((weight.value as? String ?? "").hasPrefix("0"))
        number(app, "set-weight", "2,5")
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
        reveal(app, app.buttons["Importeer data"])
        XCTAssertTrue(app.buttons["Exporteer data"].isHittable); XCTAssertTrue(app.buttons["Importeer data"].isHittable)
        shot("Native backup settings")
    }
    func testLargeTextLoggingAndNavigation() {
        let app = launch("--ui-test-migration", largeText: true)
        app.staticTexts["Technogym"].tap()
        app.staticTexts["Chest Press"].tap()
        shot("Accessibility text on compact screen")
        app.buttons["Set toevoegen"].firstMatch.tap()
        let weight = app.buttons["set-weight"], reps = app.buttons["set-reps"]
        XCTAssertTrue(weight.waitForExistence(timeout: 5)); assertNumber(weight, 80)
        number(app, "set-weight", "82,75")
        reveal(app, reps); number(app, "set-reps", "8")
        XCTAssertTrue(app.buttons["save-top"].isHittable)
        shot("Large text quick and scroll controls")
        app.buttons["save-top"].tap()
        XCTAssertTrue(app.navigationBars["Chest Press"].waitForExistence(timeout: 5))
        app.buttons["Set toevoegen"].firstMatch.tap()
        XCTAssertTrue(weight.waitForExistence(timeout: 5)); assertNumber(weight, 82.75)
        app.buttons["Annuleer"].tap()
        app.tabBars.buttons["Gewicht"].tap()
        XCTAssertTrue(app.buttons["Meting toevoegen"].waitForExistence(timeout: 5))
        app.buttons["Meting toevoegen"].tap()
        number(app, "set-weight", "80,5")
        app.buttons["set-weight-increment"].tap()
        assertNumber(weight, 80.6)
        app.buttons["save-top"].tap()
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
        let weight = app.buttons["set-weight"]
        XCTAssertTrue(weight.waitForExistence(timeout: 5))
        number(app, "set-weight", "12,5"); number(app, "set-reps", "8")
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
