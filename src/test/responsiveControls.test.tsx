import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';

describe('responsive shared controls', () => {
  it('lets long mobile button labels wrap without clipping their height', () => {
    render(<Button>Accept and assign two available mountain guides</Button>);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('min-w-0', 'max-w-full', 'whitespace-normal', 'break-words', 'min-h-10');
    expect(button).toHaveClass('sm:whitespace-nowrap');
    expect(button).not.toHaveClass('h-10');
  });
});
