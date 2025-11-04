import { useMemo } from 'react';

// Types for fragments and candidates
export type FragmentLen = 1 | 2 | 3;

// A mapping from each OT character to a fixed ZT segment (concatenated string of 1..3 tokens)
export type KeyMapping = Record<string, string>;

// One candidate solution for the given OT/ZT
export interface NomenclatorCandidate {
  // Char -> ZT segment (e.g., h -> "22", o -> "234")
  mapping: KeyMapping;
  // Segmentation of ZT aligned to OT positions; segments[i] corresponds to OT[i]
  segments: string[];
  // Fraction of ZT covered (1.0 == full cover)
  coverage: number;
  // Aggregate score used for ranking
  score: number;
}

export interface ReconstructionOptions {
  maxK?: FragmentLen;        // max segment length per char (default 3)
  topN?: number;             // number of top candidates to return (default 10)
  modulo?: number;           // modulo base for char->number mapping (default 10)
  knownBigrams?: string[];   // optional list of common OT bigrams for bonus
  knownTrigrams?: string[];  // optional list of common OT trigrams for bonus
  knownAbbreviations?: string[]; // optional list of known abbreviations (OT) for bonus
}

/**
 * Tokenize ZT: if there are spaces, split on whitespace; otherwise split by character.
 */
function tokenizeZT(zt: string): string[] {
  const s = zt.trim();
  if (!s) return [];
  if (/\s/.test(s)) return s.split(/\s+/).filter(Boolean);
  return Array.from(s);
}

/** Convert an OT string into an array of characters (ignoring whitespace). */
function tokenizeOT(ot: string): string[] {
  return Array.from(ot).filter(ch => !/\s/.test(ch));
}

/** Map a letter to 1..26 (case-insensitive); non-letters return 0. */
function letterIndex(ch: string): number {
  const c = ch.toLowerCase();
  if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 96; // a->1
  return 0;
}

/** Convert a segment string (concatenated tokens) to a numeric value for scoring. */
function segmentNumeric(seg: string): number {
  // If purely digits, parse directly; else reduce chars to digits
  if (/^\d+$/.test(seg)) {
    // limit size to avoid overflow
    const n = Number(seg.slice(0, 12));
    return Number.isFinite(n) ? n : 0;
  }
  // Fallback: sum of char codes
  let sum = 0;
  for (let i = 0; i < seg.length; i++) sum = (sum + seg.charCodeAt(i)) >>> 0;
  return sum;
}

/** Score a single (char, segment) mapping using a modulo heuristic. */
function scoreCharSegment(char: string, seg: string, modulo: number): number {
  const ci = letterIndex(char);
  if (ci === 0 || seg.length === 0) return 0;
  const sn = segmentNumeric(seg);
  const a = ci % modulo;
  const b = sn % modulo;
  let s = 0;
  // Exact modulo match gets a bigger boost
  if (a === b) s += 1.0;
  // Near match bonus (wrap-around distance on modulo ring)
  const d = Math.min((a - b + modulo) % modulo, (b - a + modulo) % modulo);
  s += Math.max(0, 0.5 - d * 0.1); // up to +0.5 for being close
  // Prefer longer segments slightly (within 1..3)
  s += (seg.length - 1) * 0.1; // +0.0, +0.1, +0.2
  return s;
}

