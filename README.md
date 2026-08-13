# Crew PR Due Calculator

A shared, browser-based tool: anyone can upload the day's "Crew Due For Periodic
Rest" report, and any visitor can then search a Crew ID (e.g. `ADTP1796`) to see
their PR status. The uploaded file is stored in **Vercel Blob** and is
automatically treated as expired once the calendar date changes (IST) — a new
file must then be uploaded.

## How it works

- `POST /api/upload` — saves the uploaded `.xls`/`.xlsx` to Vercel Blob at a
  fixed path (`crew-data/current.xlsx`), overwriting any previous file.
- `GET /api/file` — checks the blob's upload timestamp against today's date
  (Asia/Kolkata). If it's from a previous day, it's deleted and reported as
  invalid, so the app falls back to the upload screen.
- All parsing (column detection, the 30/32-hour rule, Next PR Due, hours
  remaining) happens **client-side** in the browser after fetching the file —
  the server just stores and serves the raw file.

## Deploy steps

### 1. Push to GitHub
Create a new repo and push this project (as-is) to it.

### 2. Import into Vercel
- Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo.
- Framework preset should auto-detect as **Next.js**. Leave build settings
  default.
- Deploy once (it will build fine, but uploads won't work yet — no Blob store
  connected).

### 3. Create and connect a Vercel Blob store
- In your Vercel project, go to **Storage → Create Database → Blob**.
- Create the store and **connect it to this project**. This automatically adds
  the `BLOB_READ_WRITE_TOKEN` environment variable to your project — no manual
  setup needed.
- Redeploy the project (Vercel usually prompts you to; if not, trigger a
  redeploy from the Deployments tab) so the new env var is picked up.

### 4. Done
Visit your deployment URL. The first visitor will see the upload screen;
after a file is uploaded, every visitor sees the search screen with that same
file until the date changes.

## Local development

```bash
npm install
vercel link          # link this folder to your Vercel project
vercel env pull .env.local   # pulls BLOB_READ_WRITE_TOKEN locally
npm run dev
```

## Notes / things you may want to adjust

- **Expiry rule**: currently "expires when the calendar date changes in IST",
  not a fixed 24 hours from upload. If you'd rather it be exactly 24 hours
  from upload time, that's a small change in `app/api/file/route.js`.
- **Anyone can overwrite**: any visitor can upload a new file, which replaces
  it for everyone. If you want to restrict who can upload, add simple auth
  (e.g. a shared passcode) to `app/api/upload/route.js`.
- **File size**: fine for reports up to a few MB; Vercel's serverless function
  body limit is the practical ceiling.
