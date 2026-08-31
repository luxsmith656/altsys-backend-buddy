-- Remove only exact retired demo identities. The admin and Ranger roles remain
-- available for real operational accounts created by an administrator.
DELETE FROM auth.users
WHERE lower(email) IN (
  'admin@kalisungan.ph',
  'admin@mtkalisungan.ph',
  'ranger@kalisungan.ph',
  'ranger@mtkalisungan.ph'
);