/** Bonus for bigrams/trigrams and known abbreviations present in OT around index i. */
function ngramBonuses(
  otChars: string[],
  segments: string[],
  i: number,
  opts: Required<Pick<ReconstructionOptions, 'knownBigrams' | 'knownTrigrams' | 'knownAbbreviations'>>
): number {
  let bonus = 0;
  // bigram (i,i+1)
  if (i + 1 < otChars.length) {
    const big = (otChars[i] + otChars[i + 1]).toLowerCase();
    if (opts.knownBigrams.includes(big)) {
      // small bonus plus if segments look coherent (e.g., both same length)
      const s1 = segments[i] || '';
      const s2 = segments[i + 1] || '';
      if (s1 && s2) bonus += 0.2 + (s1.length === s2.length ? 0.1 : 0);
    }
  }
  // trigram (i,i+1,i+2)
  if (i + 2 < otChars.length) {
    const tri = (otChars[i] + otChars[i + 1] + otChars[i + 2]).toLowerCase();
    if (opts.knownTrigrams.includes(tri)) {
      const s1 = segments[i] || '';
      const s2 = segments[i + 1] || '';
      const s3 = segments[i + 2] || '';
      if (s1 && s2 && s3) bonus += 0.3 + (s1.length === s2.length && s2.length === s3.length ? 0.1 : 0);
    }
  }
  // abbreviation (single-char or multi-char OT sequences we want to favor)
  for (const abbr of opts.knownAbbreviations) {
    if (abbr.length === 0) continue;
    const L = abbr.length;
    const window = otChars.slice(i, i + L).join('').toLowerCase();
    if (window === abbr.toLowerCase()) {
      bonus += 0.2; // small bonus if abbreviation appears at this window
    }
  }
  return bonus;
}

/**
 * Core solver: Explore assignments OT[i] -> ZT segment of length 1..maxK with backtracking.
 * Enforces:
 * - Consistency: same OT char must map to same segment everywhere.
 * - Uniqueness: segmentation uses each ZT position exactly once (by construction).
 * Prunes aggressively and accumulates the best candidates.
 */
