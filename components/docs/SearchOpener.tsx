"use client";

import MaskIcon from "@/components/portal/Icon";

// A search field on a page (home, not found) that opens the shell's search dialog (DocsFrame listens for the event).
export const OPEN_SEARCH = "dx-open-search";

export default function SearchOpener({ placeholder, big = false }: { placeholder: string; big?: boolean }) {
  return (
    <button type="button" className={`dx-searchopener${big ? " big" : ""}`} onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH))}>
      <MaskIcon name="search" size={big ? 18 : 17} className="ic" />
      <span className="ph">{placeholder}</span>
      <kbd className="dx-kbd">⌘K</kbd>
    </button>
  );
}
