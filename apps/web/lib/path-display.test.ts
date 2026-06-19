import assert from "node:assert/strict"
import test from "node:test"

import { getCompactPathLabel } from "./path-display.ts"

test("keeps short paths unchanged", () => {
  assert.equal(getCompactPathLabel(".codex\\skills\\SKILL.md"), ".codex\\skills\\SKILL.md")
})

test("compacts long Windows paths to the most useful tail segments", () => {
  assert.equal(
    getCompactPathLabel(".codex\\plugins\\cache\\openai-curated\\superpowers\\202e9242\\skills\\systematic-debugging\\SKILL.md"),
    "...\\superpowers\\202e9242\\skills\\systematic-debugging\\SKILL.md"
  )
})
