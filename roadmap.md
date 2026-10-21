# Password-reset email function
- [x] Implement public EmailJS recovery endpoint and security tests (14 tests passed).
- [x] Deploy and verify the production endpoint is not 404 (public OPTIONS and recovery POST returned 200).

# Automatic QRPh payments and reservation email
- [x] Harden and deploy PayMongo checkout/webhook; verify signature and concurrency safeguards (8 webhook tests; live endpoint rejects bad signatures with 401).
- [x] Verify/apply payment idempotency migration and confirmation queue safeguards.
- [x] Complete reservation-only EmailJS content, real reservation QR, and duplicate protection (44 booking-email tests).
- [x] Remove manual proof requirements from the online QRPh flow (booking page uses the paymongo-checkout function).
- [x] Run focused tests and check live endpoints (52 tests pass; preview build OK; both functions deployed and responding).
- [ ] Verify a real PayMongo test payment and one reservation email with visible QR — blocked on user: register the webhook URL in the PayMongo dashboard (test mode, checkout_session.payment.paid) and run PayMongo's test simulation; never scan a test QR with a real wallet app.
