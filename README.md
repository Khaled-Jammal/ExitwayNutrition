# ExitWay Nutrition

## Run locally

1. Copy `.env.example` to `.env` and set a private `SESSION_SECRET`, an admin email or username in `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
2. Run `npm run dev`. This starts both the API and the site; keep this terminal open while using the app.

Only the server-configured admin can sign in. Customer registration and login are disabled. The admin username and password are configured through `ADMIN_EMAIL` and `ADMIN_PASSWORD`; sessions use signed, HTTP-only cookies.

Admins can change the home page's large hero photo and the four “Shop your goals” collection photos, and add products to the Hairloss, Vitamins, Supplements / Bodybuilding, Other products, and Promotion products sections. Promotion products appear on the home page; other products appear in their category pages. Product and site photo uploads are automatically compressed to 500 KB or less. Product records, site settings, and uploaded photos are stored in Supabase.

## Supabase setup

1. Create a Supabase project and run `supabase/setup.sql` in its SQL Editor.
2. Set `SUPABASE_URL` and the server-only `SUPABASE_SECRET_KEY` in the server environment. Never expose the secret key through a `VITE_` variable.
3. Configure `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` as server environment variables. Use a unique admin password and a long random session secret.

## Deploy to Vercel from GitHub

1. Push this project to GitHub and import that repository into Vercel. Set the Vercel project root to `ExitWayNutrition` if the repository contains multiple projects.
2. Vercel uses the Vite build (`npm run build`, output directory `dist`) for the frontend and the `api/[...path].js` function for the Express API.
3. Add `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in Vercel's Environment Variables for Production and Preview. Do not commit `.env` or put the Supabase secret key in any `VITE_` variable.
4. Redeploy after setting the variables. Run the Supabase setup SQL before testing the site; the `/api/health` endpoint reports whether the database is connected.

For production, configure the same server environment variables before starting the server. Locally, `npm run dev` starts both the API and Vite.
