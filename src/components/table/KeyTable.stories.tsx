import type { Meta, StoryObj } from '@storybook/react';
import KeyTable from './KeyTable';
import type { OTChar, ZTToken } from '../types';

const meta: Meta<typeof KeyTable> = {
  title: 'Table/KeyTable',
  component: KeyTable,
  parameters: { layout: 'padded' }
};
export default meta;

type Story = StoryObj<typeof KeyTable>;

const sampleOT = (text: string): OTChar[][] => {
  const chars = Array.from(text).map((ch, i) => ({ id: `ot_${i}`, ch }));
  const rows: OTChar[][] = [];
  const COLS = 6;
  for (let i = 0; i < chars.length; i += COLS) rows.push(chars.slice(i, i + COLS));
  return rows.length ? rows : [[]];
};

const tokens = (s: string): ZTToken[] => Array.from(s).map((t, i) => ({ id: `zt_${i}`, text: t }));

export const MultipleKeys: Story = {
  args: {
    otRows: sampleOT('AHOJAHOJ'),
    ztTokens: tokens('12341234'),
    rowGroups: [
      [2, 2, 0, 0, 0, 0],
      [0, 0, 2, 2, 0, 0]
    ],
    keysPerOTMode: 'multiple'
  }
};

export const SingleKeyViolation: Story = {
  args: {
    otRows: sampleOT('ABABAB'),
    ztTokens: tokens('111222'),
    rowGroups: [
      [1, 1, 1, 1, 1, 1]
    ],
    keysPerOTMode: 'single'
  }
};
