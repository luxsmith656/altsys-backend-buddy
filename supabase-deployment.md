# Supabase deployment

Vercel deploys the React application, but it does not deploy Supabase migrations or Edge Functions. Configure these GitHub repository secrets so changes under `supabase/` are published automatically:

- `SUPABASE_ACCESS_TOKEN`: Supabase personal access token
- `SUPABASE_PROJECT_REF`: `evcqnlbumsfgbfddoonv` (optional; the workflow has this default)

For the current account repair, run the migrations in order from the Supabase SQL Editor or from a linked CLI checkout:

```bash
supabase login
supabase link --project-ref evcqnlbumsfgbfddoonv
supabase db push
supabase functions deploy admin-seed-accounts
```

Then use **Reset test accounts** on the login page. The corrected function creates and password-resets the MDRRMO and Sto. Tomas test users, removes the retired demo identities, and returns HTTP 500 when any seed operation fails.
