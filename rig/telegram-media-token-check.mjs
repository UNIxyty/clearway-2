// Telegram help attachments: a media token opens ONE file for ONE person for 15 minutes (2026-11-02). Until then one
// hourly code opened every help attachment, tied to no file and no person, for up to two hours if it leaked.
// Tests lib/help/telegram-webapp.ts itself (transpiled in memory), with a rig-only bot secret and invented ids.
//   node rig/telegram-media-token-check.mjs
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { randomBytes } from "node:crypto";

process.env.TELEGRAM_BUG_BOT_TOKEN = randomBytes(24).toString("hex");   // a throwaway secret made for this run; never a real one
process.env.TELEGRAM_DEVELOPER_USER_IDS = "111111111,222222222";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const src = readFileSync("lib/help/telegram-webapp.ts", "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const dir = mkdtempSync(path.join(tmpdir(), "tg-media-")); const file = path.join(dir, "telegram-webapp.mjs"); writeFileSync(file, js);
const { mediaTokenFor, validateMediaToken, MEDIA_TTL_S } = await import(file);
rmSync(dir, { recursive: true, force: true });

const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002", DEV = 111111111, OTHER_DEV = 222222222, NOT_DEV = 333333333;
const t = mediaTokenFor(A, DEV);
ok(validateMediaToken(t, A) === DEV, "a token opens the file it was issued for, to the person it was issued to");
ok(validateMediaToken(t, B) === null, "the same token does not open another file");
const forged = t.replace(`.${DEV}.`, `.${OTHER_DEV}.`);
ok(validateMediaToken(forged, A) === null, "changing the person in the token breaks it (the signature names the person)");
ok(validateMediaToken(t, A, Date.now() + (MEDIA_TTL_S + 1) * 1000) === null, `it expires: refused after ${MEDIA_TTL_S / 60} minutes`);
ok(validateMediaToken(mediaTokenFor(A, NOT_DEV), A) === null, "a token issued to someone not on the developer list opens nothing");
process.env.TELEGRAM_DEVELOPER_USER_IDS = "222222222";
ok(validateMediaToken(t, A) === null, "taken off the developer list: their unexpired tokens stop working");
process.env.TELEGRAM_DEVELOPER_USER_IDS = "111111111,222222222";
const far = mediaTokenFor(A, DEV, Date.now() + 24 * 3600e3);
ok(validateMediaToken(far, A) === null, "a token claiming an expiry further out than 15 minutes is refused");
ok(validateMediaToken("", A) === null && validateMediaToken("0123456789abcdef0123456789abcdef", A) === null, "the old hourly form (32 hex) and an empty token open nothing");
const flip = t.slice(0, -1) + (t.endsWith("A") ? "B" : "A");
ok(validateMediaToken(flip, A) === null, "one character of the signature changed: refused");
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
