# Branded Supabase Auth email templates

Supabase Auth sends these emails (invite, password reset, magic link,
signup confirm) using templates stored **in the Supabase dashboard**, not
in this repo. By default they're plain/unbranded — this is why members saw
a bare "You've been invited" email. The files here are branded HTML (same
look as the in-app `notify-email` Edge Function) to paste into the
dashboard.

> Everything else — "Booking confirmed", cancellations, settlements,
> proposals — is already branded because it's sent by the `notify-email`
> Edge Function (`supabase/functions/notify-email/index.ts`). These auth
> templates are the only unbranded gap.

## How to apply (one-time, ~3 min)

1. Supabase dashboard → your project → **Authentication** → **Emails** →
   **Templates** (older UI: **Authentication → Email Templates**).
2. For each template below: set the **Subject**, then paste the matching
   file's full contents into the **message body** (HTML) box, and **Save**.

   | Dashboard template   | File                | Subject                       |
   |----------------------|---------------------|-------------------------------|
   | Invite user          | `invite.html`       | You're invited to Travail     |
   | Reset Password       | `recovery.html`     | Reset your Travail password   |
   | Magic Link           | `magic-link.html`   | Your Travail sign-in link     |
   | Confirm signup       | `confirm-signup.html` | Confirm your Travail email  |

3. Make sure the **Sender name** is `Travail Concierge` and **Sender email**
   is `concierge@travailclub.com` (Authentication → Emails → SMTP / sender
   settings).

## Notes

- The only Supabase variable used is `{{ .ConfirmationURL }}` (the action
  link). Don't remove it.
- Logos load from `https://travailclub.com/travail-wordmark.png` and
  `/tropic-logo.png` — keep those reachable in production.
- After pasting, send yourself a test of each (e.g. trigger a password
  reset) and confirm it's branded and from Travail Concierge.
