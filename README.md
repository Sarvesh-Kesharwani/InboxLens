# InboxLens

InboxLens is a private Gmail intelligence dashboard: connect Gmail, import mail in batches, classify it into practical categories, search, review, and correct rules.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The current build ships a working mock-mode dashboard plus fullstack route stubs:

- `GET /api/gmail/connect` creates the Gmail OAuth URL when Google env vars are present.
- `POST /api/sync` imports Gmail in paginated batches. It defaults to 500 message IDs per page, returns `nextPageToken`, and the dashboard appends each batch.
- `POST /api/classify` classifies one message using deterministic rules.

Gmail does not return an entire large mailbox in one call. Keep pressing `Load next 500` to page through more mail. For lakhs of messages, move the import loop into a Render background worker and persist results in Postgres instead of holding all rows in the browser.

## Gmail access note

InboxLens uses app-internal categories first. Real Gmail labels are intentionally out of scope for MVP because `gmail.modify` is more invasive. For read-only import, configure OAuth with:

```text
https://www.googleapis.com/auth/gmail.readonly
```

This is a restricted Gmail API scope. A public launch needs OAuth consent verification, privacy policy, and likely security-assessment planning if restricted data is stored or transmitted on servers.

## Render

`render.yaml` defines a web service plus Postgres. Add the Google OAuth values in Render environment variables, set `APP_BASE_URL` to the Render URL, and set `GOOGLE_REDIRECT_URI` to the deployed callback URL.

Local callback for the current app shape:

```text
http://localhost:3000/api/auth/callback/google
```

If the dev server runs on another port, register that exact port too, for example:

```text
http://localhost:3002/api/auth/callback/google
```

## Vercel

Vercel is a good fit for the dashboard, OAuth callback, and paged Gmail imports. The Gmail API is called from Next.js API routes, so in production those calls run on Vercel Functions, not directly on the local browser/device.

For very large mailbox imports, use a background worker plus database persistence instead of trying to fetch lakhs of messages in one Vercel request.

Required Vercel environment variables:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APP_BASE_URL=https://your-vercel-domain.vercel.app
GOOGLE_REDIRECT_URI=https://your-vercel-domain.vercel.app/api/auth/callback/google
```
