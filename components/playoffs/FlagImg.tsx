'use client';

interface FlagImgProps {
  emoji: string;
  size?: number;
}

export function FlagImg({ emoji, size = 20 }: FlagImgProps) {
  if (!emoji) {
    return (
      <span
        style={{ width: size, height: Math.round(size * 0.74), display: 'inline-block', background: '#e5e7eb', borderRadius: 2, verticalAlign: 'middle', flexShrink: 0 }}
      />
    );
  }
  const pts = [...emoji].map(c => (c.codePointAt(0) ?? 0).toString(16)).join('-');
  const src = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${pts}.png`;
  return (
    <img
      src={src}
      alt={emoji}
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, imageRendering: 'auto' }}
    />
  );
}
