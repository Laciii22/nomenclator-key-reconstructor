import type { Candidate } from '../../utils/analyzer';

// Simple selection helper: pick tokens for OT chars where exactly one candidate
// fully covers the OT character occurrences. Do not rely on numeric equality
// of `score === 1` because scores may be extended/inserted elsewhere; instead
// use concrete evidence: token `support` equals `occurrences`.
export function chooseScoreOneSimple(candidatesByChar: Record<string, Candidate[]>) {
  const picks: Record<string, string> = {};
  const ambiguous: string[] = [];
  for (const [ch, list] of Object.entries(candidatesByChar)) {
    const perfect = list.filter(c => (c.occurrences || 0) > 0 && c.support === c.occurrences);
    if (perfect.length > 1) ambiguous.push(ch);
    else if (perfect.length === 1) picks[ch] = perfect[0].token;
  }
  return { picks, ambiguous };
}

export default chooseScoreOneSimple;