export function reconstructNomenclator(
  ot: string,
  zt: string,
  options: ReconstructionOptions = {}
): NomenclatorCandidate[] {
  const maxK: FragmentLen = (options.maxK ?? 3) as FragmentLen;
  const topN = options.topN ?? 10;
  const modulo = options.modulo ?? 10;
  const knownBigrams = options.knownBigrams ?? ['th','he','in','er','an','re','on','en','at','ho','na','po'];
  const knownTrigrams = options.knownTrigrams ?? ['the','and','tha','ere','ion','tio','ent','ing'];
  const knownAbbreviations = options.knownAbbreviations ?? [];

  const otChars = tokenizeOT(ot);
  const ztTokens = tokenizeZT(zt);
  const T = ztTokens.length;
  const N = otChars.length;
  const results: NomenclatorCandidate[] = [];

  if (N === 0 || T === 0) return results;

  // Precompute a small beam of promising lengths per OT char (heuristic): prefer 2>3>1 for repeat chars
  const lengthOrder: FragmentLen[] = [2, 3, 1].filter(k => k <= maxK) as FragmentLen[];

  // Backtracking state
  const mapping: KeyMapping = {};      // char -> segment
  const segments: string[] = new Array(N).fill(''); // per position segment string

  // Cache for partial scoring to prune impossible/weak paths
  function partialScore(upto: number): number {
    let s = 0;
    for (let i = 0; i < upto; i++) {
      const seg = segments[i];
      if (!seg) continue;
      s += scoreCharSegment(otChars[i], seg, modulo);
      s += ngramBonuses(otChars, segments, i, { knownBigrams, knownTrigrams, knownAbbreviations });
    }
    return s;
  }

  // Keep only topK candidates during search to contain explosion
  const MAX_COLLECT = Math.max(topN * 5, 30);

  function pushCandidate(score: number) {
    // Build mapping snapshot
    const map: KeyMapping = {};
    for (const ch of Object.keys(mapping)) map[ch] = mapping[ch];
    results.push({ mapping: map, segments: [...segments], coverage: 1.0, score });
    // Trim
    if (results.length > MAX_COLLECT) {
      results.sort((a, b) => b.score - a.score || b.coverage - a.coverage);
      results.length = MAX_COLLECT;
    }
  }

  function backtrack(i: number, zPos: number) {
    // if we've assigned all OT positions, success only if we consumed all ZT tokens
    if (i === N) {
      if (zPos === T) {
        // Full coverage; compute final score
        let s = 0;
        for (let k = 0; k < N; k++) {
          s += scoreCharSegment(otChars[k], segments[k], modulo);
          s += ngramBonuses(otChars, segments, k, { knownBigrams, knownTrigrams, knownAbbreviations });
        }
        // Consistency bonus: fewer unique chars relative to positions implies consistent reuse
        const uniqChars = new Set(otChars).size;
        s += Math.min(1, (N - uniqChars) * 0.05);
        pushCandidate(s);
      } else {
        // Not full coverage: optionally record partials with coverage penalty
        const cov = Math.max(0, Math.min(1, zPos / Math.max(1, T)));
        let s = partialScore(N);
        s *= cov;
        const map: KeyMapping = {};
        for (const ch of Object.keys(mapping)) map[ch] = mapping[ch];
        results.push({ mapping: map, segments: [...segments], coverage: cov, score: s });
      }
      return;
    }
    // If ZT exhausted early, only allow if the rest can be empty (we don't support empty segments); backtrack
    if (zPos >= T) {
      // record partial
      const cov = Math.max(0, Math.min(1, zPos / Math.max(1, T)));
      let s = partialScore(i);
      s *= cov;
      const map: KeyMapping = {};
      for (const ch of Object.keys(mapping)) map[ch] = mapping[ch];
      results.push({ mapping: map, segments: [...segments], coverage: cov, score: s });
      return;
    }

    const ch = otChars[i];
    const existing = mapping[ch];

    if (existing) {
      // length is fixed by existing mapping
      const L = existing.length;
      if (zPos + L > T) return; // no room
      const seg = ztTokens.slice(zPos, zPos + L).join('');
      if (seg !== existing) return; // inconsistent with earlier occurrence
      segments[i] = seg;
      // small pruning: partial score threshold
      backtrack(i + 1, zPos + L);
      segments[i] = '';
      return;
    }

    // Try segment lengths in heuristic order
    for (const L of lengthOrder) {
      if (zPos + L > T) continue;
      const seg = ztTokens.slice(zPos, zPos + L).join('');
      // Assign and recurse
      mapping[ch] = seg;
      segments[i] = seg;
      // Prune based on optimistic remaining capacity: ensure remaining positions can fit into remaining tokens
      const remPos = N - (i + 1);
      const remTok = T - (zPos + L);
      if (remTok >= Math.ceil(remPos / maxK) && remTok <= remPos * maxK) {
        // heuristic pruning: if partial score is extremely low relative to i, skip this branch
        const sPart = partialScore(i + 1);
        if (sPart >= -1e3) {
          backtrack(i + 1, zPos + L);
        }
      }
      // undo
      delete mapping[ch];
      segments[i] = '';
    }
  }

  backtrack(0, 0);

  // Final ranking: prefer full coverage, then score
  results.sort((a, b) => b.coverage - a.coverage || b.score - a.score);
  // Deduplicate by mapping signature + segments (to avoid duplicates from partial paths)
  const seen = new Set<string>();
  const out: NomenclatorCandidate[] = [];
  for (const cand of results) {
    const key = JSON.stringify({ m: cand.mapping, s: cand.segments });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cand);
    if (out.length >= (topN || 10)) break;
  }
  return out;
}

/** React hook wrapper around reconstructNomenclator for convenient use in components. */
export function useKeyReconstruction(ot: string, zt: string, options?: ReconstructionOptions) {
  return useMemo(() => reconstructNomenclator(ot, zt, options), [ot, zt, options?.maxK, options?.topN, options?.modulo, JSON.stringify(options?.knownBigrams || []), JSON.stringify(options?.knownTrigrams || []), JSON.stringify(options?.knownAbbreviations || [])]);
}

// Example usage:
// const candidates = useKeyReconstruction('ahaho', '12212223', { topN: 5 });
// candidates[0] might contain mapping like { a:'1', h:'22', o:'23' } with full coverage.
