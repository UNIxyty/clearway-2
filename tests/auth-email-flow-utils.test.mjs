import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  isValidEmail,
  isValidPassword,
  sha256Hex,
  buildAppUrl,
} from "../lib/auth-email-flow-utils.mjs";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
});

test("isValidEmail accepts standard addresses", () => {
  assert.equal(isValidEmail("pilot.ops+1@clearway.ai"), true);
  assert.equal(isValidEmail("not-an-email"), false);
});

test("isValidPassword enforces minimum length", () => {
  assert.equal(isValidPassword("1234567"), false);
  assert.equal(isValidPassword("12345678"), true);
});

test("sha256Hex produces deterministic digest", () => {
  assert.equal(
    sha256Hex("clearway"),
    "398d1bf02cb0d0b77cffd30b8538617dab9cabcac2b561de06662669d75e99bf",
  );
});

test("buildAppUrl falls back to request origin", () => {
  assert.equal(
    buildAppUrl("https://clearway.example.com", "http://localhost:3000"),
    "https://clearway.example.com",
  );
  assert.equal(buildAppUrl("", "http://localhost:3000"), "http://localhost:3000");
});
