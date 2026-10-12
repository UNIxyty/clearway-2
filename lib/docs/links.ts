// Links in docs content. A writer links to another docs page by its address, without /docs:
//   [Operators](digital-wall/operators)               a page
//   [Add an operator](digital-wall/operators#add-an-operator)   a task on a page (the task title, as an address)
//   [Digital Wall](digital-wall)                     a section
//   [the glossary](glossary)                          the glossary
//   [NOTAM](glossary#notam)                           one term in it
//   [Help & support](/help)                          a portal page: starts with /
//   [Leon](https://…)                                 the outside world
// resolve() turns that into a real URL; the docs check fails on any docs link that leads nowhere (no lying links).
export type LinkTarget = { href: string; internal: boolean; section?: string; page?: string; task?: string };

export function resolveLink(raw: string): LinkTarget {
  if (/^(https?:|mailto:)/i.test(raw)) return { href: raw, internal: false };
  if (raw.startsWith("/")) return { href: raw, internal: false };
  const [pathPart, task] = raw.split("#");
  const parts = pathPart.split("/").filter(Boolean);
  if (parts[0] === "glossary") return { href: `/docs/glossary${task ? `#term-${task}` : ""}`, internal: true, section: "glossary", task };
  const [section, page] = parts;
  const href = `/docs/${parts.join("/")}${task ? `#fn-${task}` : ""}`;
  return { href, internal: true, section, page, task };
}
