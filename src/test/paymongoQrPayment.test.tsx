import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PaymongoQrPayment from '@/components/booking/PaymongoQrPayment';

describe('PaymongoQrPayment', () => {
  it('shows the QR Ph asset and opens a zoomable viewer', () => {
    render(<PaymongoQrPayment amount={1250} />);

    expect(screen.getByText('Amount to send:')).toHaveTextContent('₱1,250');
    expect(screen.getByAltText('Kooketz PayMongo QR Ph payment code')).toHaveAttribute('src', '/payments/qrph-kooketz.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Open QR Ph code for zooming' }));
    expect(screen.getByRole('dialog', { name: 'QR Ph payment code' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(screen.getByAltText('Enlarged Kooketz PayMongo QR Ph payment code')).toHaveStyle({ transform: 'scale(1.25)' });
  });
});
