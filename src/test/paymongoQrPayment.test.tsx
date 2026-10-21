import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PaymongoQrPayment from '@/components/booking/PaymongoQrPayment';

describe('PaymongoQrPayment', () => {
  it('uses a booking-specific generated PayMongo checkout instead of a static merchant QR', () => {
    render(<PaymongoQrPayment amount={1250} checkoutUrl="https://checkout.paymongo.com/cs_test_booking" />);

    expect(screen.getByText('Amount to send:')).toHaveTextContent('₱1,250');
    expect(screen.getByRole('link', { name: /open secure qrph checkout/i })).toHaveAttribute('href', 'https://checkout.paymongo.com/cs_test_booking');
    expect(screen.queryByAltText(/Kooketz PayMongo QR Ph payment code/i)).not.toBeInTheDocument();
  });

  it('does not show a checkout error while the booking form is still in preview', () => {
    render(<PaymongoQrPayment amount={1250} deferred />);

    expect(screen.getByText(/will be generated after submission/i)).toBeInTheDocument();
    expect(screen.queryByText(/not ready yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate secure qrph/i })).not.toBeInTheDocument();
  });
});
