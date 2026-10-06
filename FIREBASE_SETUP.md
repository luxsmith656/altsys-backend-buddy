# Firebase Setup Guide

Firebase project for the Mt. Kalisungan app: `mt-kalisungan-system` (display name: `Mt Kalisungan`).
The web app uses Firebase Google sign-in, the Supabase Firebase-auth bridge, Firestore notifications/session reads, and Firebase Storage uploads.

## 1) Create Firebase Project

- Project name: `Mt Kalisungan`
- Project ID: `mt-kalisungan-system`
- Plan: start with `Spark` (free), move to `Blaze` only when needed
- Database type: `Cloud Firestore`
- Firestore mode/API: `Native mode`
- Firestore location: choose nearest to users (for PH, usually `asia-southeast1`)

## 2) Create Firestore Database

In Firebase Console:
- Go to `Firestore Database`
- Click `Create database`
- Select `Production mode`
- The current database is in `nam5 (United States)` to match the previous Firebase project's Firestore region. Firestore location cannot be changed after creation.

## 3) Firebase Storage availability

Firebase Console currently requires a billing account (Blaze plan) to create/use a Storage bucket for this project. Do not assume uploads work on Spark. Payment screenshots and guide profile uploads must be migrated to Supabase Storage or Firebase billing must be explicitly approved before production relies on them.

## 4) Register Web App + Copy Config

- Go to Project Settings -> Your apps -> Web app
- Copy these values into `.env`:

```
VITE_FIREBASE_API_KEY=""
VITE_FIREBASE_AUTH_DOMAIN=""
VITE_FIREBASE_PROJECT_ID=""
VITE_FIREBASE_STORAGE_BUCKET=""
VITE_FIREBASE_MESSAGING_SENDER_ID=""
VITE_FIREBASE_APP_ID=""
```

Restart the dev server after editing `.env`.

The checked-in `src/lib/firebase.ts` contains the public Firebase web config as defaults; environment variables override it. The local `.env` is ignored by Git and must be set separately in Vercel/Lovable where applicable.

## 5) Authentication / Supabase bridge

- Enable Google under Firebase Authentication -> Sign-in method.
- Set the Google provider's public-facing name to `Mt Kalisungan` and add the production domain `mtkali.vercel.app` under Authorized domains.
- The Supabase Edge Function `firebase-auth-bridge` must allow both `mt-kalisungan-system` and `altsys-backend-buddy` during transition. The existing `FIREBASE_PROJECT_ID` secret can remain unchanged as the rollback default as long as both IDs are explicitly allowlisted.
- Deploy the updated function before expecting Google sign-in through the new Firebase project to create a Supabase session.
- Test Google sign-in end-to-end after deploying the function; a successful Firebase popup alone does not prove Supabase session creation works.

## 6) Deploy Rules and Indexes

Install Firebase CLI globally (once):

```bash
npm install -g firebase-tools
```

Login and link project:

```bash
firebase login
firebase use --add
```

Deploy security rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## 7) Notes About Current Rules

- `firestore.rules` denies unspecified collections by default and requires Firebase Authentication for notification access. The current Google sign-in code signs out of Firebase after obtaining the ID token, so authenticated client Firestore access needs a deliberate architecture change before these collections are usable.
- `storage.rules` allows only image uploads up to 15MB under `payment-screenshots/`.
- The current Storage rules permit unauthenticated payment screenshot creation; do not deploy them to a live bucket without first reviewing the abuse/privacy implications.
