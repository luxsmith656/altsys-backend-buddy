-- Add the enum value in its own migration transaction.
-- PostgreSQL does not allow a newly added enum value to be referenced until
-- the transaction that adds it has committed.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'mdrrmo';
