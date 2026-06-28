/* =============================================================================
 * AdminGuide — section 6. Built-in README. Rendered as styled documentation
 * directly in the content area (no modal / separate route). Content is verbatim
 * per the spec; only typographic styling is applied.
 * ===========================================================================*/
import type { ReactNode } from 'react';

const H1 = ({ children }: { children: ReactNode }) => (
  <h1 className="text-[24px] font-bold leading-tight text-[#0f1e3c]">{children}</h1>
);
const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mt-10 border-b border-[#e5e7eb] pb-2 text-[18px] font-bold text-[#0f1e3c]">{children}</h2>
);
const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="mt-6 text-[15px] font-semibold text-[#0f1e3c]">{children}</h3>
);
const P = ({ children }: { children: ReactNode }) => (
  <p className="mt-3 text-[14px] leading-[1.6] text-black/60">{children}</p>
);
const Rule = () => <hr className="my-8 border-0 border-t border-[#e5e7eb]" />;
const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-[#f5f5f5] px-1.5 py-0.5 font-mono text-[12.5px] text-[#0f1e3c]">{children}</code>
);
const Strong = ({ children }: { children: ReactNode }) => (
  <strong className="font-bold text-[#0f1e3c]">{children}</strong>
);

function OrderedList({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[14px] leading-[1.6] text-black/60 marker:font-bold marker:text-[#0f1e3c]">
      {items.map((it, i) => (
        <li key={i} className="pl-1">
          {it}
        </li>
      ))}
    </ol>
  );
}

export function AdminGuide() {
  return (
    <article className="max-w-[760px]">
      <H1>Admin Console Guide</H1>
      <P>WC2026 Pick&apos;em — Clearway Internal Documentation</P>
      <P>
        This guide explains every admin feature, when to use it, and what each action does to real data. Read it before
        running any batch actions (especially <Strong>Confirm R32 Bracket</Strong> and <Strong>Send to All</Strong>{' '}
        emails).
      </P>

      <Rule />

      <H2>Tournament Lifecycle</H2>
      <P>The Pick&apos;em follows a strict sequence of stages. Admin actions must happen in this order:</P>
      <OrderedList
        items={[
          'Group stage runs → users predict match scorelines',
          'Admin sets real final group positions (Bracket Setup → drag-sort)',
          'Admin confirms R32 bracket → recomputes group-stage points + sends Group Stage Complete email',
          'Admin opens playoffs to users + sets deadline (Overview → Open Playoffs)',
          'Users predict playoff winners and scores in the Full Bracket',
          'Admin publishes results match by match (Enter Results) → points calculated per publish',
          'When both Final and Third Place results are published → Final Standings email fires automatically',
        ]}
      />

      <Rule />

      <H2>Bracket Setup</H2>

      <H3>Drag-Sort Group Standings</H3>
      <P>
        Use this after the real group stage finishes. Drag teams within each group to set their final finishing position
        (1st through 4th). Click &quot;Save Positions&quot; per group.
      </P>
      <P>
        <Strong>What it writes:</Strong> <Code>pickem_group_results.final_position</Code> per team
      </P>
      <P>
        <Strong>What it triggers:</Strong> nothing automatically — <Code>recomputePickemPoints</Code> must be run
        manually or via the Confirm R32 Bracket flow to update the leaderboard
      </P>

      <H3>Load from Groups (R32)</H3>
      <P>
        Auto-fills all 16 R32 matchup slots using the real group standings you set above. Uses the standard FIFA bracket
        pairing rules. Best-third-place teams are assigned uniquely (no duplicate teams).
      </P>
      <P>
        <Strong>When to use:</Strong> only after all 12 groups have final positions set. Running it on incomplete data
        will produce TBD placeholders.
      </P>

      <H3>Confirm R32 Bracket</H3>
      <P>The single most important admin action in the whole app. This button:</P>
      <OrderedList
        items={[
          <>
            Runs <Code>recomputePickemPoints</Code> for all users (group placement + match points)
          </>,
          'Sends the Group Stage Complete email to every user',
        ]}
      />
      <P>
        <Strong>Irreversible in the sense that:</Strong> the email cannot be unsent. Points can be recalculated, but the
        &quot;once only&quot; guard (<Code>tournament_state.r32_confirmed_at</Code>) prevents accidental re-sends. Use
        the force-re-run option only if data was wrong the first time and you understand what you&apos;re re-doing.
      </P>
      <P>
        <Strong>Requirements before clicking:</Strong> all 16 R32 slots must be assigned (the button is disabled
        otherwise).
      </P>

      <Rule />

      <H2>Enter Results</H2>

      <H3>Update Live vs Publish Final</H3>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[14px] leading-[1.6] text-black/60 marker:text-[#0f1e3c]">
        <li className="pl-1">
          <Strong>Update Live:</Strong> saves the score to the database without locking the match or calculating points.
          Use this if you want to enter a score that might change (e.g. during extra time) or if you want to double-check
          before committing.
        </li>
        <li className="pl-1">
          <Strong>Publish Final:</Strong> locks the match (no further user predictions), runs{' '}
          <Code>calculate_playoff_points</Code> for every user who predicted this match, auto-advances the winner into
          the next round&apos;s bracket slot. This is the action that updates the leaderboard and shows correct/miss
          badges on users&apos; bracket cards.
        </li>
      </ul>
      <P>
        <Strong>Never publish a wrong score</Strong> — recalculating after a correction is possible but requires
        rerunning <Code>calculate_playoff_points</Code> manually for that match and checking that downstream rounds
        haven&apos;t been pre-populated with the wrong winner already.
      </P>

      <H3>Draw / Penalty Shootout results</H3>
      <P>
        If a match ends in a draw (both scores equal), the winner is not auto-derived. A manual winner-pick dropdown
        appears. Select the actual winner (whoever won on penalties). Note: users who predicted the exact drawn
        scoreline earn the +2 exact score bonus even if they picked the wrong winner — this is intentional and correct
        behavior.
      </P>

      <H3>Points Preview (before publishing)</H3>
      <P>
        When you enter scores in the input fields, a live preview shows how points would be distributed if you published
        right now. This is read-only and not saved until you click Publish Final.
      </P>

      <Rule />

      <H2>Email Tools</H2>

      <H3>The 5 email types</H3>
      <div className="mt-3 overflow-hidden rounded-lg border border-[#e5e7eb]">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-[#f5f5f5] text-[11px] font-extrabold uppercase tracking-[0.06em] text-black/45">
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Trigger</th>
              <th className="px-3 py-2.5">Once only?</th>
            </tr>
          </thead>
          <tbody className="text-black/60">
            {[
              ['Bracket Confirmation', 'User first saves playoff picks', 'No (per user)'],
              ['Prediction Update', 'User edits saved picks (~90s debounce)', 'No'],
              ['Group Stage Complete', 'Admin clicks Confirm R32 Bracket', 'Yes (guarded)'],
              ['Final Standings', 'Both Final + Third Place published', 'Yes (guarded)'],
              ['Playoffs Opened', 'Admin opens playoffs (not yet built — needs design)', 'Yes (planned)'],
            ].map(([email, trigger, once], i) => (
              <tr key={email} className={`border-t border-[#e5e7eb] ${i % 2 === 1 ? 'bg-black/[0.015]' : ''}`}>
                <td className="px-3 py-2.5 font-semibold text-[#0f1e3c]">{email}</td>
                <td className="px-3 py-2.5">{trigger}</td>
                <td className="px-3 py-2.5">{once}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H3>Send Test</H3>
      <P>
        Renders the email template with mock/sample data and sends it to one address you specify. Does not use real user
        data. Logged to <Code>email_logs</Code> with <Code>is_test = true</Code> so it doesn&apos;t pollute real send
        tracking.
      </P>

      <H3>Send to All</H3>
      <P>
        Sends the real email to every user (minus opt-outs). For once-only emails (Group Stage Complete, Final
        Standings), a warning appears if the guard is already set. You can force-send but this will override the guard —
        only do this if the original send failed or data was wrong.
      </P>

      <H3>Troubleshooting emails</H3>
      <P>
        If users report not receiving emails: check Email Logs for rows with <Code>status = &apos;failed&apos;</Code>{' '}
        and read the <Code>error_message</Code> field. Common causes: Resend API key expired, user&apos;s email address
        bounced, or <Code>email_opt_out</Code> was set. If the <Code>RESEND_API_KEY</Code> env var is missing entirely,
        all sends will fail silently — check the server logs for startup errors.
      </P>

      <Rule />

      <H2>Common Admin Workflows</H2>

      <H3>&quot;Group stage just ended, what do I do?&quot;</H3>
      <OrderedList
        items={[
          'Bracket Setup → drag-sort all 12 groups to set final positions → Save each',
          'Bracket Setup → Load from Groups → review the 16 R32 matchups → assign any remaining slots manually if needed',
          'Bracket Setup → Confirm R32 Bracket (double-confirm dialog) → emails fire, points calculated',
          'Overview → Open Playoffs to Users → set prediction deadline → Open',
        ]}
      />

      <H3>&quot;A playoff match just finished, what do I do?&quot;</H3>
      <OrderedList
        items={[
          'Enter Results → find the match → enter home score + away score → select winner if draw',
          'Click Publish Final → points calculate automatically, bracket advances, user cards update',
          'No email to send manually — the Final Standings email fires automatically when BOTH the Final and Third Place matches are published',
        ]}
      />

      <H3>&quot;A user says they didn&apos;t receive an email&quot;</H3>
      <OrderedList
        items={[
          'Email Logs → search by their email address → check the status column',
          "If 'failed': read error_message → fix the underlying cause → use Email Tools → Send Test to their address to confirm delivery works now → they will NOT receive the real email again automatically, you would need to Send to All again (with the guard warning)",
          'If no row exists at all: the trigger may not have fired — check whether their email_opt_out is set in the database',
        ]}
      />

      <H3>&quot;I published a wrong result and need to correct it&quot;</H3>
      <OrderedList
        items={[
          'Enter Results → find the match → change the scores → click Update Live first to save without re-triggering scoring',
          <>
            Manually run <Code>calculate_playoff_points</Code> for that <Code>match_id</Code> via the Supabase SQL editor
            (no UI for this yet)
          </>,
          'If the wrong winner was propagated to the next round, manually correct the next-round match\u2019s home/away team IDs in Supabase and re-check the bracket',
          <>
            Leaderboard will update automatically on next user page load once <Code>points_awarded</Code> is corrected
          </>,
        ]}
      />
    </article>
  );
}
