import type { PTChar } from '../../components/types';

function isBlockedByLocks(
  groups: PTChar[],
  start: number,
  endExclusive: number,
  lockedKeys: Record<string, string>
): boolean {
  for (let i = start; i < endExclusive; i++) {
    if (typeof lockedKeys?.[groups[i].ch] === 'string') return true;
  }
  return false;
}

export function countMergeableOccurrences(
  groups: PTChar[],
  pattern: string,
  lockedKeys: Record<string, string>
): number {
  const target = pattern.trim();
  if (!target) return 0;

  let count = 0;
  for (let i = 0; i < groups.length;) {
    const cur = groups[i];
    if (cur.ch === target) {
      i++;
      continue;
    }

    let acc = '';
    let j = i;
    while (j < groups.length && acc.length < target.length) {
      acc += groups[j].ch;
      j++;
    }

    if (acc === target && j - i >= 2 && !isBlockedByLocks(groups, i, j, lockedKeys)) {
      count++;
      i = j;
      continue;
    }

    i++;
  }

  return count;
}

export function mergeAllOccurrences(
  flatGroups: PTChar[],
  pattern: string,
  lockedKeys: Record<string, string>
): { nextGroups: PTChar[]; remaining: number; target: string } | null {
  const target = pattern.trim();
  if (!target) return null;

  const out: PTChar[] = [];
  for (let i = 0; i < flatGroups.length;) {
    const cur = flatGroups[i];
    if (cur.ch === target) {
      out.push(cur);
      i++;
      continue;
    }

    let acc = '';
    let j = i;
    while (j < flatGroups.length && acc.length < target.length) {
      acc += flatGroups[j].ch;
      j++;
    }

    if (acc === target && j - i >= 2 && !isBlockedByLocks(flatGroups, i, j, lockedKeys)) {
      const merged: PTChar = {
        id: flatGroups
          .slice(i, j)
          .map(x => x.id)
          .join('_merge_'),
        ch: target,
      };
      out.push(merged);
      i = j;
      continue;
    }

    out.push(cur);
    i++;
  }

  const remaining = countMergeableOccurrences(out, target, lockedKeys);
  return { nextGroups: out, remaining, target };
}

export function tryJoinAdjacentPtGroups(
  flatGroups: PTChar[],
  fromIndex: number,
  toIndex: number,
  lockedKeys: Record<string, string>
): { nextGroups: PTChar[]; mergedText: string } | null {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= flatGroups.length || toIndex >= flatGroups.length) return null;
  if (toIndex !== fromIndex + 1) return null;

  const a = flatGroups[fromIndex];
  const b = flatGroups[toIndex];

  if (typeof lockedKeys?.[a.ch] === 'string') return null;
  if (typeof lockedKeys?.[b.ch] === 'string') return null;

  const mergedText = `${a.ch}${b.ch}`;
  const merged: PTChar = { id: `${a.id}_merge_${b.id}`, ch: mergedText };

  const next = [...flatGroups];
  next.splice(fromIndex, 2, merged);
  return { nextGroups: next, mergedText };
}

export function splitPtGroupAt(
  flatGroups: PTChar[],
  index: number
): PTChar[] | null {
  if (index < 0 || index >= flatGroups.length) return null;
  const cur = flatGroups[index];
  if (!cur?.ch || cur.ch.length <= 1) return null;

  const singles: PTChar[] = Array.from(cur.ch).map((ch, i) => ({ id: `${cur.id}_s${i}`, ch }));
  const next = [...flatGroups];
  next.splice(index, 1, ...singles);
  return next;
}
