'use client';

export interface ElbowPath {
  d: string;
  active: boolean;
}

interface BracketConnectorsProps {
  paths: ElbowPath[];
  width: number;
  height: number;
}

export function BracketConnectors({ paths, width, height }: BracketConnectorsProps) {
  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none z-0"
      width={width}
      height={height}
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={p.active ? '#1a56db' : '#cbd5e1'}
          strokeWidth={p.active ? 2 : 1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ transition: 'stroke 0.3s ease' }}
        />
      ))}
    </svg>
  );
}

/** Build a horizontal elbow connector between two match cards */
export function buildElbow(
  x1: number, y1: number,
  x2: number, y2: number,
  active: boolean,
): ElbowPath {
  const mx = (x1 + x2) / 2;
  return { d: `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`, active };
}
