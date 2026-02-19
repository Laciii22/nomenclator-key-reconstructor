import { describe, it, expect } from 'vitest';
import type { OTChar, ZTToken } from '../../src/types/domain';
import { separatorModeScore } from '../../src/utils/analyzer';

/**
 * Unit tests for frequency analysis in separator mode + single key per OT
 * 
 * Test scenario:
 * - OT (plaintext): "HELLO" 
 * - ZT (ciphertext): "11:22:33:33:44" (separator ":")
 * - Expected mapping: H→11, E→22, L→33, O→44
 * - Note: L appears 2x, token '33' appears 2x (simple substitution, not homophone)
 * 
 * Homophone noexample (not tested here, requires multiple key mode):
 * - OT: "HELLO" where L appears 2x
 * - ZT: "11:22:33:44:55" where first L→33, second L→44
 * - Result: L → {33, 44} (multiple keys for one character)
 */
describe('Frequency Analysis - Separator Mode - Single Key', () => {
  
  /**
   * Test 1: Basic frequency analysis for unambiguous mappings
   * When OT char frequency = ZT token frequency, score should be 1.0
   */
  it('should give score 1.0 for perfect frequency match (H→11)', () => {
    // Setup: HELLO has 1x H
    const otRows: OTChar[][] = [
      [
        { id: 'ot_0', ch: 'H' },
        { id: 'ot_1', ch: 'E' },
        { id: 'ot_2', ch: 'L' },
        { id: 'ot_3', ch: 'L' },
        { id: 'ot_4', ch: 'O' },
      ]
    ];

    // ZT: 11:22:33:33:44 (token '11' appears 1x)
    const effectiveZtTokens: ZTToken[] = [
      { id: 'zt_0', text: '11' },
      { id: 'zt_1', text: '22' },
      { id: 'zt_2', text: '33' },
      { id: 'zt_3', text: '33' },
      { id: 'zt_4', text: '44' },
    ];

    const result = separatorModeScore({
      token: '11',
      otChar: 'H',
      otRows,
      effectiveZtTokens,
    });

    expect(result.support).toBe(1); // token '11' appears 1x
    expect(result.occurrences).toBe(1); // 'H' appears 1x
    expect(result.score).toBe(1.0); // perfect match: 1/1 = 1.0
  });

  /**
   * Test 2: Simple substitution with matching frequencies (L→33)
   * 'L' appears 2x, '33' appears 2x → score = 1.0
   * Note: This is NOT a homophone, just a simple 1:1 substitution that happens twice
   */
  it('should detect simple substitution with matching frequency (L→33)', () => {
    const otRows: OTChar[][] = [
      [
        { id: 'ot_0', ch: 'H' },
        { id: 'ot_1', ch: 'E' },
        { id: 'ot_2', ch: 'L' },
        { id: 'ot_3', ch: 'L' },
        { id: 'ot_4', ch: 'O' },
      ]
    ];

    const effectiveZtTokens: ZTToken[] = [
      { id: 'zt_0', text: '11' },
      { id: 'zt_1', text: '22' },
      { id: 'zt_2', text: '33' },
      { id: 'zt_3', text: '33' },
      { id: 'zt_4', text: '44' },
    ];

    const result = separatorModeScore({
      token: '33',
      otChar: 'L',
      otRows,
      effectiveZtTokens,
    });

    expect(result.support).toBe(2); // '33' appears 2x
    expect(result.occurrences).toBe(2); // 'L' appears 2x
    expect(result.score).toBe(1.0); // perfect match: 2/2 = 1.0
  });

  /**
   * Test 3: Incorrect mapping results in low score
   * If we assign '33' to 'H', score should be low (0.5)
   * because 'H' appears 1x but '33' appears 2x
   */
  it('should give low score for incorrect mapping (H→33)', () => {
    const otRows: OTChar[][] = [
      [
        { id: 'ot_0', ch: 'H' },
        { id: 'ot_1', ch: 'E' },
        { id: 'ot_2', ch: 'L' },
        { id: 'ot_3', ch: 'L' },
        { id: 'ot_4', ch: 'O' },
      ]
    ];

    const effectiveZtTokens: ZTToken[] = [
      { id: 'zt_0', text: '11' },
      { id: 'zt_1', text: '22' },
      { id: 'zt_2', text: '33' },
      { id: 'zt_3', text: '33' },
      { id: 'zt_4', text: '44' },
    ];

    const result = separatorModeScore({
      token: '33',
      otChar: 'H',
      otRows,
      effectiveZtTokens,
    });

    expect(result.support).toBe(2); // '33' appears 2x
    expect(result.occurrences).toBe(1); // 'H' appears 1x
    expect(result.score).toBe(0.5); // mismatch: min(2,1) / max(2,1) = 1/2 = 0.5
  });

  /**
   * Test 4: More complex case with multiple characters
   * OT: "AAA" → we expect token with frequency 3 to get highest score
   */
  it('should rank candidates by frequency similarity (AAA case)', () => {
    const otRows: OTChar[][] = [
      [
        { id: 'ot_0', ch: 'A' },
        { id: 'ot_1', ch: 'A' },
        { id: 'ot_2', ch: 'A' },
      ]
    ];

    // ZT has tokens with different frequencies: 11(3x), 22(2x), 33(1x)
    const effectiveZtTokens: ZTToken[] = [
      { id: 'zt_0', text: '11' },
      { id: 'zt_1', text: '11' },
      { id: 'zt_2', text: '11' },
      { id: 'zt_3', text: '22' },
      { id: 'zt_4', text: '22' },
      { id: 'zt_5', text: '33' },
    ];

    // '11' has frequency 3, same as 'A' → score = 1.0
    const score11 = separatorModeScore({
      token: '11',
      otChar: 'A',
      otRows,
      effectiveZtTokens,
    });

    // '22' has frequency 2, 'A' has 3 → score = 2/3 ≈ 0.667
    const score22 = separatorModeScore({
      token: '22',
      otChar: 'A',
      otRows,
      effectiveZtTokens,
    });

    // '33' has frequency 1, 'A' has 3 → score = 1/3 ≈ 0.333
    const score33 = separatorModeScore({
      token: '33',
      otChar: 'A',
      otRows,
      effectiveZtTokens,
    });

    expect(score11.score).toBe(1.0);
    expect(score22.score).toBeCloseTo(0.667, 2);
    expect(score33.score).toBeCloseTo(0.333, 2);

    // Ranking: 11 > 22 > 33
    expect(score11.score).toBeGreaterThan(score22.score);
    expect(score22.score).toBeGreaterThan(score33.score);
  });

  /**
   * Test 5: Edge case - empty OT or ZT
   */
  it('should handle empty inputs gracefully', () => {
    const otRows: OTChar[][] = [[]];
    const effectiveZtTokens: ZTToken[] = [];

    const result = separatorModeScore({
      token: '11',
      otChar: 'A',
      otRows,
      effectiveZtTokens,
    });

    expect(result.support).toBe(0);
    expect(result.occurrences).toBe(0);
    expect(result.score).toBe(0);
  });

  /**
   * Test 6: Token doesn't exist in ZT
   */
  it('should return score 0 for non-existent token', () => {
    const otRows: OTChar[][] = [
      [{ id: 'ot_0', ch: 'A' }]
    ];

    const effectiveZtTokens: ZTToken[] = [
      { id: 'zt_0', text: '11' },
      { id: 'zt_1', text: '22' },
    ];

    const result = separatorModeScore({
      token: '99', // token that doesn't exist
      otChar: 'A',
      otRows,
      effectiveZtTokens,
    });

    expect(result.support).toBe(0);
    expect(result.score).toBe(0);
  });
});
