import assert from "node:assert/strict"
import test from "node:test"
import { formatDateTime } from "./date-format.ts"

test("dates use DD/MM/YYYY and Malaysia time across midnight", () => {
  assert.equal(formatDateTime("2026-10-09T16:21:57Z"), "10/10/2026, 00:21:57")
  assert.equal(formatDateTime("2026-01-02T03:04:05Z"), "02/01/2026, 11:04:05")
})
