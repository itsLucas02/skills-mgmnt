import { test } from "node:test"
import assert from "node:assert/strict"
import { isLocalRequest } from "./local-request.ts"
test("local mutation guards reject cross-site and malformed origins", () => {
  const request = (origin: string) =>
    new Request("http://localhost:3020", {
      headers: { host: "localhost:3020", origin },
    })
  assert.equal(isLocalRequest(request("http://localhost:3020")), true)
  assert.equal(isLocalRequest(request("https://example.com")), false)
  assert.equal(isLocalRequest(request("invalid")), false)
})
