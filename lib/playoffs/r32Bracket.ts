import type { R32Pairing } from './types';

export const R32_PAIRINGS: R32Pairing[] = [
  { matchCode: 'R32_M01', home: '1E',  away: '3ABCDF'  },
  { matchCode: 'R32_M02', home: '1I',  away: '3CDFGH'  },
  { matchCode: 'R32_M03', home: '2A',  away: '2B'      },
  { matchCode: 'R32_M04', home: '1F',  away: '2C'      },
  { matchCode: 'R32_M05', home: '2K',  away: '2L'      },
  { matchCode: 'R32_M06', home: '1H',  away: '2J'      },
  { matchCode: 'R32_M07', home: '1D',  away: '3BEFIJ'  },
  { matchCode: 'R32_M08', home: '1G',  away: '3AEHIJ'  },
  { matchCode: 'R32_M09', home: '1C',  away: '2F'      },
  { matchCode: 'R32_M10', home: '2E',  away: '2I'      },
  { matchCode: 'R32_M11', home: '1A',  away: '3CEFHI'  },
  { matchCode: 'R32_M12', home: '1L',  away: '3EHIJK'  },
  { matchCode: 'R32_M13', home: '1J',  away: '2H'      },
  { matchCode: 'R32_M14', home: '2D',  away: '2G'      },
  { matchCode: 'R32_M15', home: '1B',  away: '3EFGIJ'  },
  { matchCode: 'R32_M16', home: '1K',  away: '3DEJIL'  },
];

/** Human-readable label for a qualifier code */
export function qualifierLabel(q: string): string {
  if (q.startsWith('3')) return `Best 3rd (Groups ${q.slice(1)})`;
  const pos = q[0] === '1' ? '1st' : '2nd';
  const group = q.slice(1);
  return `${pos} · Group ${group}`;
}
