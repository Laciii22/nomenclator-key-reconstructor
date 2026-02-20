import {describe, it, expect, beforeEach} from 'vitest';
import {parseFixedRaw} from '../../src/utils/parse/fixed';
import {resetIds} from '../helpers';

beforeEach(() => resetIds());

describe('parseFixedRaw', () => {
  // -----------------------------------------------------------------
  // Empty / whitespace
  // -----------------------------------------------------------------
    describe('empty input', () => {
        it('returns empty tokens and status "none" for empty string', () => {
        const res = parseFixedRaw('', 2, 0);
        expect(res.tokens).toHaveLength(0);
        expect(res.klamacStatus).toBe('none');
        expect(res.statusMessage).toBeNull();
        });

        it('returns empty tokens for whitespace-only input', () => {
        const res = parseFixedRaw('   ', 2, 0);
        expect(res.tokens).toHaveLength(0);
        expect(res.klamacStatus).toBe('none');
        });
    });

    // -----------------------------------------------------------------
    // Status: ok
    // -----------------------------------------------------------------
    describe('status "ok" — token count === otCount', () => {
        it('parses tokens correctly and reports ok', () => {
        const res = parseFixedRaw('112233', 2, 3);
        // Current parser returns per-character tokens; groupSize is used only for validation
        expect(res.tokens).toHaveLength(6);
        expect(res.tokens.map(t => t.text)).toEqual(['1', '1', '2', '2', '3', '3']);
        expect(res.klamacStatus).toBe('ok');
        expect(res.statusMessage).toBeNull();
        });


        it('works with single token matching single OT char', () => {
        const res = parseFixedRaw('42', 2, 1);
        expect(res.tokens).toHaveLength(2);
        expect(res.tokens[0].text).toBe('4');
        expect(res.tokens[1].text).toBe('2');
        expect(res.klamacStatus).toBe('ok');
        });
    });

    // -----------------------------------------------------------------
    // Status: needsKlamac
    // -----------------------------------------------------------------
    describe('status "needsKlamac" — token count > otCount', () => {
        it('sets needsKlamac and reports counts in message', () => {
        const res = parseFixedRaw('11223344', 2, 3);
        expect(res.klamacStatus).toBe('needsKlamac');
        expect(res.tokens).toHaveLength(8);

        // Avoid brittle exact-string check; verify the key numbers instead
        expect(res.statusMessage).toContain('3');  // OT count
        expect(res.statusMessage).toContain('4');  // ZT groups count (8 tokens / group size 2)
        });

    });

    // -----------------------------------------------------------------
    // Status: invalid
    // -----------------------------------------------------------------
    describe('status "invalid" — leftover characters or OT > groups', () => {
        it('detects invalid when leftover characters exist', () => {
        const res = parseFixedRaw('11223', 2, 2);
        expect(res.klamacStatus).toBe('invalid');
        expect(res.statusMessage).toContain('Incomplete group');
        });
    });

    // -----------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------
    describe('edge cases', () => {
        it('parses correctly with groupSize 1 (single-char tokens)', () => {
        const res = parseFixedRaw('ABCDE', 1, 5);
        expect(res.tokens).toHaveLength(5);
        expect(res.tokens.map(t => t.text)).toEqual(['A','B','C','D','E']);
        expect(res.klamacStatus).toBe('ok');
        });

        it('handles non-numeric characters and preserves tokens', () => {
        const res = parseFixedRaw('1a2b3c', 2, 3);
        expect(res.tokens).toHaveLength(6);
        expect(res.tokens.map(t => t.text)).toEqual(['1','a','2','b','3','c']);
        expect(res.klamacStatus).toBe('ok');
        });

        it('trims surrounding whitespace before parsing', () => {
        const res = parseFixedRaw(' 112233 ', 2, 3);
        expect(res.tokens).toHaveLength(6);
        expect(res.klamacStatus).toBe('ok');
        });

        it('reports invalid when OT count is greater than ZT groups', () => {
        const res = parseFixedRaw('1122', 2, 3); // 4 tokens -> 2 groups, OT=3 > groups
        expect(res.tokens).toHaveLength(4);
        expect(res.klamacStatus).toBe('invalid');
        expect(res.statusMessage).not.toBeNull();
        });
    });

});
