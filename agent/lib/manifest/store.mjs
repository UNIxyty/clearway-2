// Passenger Manifest storage. The file holds passport numbers and dates of birth, so it lives with the intake mail —
// on the intake root (INTAKE_ROOT, /mnt/hdd-storage/intake on the server), never the general generated-files folder:
//   <intake root>/manifests/YYYY/MM/<uuid>/PAX-Manifest_<callsign>_<date>.pdf      directories 0700, file 0600
// It is reachable only through the agent's signed-in, owner-only /api/files/:id route (the row in
// agent_generated_files, kind "pax-manifest", storage key "intake:…"), and its bytes are deleted after
// MANIFEST_RETENTION_DAYS. The row (who, when, which flight's filename, hash) stays as the record that it existed.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, chmod } from "node:fs/promises";
import path from "node:path";
import { generatedPath } from "../files/generate.mjs";
import { recordGeneratedFile } from "../files/store.mjs";

export const PAX_NOTE_FILE = "pax-note.txt";

export async function saveManifest({ pdf, filename, title, user, conversationId = null, paxNote = null, now = new Date() }) {
  const id = randomUUID();
  const key = path.posix.join("manifests", String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"), id, filename);
  const target = generatedPath(`intake:${key}`);
  const root = generatedPath("intake:manifests/x").replace(/\/x$/, "");
  // Every directory from manifests/ down is owner-only, including ones created earlier by another umask.
  for (let dir = path.dirname(target); dir.startsWith(root); dir = path.dirname(dir)) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
    if (dir === root) break;
  }
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, pdf, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, target);
  // The operator's free-text passenger note (personal data), when Leon has one: beside the PDF, owner-only, deleted
  // with it by retention, served only by the signed-in owner-only GET /api/files/:id/pax-note.
  if (paxNote) {
    const notePath = path.join(path.dirname(target), PAX_NOTE_FILE);
    await writeFile(`${notePath}.tmp`, paxNote, { mode: 0o600 });
    await chmod(`${notePath}.tmp`, 0o600);
    await rename(`${notePath}.tmp`, notePath);
  }
  const file = {
    id, filename, storageKey: `intake:${key}`, mime: "application/pdf", bytes: pdf.length,
    sha256: createHash("sha256").update(pdf).digest("hex"), downloadPath: `/agent/api/files/${id}`,
  };
  await recordGeneratedFile({ file, user, conversationId, kind: "pax-manifest", title, sources: [] });
  return file;
}
