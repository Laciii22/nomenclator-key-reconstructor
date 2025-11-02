import type { Meta, StoryObj } from '@storybook/react';
import MappingTable from './MappingTable';
import type { OTChar, ZTToken } from '../types';

const meta: Meta<typeof MappingTable> = {
  title: 'Table/MappingTable',
  component: MappingTable,
  parameters: {
    layout: 'padded'
  }
};
export default meta;

type Story = StoryObj<typeof MappingTable>;

const sampleOT = (text: string): OTChar[][] => {
  const chars = Array.from(text).map((ch, i) => ({ id: `ot_${i}`, ch }));
  const rows: OTChar[][] = [];
  const COLS = 6;
  for (let i = 0; i < chars.length; i += COLS) rows.push(chars.slice(i, i + COLS));
  return rows.length ? rows : [[]];
};

const tokens = (s: string): ZTToken[] => Array.from(s).map((t, i) => ({ id: `zt_${i}`, text: t }));

export const Proportional: Story = {
  args: {
    otRows: sampleOT('AHOJAHOJ'),
    ztTokens: tokens('12345678')
  }
};

export const WithRowGroups: Story = {
  args: {
    otRows: sampleOT('AHOJAH'),
    ztTokens: tokens('12345678'),
    rowGroups: [
      [2, 1, 1],
      [1, 1, 2]
    ]
  }
};
