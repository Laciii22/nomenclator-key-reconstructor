import type { Candidate } from '../../utils/analyzer';

// Simple selection helper: pick tokens for OT chars where exactly one candidate has score==1
export function chooseScoreOneSimple(candidatesByChar: Record<string, Candidate[]>) {
  const picks: Record<string, string> = {};
  const ambiguous: string[] = [];
  for (const [ch, list] of Object.entries(candidatesByChar)) {
    const score1 = list.filter(c => c.score === 1);
    if (score1.length > 1) ambiguous.push(ch);
    else if (score1.length === 1) picks[ch] = score1[0].token;
  }
  return { picks, ambiguous };
}

export default chooseScoreOneSimple;
