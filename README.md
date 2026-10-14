# SOKO

A marketplace for Rwanda — buyers browse and order, sellers list products and
withdraw earnings, payments are held in escrow, sellers pass KYC verification,
and admins approve KYC, manage orders and set the platform commission.

## How it's put together

There is no build step and no framework. The whole front end is one
self-contained file:

```
public/
  soko.html      ← the entire app: markup, CSS and JS inline (~2.6k lines)
api/
  ai.js          ← Vercel function: proxies Gemini so the API key stays server-side
supabase/
  check-rls.sql  ← read-only audit of your Row Level Security setup
vercel.json      ← static output dir + friendly URLs
```

`public/` is the deployment root. `soko.html` talks to Supabase directly from
the browser using the public **anon** key, so Row Level Security is the only
thing protecting your data — see below.

### URLs

| URL | Served by |
|---|---|
| `/` | rewrite → `/soko.html` |
| `/reset-password` | rewrite → `/soko.html` (the Supabase recovery link lands here) |
| `/soko.html` | the app itself |
| `/api/ai` | Gemini proxy function |

## Local development

```bash
npm install          # no dependencies — this is a no-op today
npm run dev          # npx vercel dev → http://localhost:3000
```

`vercel dev` serves the static files *and* runs `api/ai.js`, which is what you
want, because the AI assistant calls that function. A plain static server
(`npx serve public`) will render the app but every AI request will 404.

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project → Import** the repo.
3. When it asks for settings, leave the framework preset as **Other**. There is
   no build command and no output directory to set — `vercel.json` supplies
   `"outputDirectory": "public"`.
4. Add environment variables (Settings → Environment Variables):

   | Name | Required | Notes |
   |---|---|---|
   | `GEMINI_API_KEY` | yes | from [Google AI Studio](https://aistudio.google.com/apikey) |
   | `GEMINI_MODEL` | no | defaults to `gemini-2.5-flash` |

5. Deploy. `npm run deploy` (`npx vercel --prod`) also works from your machine.

### Supabase settings to update after you have a domain

- **Authentication → URL Configuration → Redirect URLs**: add
  `https://your-domain/reset-password` (and
  `http://localhost:3000/reset-password` for local work). If you skip this,
  Supabase falls back to your Site URL — the reset flow still works because
  `soko.html` detects the recovery token on any page, but the link will look
  different.
- Set **Site URL** to `https://your-domain`.

## Password reset

`forgotPassword()` emails a Supabase recovery link. On return, `soko.html`
detects the `type=recovery` token (via `onAuthStateChange` for the PKCE flow, or
directly from the URL hash for the implicit flow) and opens the "Set a New
Password" modal, which calls `sb.auth.updateUser()`. The recovery token is then
stripped from the URL so a refresh can't replay it.

## Row Level Security

The Supabase anon key is public by design — it ships in `soko.html`. **RLS is
therefore the only thing standing between your database and the internet.**
See [`supabase/check-rls.sql`](supabase/check-rls.sql) for how to audit it and
what the target policies are.

## Notes

- `.env` holds `VITE_SUPABASE_*` values from the old Vite setup. Nothing reads
  them any more; `soko.html` has its own copy of the URL and anon key inline.
