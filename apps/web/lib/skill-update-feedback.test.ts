import { test } from "node:test"
import assert from "node:assert/strict"
import { updateOutcomeMessage } from "./skill-update-feedback.ts"

test("partial batch outcomes name the blocked skill and preserve successful backups", () => {
  const message = updateOutcomeMessage([
    ...["break", "explain-interface", "interface-review", "variant"].map(name => ({ name, token: name, success: true, backup: `backup/${name}` })),
    { token: "fifth", name: "shadcn", success: false, error: "Upstream content changed" },
  ])
  assert.match(message, /^4 updated, 1 blocked/)
  assert.match(message, /shadcn: blocked\. Upstream content changed/)
  assert.match(message, /break: updated\. Backup: backup\/break/)
})
