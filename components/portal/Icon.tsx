"use client";

// CSS-mask icons (platform design's own note): the prototype crashed when
// icon libraries mutated React-owned DOM on deep-context swaps — masks are
// inert backgrounds, immune to that. SVGs are vendored at public/icons/*
// (lucide-static 0.454), never loaded from a CDN.
export default function MaskIcon({
  name,
  size = 17,
  color = "currentColor",
  className,
}: {
  name: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const mask = `url(/icons/${name}.svg) center / contain no-repeat`;
  return (
    <span
      aria-hidden
      className={className}
      style={{
        width: size,
        height: size,
        flex: "none",
        display: "inline-block",
        backgroundColor: color,
        WebkitMask: mask,
        mask,
      }}
    />
  );
}
