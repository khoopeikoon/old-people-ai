import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanQuestion, googleSearchUrl } from "../lib/helper.js";

test("googleSearchUrl encodes the query", () => {
  assert.equal(
    googleSearchUrl("make text bigger iPhone & iPad"),
    "https://www.google.com/search?q=make%20text%20bigger%20iPhone%20%26%20iPad",
  );
});

test("cleanQuestion trims, caps length and rejects non-strings", () => {
  assert.equal(cleanQuestion("  hi  "), "hi");
  assert.equal(cleanQuestion("x".repeat(5000)).length, 2000);
  assert.equal(cleanQuestion(undefined), "");
  assert.equal(cleanQuestion(42), "");
});
