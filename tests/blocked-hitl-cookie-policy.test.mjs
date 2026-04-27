import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldRequireBrowserCookie } from "../lib/blocked-hitl-cookie-policy.mjs";

test("Netherlands HITL scrape can run without browser cookies", () => {
  assert.equal(shouldRequireBrowserCookie("netherlands"), false);
});

test("generic blocked HITL countries still require browser cookies", () => {
  assert.equal(shouldRequireBrowserCookie("germany"), true);
  assert.equal(shouldRequireBrowserCookie("slovenia"), true);
});
