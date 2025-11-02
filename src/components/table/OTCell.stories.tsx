import type { Meta, StoryObj } from '@storybook/react';
import OTCell from './OTCell';
import type { OTChar, ZTToken } from '../types';

const meta: Meta<typeof OTCell> = {
  title: 'Table/OTCell',
  component: OTCell,
  parameters: { layout: 'centered' }
};
export default meta;

type Story = StoryObj<typeof OTCell>;

const ot: OTChar = { id: 'ot_0', ch: 'A' };
const tokens: ZTToken[] = [
  { id: 'zt_0', text: '1' },
  { id: 'zt_1', text: '2' },
  { id: 'zt_2', text: '3' }
];

export const Default: Story = {
  args: {
    ot,
    tokens,
    row: 0,
    col: 0,
    startIndex: 0
  }
};
