# Travail — Setup Guide

This guide walks you through going from zero to a live Travail app. You don't need to know how to code. Follow each step in order.

---

## What you'll need
- 15 minutes
- A computer with a web browser
- An email address for your admin account

---

## Step 1: Create a Supabase account (free)

1. Go to **supabase.com** and click "Start your project" (free)
2. Sign up with GitHub or email
3. Click "New project"
4. Give it a name: `travail`
5. Set a database password — save it somewhere safe
6. Choose region: **US East** (closest to Florida)
7. Click "Create new project" — wait about 2 minutes while it sets up

---

## Step 2: Set up your database

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click "New query"
3. Open the file `supabase/migrations/001_initial.sql` from this project folder
4. Copy the entire contents and paste it into the SQL Editor
5. Click **Run** (green button)
6. You should see "Success. No rows returned" — the database is ready

---

## Step 3: Get your API keys

1. In Supabase, click **Settings** (gear icon) → **API**
2. Copy the **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
3. Copy the **anon public** key — a long string starting with `eyJ...`

---

## Step 4: Connect the app to your database

1. Find the file `.env.local` in your project folder
2. Open it in any text editor (Notepad, TextEdit, etc.)
3. Replace the placeholder values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=paste_your_project_url_here
   NEXT_PUBLIC_SUPABASE_ANON_KEY=paste_your_anon_key_here
   ```
4. Save the file

---

## Step 5: Create your admin account

1. In Supabase, click **Authentication** → **Users** → **Add user**
2. Enter your ops team email and a strong password
3. Copy the **User UID** (the long ID that appears after creating)
4. Click **Table Editor** → **members**
5. Find the row where `id = 'M-001'` (Travail Ops)
6. Click edit and paste the User UID into the `user_id` field
7. Save — your admin account is now linked

---

## Step 6: Deploy to Vercel (your live URL)

1. Go to **vercel.com** and sign up (free) — use GitHub to sign in
2. Click "Add New Project"
3. If your code is on GitHub: connect your repo. If not, install the Vercel CLI and run `vercel` in the project folder
4. When asked about environment variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your project URL from Step 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key from Step 3
5. Click Deploy — Vercel builds and gives you a live URL in ~2 minutes

---

## Step 7: Add your first real member

1. Go to your live URL and log in with your ops account (email from Step 5)
2. Go to **Admin** → **Members** → **Add member**
3. Fill in the member's info: name, member number (e.g. M-002), home airport, etc.
4. Save — the member profile exists but has no login yet
5. In Supabase → Authentication → Add user: add their email + password
6. Copy the new User UID
7. Back in Admin → Members: click edit on the member, paste the UID into "Supabase User ID"
8. The member can now log in at your URL

---

## Adding content (trips, excursions, posts)

Once you're logged in as admin, everything is managed from `/admin`:

- **Add a trip**: Admin → Trips → Add flight/excursion → fill in details → Publish
- **Post to the feed**: Admin → Feed Posts → New post → type your message → Post
- **Approve a booking**: When a member reserves a seat, go to Admin → Bookings → Approve
- **Add a member**: Admin → Members → Add member (then link their Supabase auth account)

---

## How "appears to update itself" works

When you add a new trip, post, or approve a booking in the Admin panel, every member's dashboard reflects it the next time they load the page. Members see the most current data you've entered — so from their perspective it's always "live."

---

## Troubleshooting

**"I can't log in"** — Double-check the Supabase User UID is correctly pasted into the members table's `user_id` column.

**"I see no trips"** — Run the SQL migration again (Step 2) to restore the seed data.

**"Admin page says I'm not authorized"** — Make sure `is_admin = true` on your member record in the Supabase Table Editor.

**Need help?** — The Travail app was built with Claude Code. You can re-open this session and ask questions.
