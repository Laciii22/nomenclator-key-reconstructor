import type { Meta, StoryObj } from '@storybook/react';
import ZTToken from './ZTToken';

const meta: Meta<typeof ZTToken> = {
  title: 'Table/ZTToken',
  component: ZTToken,
  parameters: { layout: 'centered' }
};
export default meta;

type Story = StoryObj<typeof ZTToken>;

export const Default: Story = {
  args: {
    token: { id: 'zt_0', text: '1' },
    tokenIndex: 0,
    row: 0,
    col: 0
  }
};
