# ExitWay Nutrition

## Run locally

1. Copy `.env.example` to `.env` and set a private `SESSION_SECRET`, an admin email or username in `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
2. Run `npm run dev`. This starts both the API and the site; keep this terminal open while using the app.

Only the server-configured admin can sign in. Customer registration and login are disabled. The admin username and password are configured through `ADMIN_EMAIL` and `ADMIN_PASSWORD`; sessions use signed, HTTP-only cookies.

Admins can change the home page's large hero photo and the four “Shop your goals” collection photos, and add products to the Hairloss, Vitamins, Supplements / Bodybuilding, Other products, and Promotion products sections. Promotion products appear on the home page; other products appear in their category pages. Product and site photo uploads are automatically compressed to 500 KB or less. Product records, site settings, and uploaded photos are saved under the ignored `data/` directory, so they persist between server restarts and are not committed to source control.

For production, set `NODE_ENV=production` and configure `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the server environment before starting the server.
