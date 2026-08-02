# TITAN — Campus Lost & Found Board

A Lost & Found tracking board for TITAN (Taj Institute of Technology & Applied
Networks), built with Node.js, Express, MongoDB/Mongoose and EJS.

## What's new in this pass

- **Redesigned UI** — a "case file" visual language (kraft-paper background,
  ticket-style item cards, rubber-stamped Lost/Found status, monospace case
  IDs) with real vector icons (Lucide) instead of emoji.
- **Live stats strip** — total / active lost / active found / reunited counts
  on the board.
- **Categories & locations** — items are tagged (Electronics, Documents,
  Keys, Bags, Accessories, Clothing, Books, Other) with matching icons, and
  the location you pick on the post form is now actually saved (it wasn't
  before).
- **Save / bookmark items**, filter tabs (All / Lost / Found / Saved),
  category filter, and search — all combinable.
- **Reward flag** — mark a lost report as offering a reward.
- **Contact modal** — a "mail" button opens a modal with a `mailto:` link to
  the poster, instead of exposing raw contact info on the card.
- **Toast notifications** replace `alert()` for every action.
- **Drag-and-drop photo upload** with an instant local preview before it's
  sent to the server.
- **AJAX everywhere on the board** — resolve / save / delete update the page
  instantly via the JSON API below, no full reload.
- **Local upload fallback** — if `CLOUDINARY_URL` isn't set, images are saved
  to `/public/uploads` instead of failing.
- **Demo data** — `npm run seed` creates a demo login and 8 realistic sample
  reports (photos from Lorem Picsum) so the board isn't empty on first run.

## Deploying on Vercel

Vercel supports Express with zero config — it detects `index.js` and runs it
as a single Vercel Function. Two things to know before deploying there:

1. **`CLOUDINARY_URL` is required on Vercel**, not optional. Vercel's
   filesystem is read-only at request time, so the local-disk upload
   fallback (used when `CLOUDINARY_URL` is unset) doesn't work there —
   photo uploads will fail without it. Get a free Cloudinary account and
   set the connection string as an environment variable in your Vercel
   project settings.
2. Sessions are stored in MongoDB (via `connect-mongo`), not in memory —
   this is required for serverless hosts where different requests can hit
   different function instances, and it works fine on a normal server too.

**Steps:**

1. Push this repo to GitHub (already done if you're reading this from there).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. In the project's Environment Variables settings, add:
   - `MONGO_URI`
   - `SESSION_SECRET`
   - `CLOUDINARY_URL` (required — see above)
4. Deploy. No `vercel.json` or build config needed.

## Setup

```bash
npm install
cp .env.example .env   # then fill in MONGO_URI at minimum
npm run seed            # optional: adds a demo account + sample items
npm start                # or: npm run dev (nodemon)
```

Required environment variables (see `.env`):

- `MONGO_URI` — MongoDB Atlas (or local) connection string.
- `SESSION_SECRET` — any random string, used to sign the session cookie.
- `CLOUDINARY_URL` — optional. If omitted, uploaded photos are stored on
  local disk under `/public/uploads` instead.

## Pages

| Route         | Description                          |
|---------------|---------------------------------------|
| `/login`      | Sign in                               |
| `/signup`     | Create an account                     |
| `/board`      | Browse / search / filter items        |
| `/post-item`  | Post a lost or found report           |
| `/profile`    | Your own posts + activity stats       |

## JSON REST API

All API routes are under `/api` and require the same session cookie as the
web pages (log in first). Every response is JSON: `{ success: true, ... }`
or `{ success: false, error: "..." }`.

| Method | Route                     | Description                          |
|--------|----------------------------|---------------------------------------|
| POST   | `/api/auth/signup`         | Create an account, starts a session   |
| POST   | `/api/auth/login`          | Log in, starts a session              |
| POST   | `/api/auth/logout`         | End the session                       |
| GET    | `/api/stats`                | Board-wide counts                     |
| GET    | `/api/items`                | List items (`?type=`, `?category=`, `?search=`, `?saved=true`) |
| POST   | `/api/items`                | Create an item (multipart: `title`, `description`, `type`, `category`, `location`, `reward`, `rewardAmount`, `image`) |
| PATCH  | `/api/items/:id/resolve`    | Mark an item resolved                 |
| PATCH  | `/api/items/:id/save`       | Toggle bookmark for the current user  |
| DELETE | `/api/items/:id`            | Delete an item you posted             |

## Tech stack

Node.js, Express 5, MongoDB + Mongoose, EJS, express-session, Multer,
bcryptjs, Cloudinary (optional), Lucide icons, Space Grotesk / Inter / IBM
Plex Mono via Google Fonts.
