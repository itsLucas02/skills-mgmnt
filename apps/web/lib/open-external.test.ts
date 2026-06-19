import assert from "node:assert/strict"
import test from "node:test"

import { getExplorerSelectArgs, getTargetLine } from "./open-external.ts"

test("builds explorer select argument as one Windows-compatible argument", () => {
  assert.deepEqual(getExplorerSelectArgs("C:\\Users\\User\\file with spaces.md"), [
    "/select,C:\\Users\\User\\file with spaces.md",
  ])
})

test("defaults missing target lines to one", () => {
  assert.equal(getTargetLine(undefined), 1)
})
