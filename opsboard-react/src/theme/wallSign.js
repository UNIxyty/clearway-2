// The wall's daily NOTAM sign, as the display draws it (DisplayApp NotamSign). One source, so the console's "today's wall
// sign" banner shows the sign the wall is really showing. These are the wall's own colours (not portal tokens): the sign
// looks the same whatever theme the console is in.
export const WALL_SIGN = {
  CHECK: { bg: '#c62828', border: '#ff8a80', text: '#fff', glow: 'rgba(198,40,40,.55)', label: '!!! CHECK NOTAM !!!', pulse: true },
  CHECKED: { bg: '#1f7a3f', border: '#66bb6a', text: '#fff', glow: 'rgba(31,122,63,.4)', label: 'NOTAM CHECKED', pulse: false },
};
