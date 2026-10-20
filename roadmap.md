# Password-reset email function
- [x] Implement public EmailJS recovery endpoint and security tests (14 tests passed).
- [x] Deploy and verify the production endpoint is not 404 (public OPTIONS and recovery POST returned 200).

# Automatic QRPh payments and reservation email
- [ ] Harden and deploy PayMongo checkout/webhook; verify signature and concurrency safeguards.
- [ ] Verify/apply payment idempotency migration and confirmation queue safeguards.
- [ ] Complete reservation-only EmailJS content, real reservation QR, and duplicate protection.
- [ ] Remove manual proof requirements from the online QRPh flow.
- [ ] Run focused tests and check live endpoints.
- [ ] Verify a real PayMongo test payment and one reservation email with visible QR (requires provider test checkout and reservation email configuration).