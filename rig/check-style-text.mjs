// A <style> written as React text children — <style>{`…`}</style> — is escaped on the server: ' " & < > become
// entities, and inside a style element the browser keeps them literally. The rule is broken on the first paint, React
// finds the text different on hydration (#425), gives up on that boundary (#422) and renders it again on the client.
// Found 2026-10-28 on the sign-in page (a quoted font family), /m/agent and the intake controls (quoted attribute
// selectors). Write such CSS as <style dangerouslySetInnerHTML={{ __html: CSS }} />. This reads app/ and components/
// for a text-child style whose CSS (inline, or a same-file constant) holds one of those characters.
//   node rig/check-style-text.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== "node_modules") walk(p); } else if (/\.(tsx|jsx)$/.test(n)) files.push(p); } };
walk("app"); walk("components");
let bad = 0;
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/<style>\{([\s\S]*?)\}<\/style>/g)) {
    let body = m[1].trim();
    if (/^[A-Za-z_][\w.]*$/.test(body)) { const c = s.match(new RegExp(`(?:const|let)\\s+${body.split(".").pop()}\\s*=\\s*\`([\\s\\S]*?)\``)); body = c ? c[1] : ""; }
    const chars = [...new Set([...body.replace(/\$\{[^}]*\}/g, "")].filter((c) => "'\"&<>".includes(c)))];
    if (chars.length) { bad += 1; console.log(`FAIL  ${f}:${s.slice(0, m.index).split("\n").length}  <style> text holds ${chars.join(" ")} — React escapes it; use dangerouslySetInnerHTML`); }
  }
}
console.log(bad ? `\n${bad} FAILED · ${files.length} files read` : `ALL PASSED · ${files.length} files read`);
process.exit(bad ? 1 : 0);
