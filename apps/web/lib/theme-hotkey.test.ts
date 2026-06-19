import assert from "node:assert/strict"
import test from "node:test"

import { shouldToggleThemeForKey } from "./theme-hotkey.ts"

test("ignores keyboard-like events that do not include a key value", () => {
  assert.equal(shouldToggleThemeForKey({}), false)
})

test("matches d key case-insensitively without modifiers", () => {
  assert.equal(shouldToggleThemeForKey({ key: "D" }), true)
})

test("ignores modified key presses", () => {
  assert.equal(shouldToggleThemeForKey({ key: "d", ctrlKey: true }), false)
})
