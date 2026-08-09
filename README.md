# gio-hub

A small personal-app server, deployed on Render. It's a home for standalone
tools that don't need a UI of their own:

1. **Work Schedule Parser** — turns a photo of your schedule into events on
   your iOS Calendar.
2. **Spotify Weekly Top Tracks** — keeps a playlist stocked with your top 3
   tracks each week, one playlist per month.

Both modules share one Express app, one deploy, and one set of conventions:
routes → controllers → services → models, each request authenticated with a
bearer secret.

## Deploy the server to Render

Render's free web service tier needs no credit card and auto-deploys from
GitHub.

1. Push this repo to a GitHub repo of your own (create it on github.com,
   then):
   ```bash
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. Go to https://dashboard.render.com → **New** → **Blueprint**, and point it
   at this repo. Render will read [`render.yaml`](render.yaml) and prompt you
   for the environment variables below — enter them directly in Render's
   dashboard (not anywhere else). You only need the ones for the modules
   you're actually using; see each module's section below for what each
   variable is and where to get it.
3. Once deployed, note your service's URL, e.g. `https://gio-hub.onrender.com`.
   Check it's alive: `https://<your-url>/health` should return `{"ok":true}`.

Render's free tier spins the service down after inactivity — the first
request after a while takes ~30-60s to wake up, then responds normally.

## Local development

```bash
cp .env.example .env   # fill in the vars for whichever module(s) you're using
npm install
npm run build
npm start
```

---

## Module 1: Work Schedule Parser

Sends a photo of your schedule — an ADP app screenshot, or a photo of the
printed sheet posted in the store — to Claude (vision) and gets back
structured shifts, driven by an iOS Shortcut that adds them to your Calendar.

**Env vars:** `ANTHROPIC_API_KEY` ([console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)),
`API_SECRET` (any long random string you make up, e.g. `openssl rand -hex 24`
— stops strangers from hitting your endpoint and spending your API credits).

### Build the iOS Shortcut

Open the **Shortcuts** app → **+** → build a new shortcut with these actions,
in order:

1. **Select Photos** — turn off "Select Multiple" (one schedule photo per run).
2. **Text** — set to your name as it appears on the schedule (e.g. `"Gio"` or
   however you're listed on the printed sheet). This only matters for the
   printed multi-employee sheet; harmless for ADP's own-shifts view.
3. **Text** — set to your workplace's name (e.g. `"Acme Coffee Co."`) — used
   in the prompt sent to Claude and in the calendar event title.
4. **Get Contents of URL**
   - URL: `https://<your-render-url>/parse-schedule`
   - Method: `POST`
   - Headers: `Authorization` → `Bearer <your API_SECRET>`
   - Request Body: **Form**
     - Field `image`, type **File**, value = _Selected Photos_
     - Field `employeeName`, type **Text**, value = the Text from step 2
     - Field `workplaceName`, type **Text**, value = the Text from step 3
5. **Repeat with Each** — Input: _Contents of URL_ (Shortcuts auto-parses the
   JSON array into a list of dictionaries; each loop iteration gives you one
   shift as `Repeat Item`).
   Inside the loop:
   - **Text**: `[Repeat Item → date]T[Repeat Item → start_time]:00`
     (e.g. `2026-07-28T06:00:00`)
   - **Date** — "Get Date from Input", Input Format: **ISO 8601** → this gives
     you the shift's real start date/time. Name this result `Start Date`.
   - **Text**: `[Repeat Item → date]T[Repeat Item → end_time]:00`
   - **Date** — same as above → name this result `End Date`.
   - **Find Calendar Events** — filter: _Start Date is `Start Date`_ (from
     above), Calendar = the calendar you want these on. This is the dedupe
     check so re-running the shortcut doesn't create duplicate events.
   - **If** _Find Calendar Events_ **Count** _is_ `0`:
     - **Add New Event** — Title: `Work — [workplace name Text from step 3]`,
       Start Date: `Start Date`, End Date: `End Date`, Calendar: same one as above.
6. **Show Notification** — "Added this week's shifts to your calendar."

Name the shortcut something like "Add Work Schedule" and add it to your Home
Screen or the widget for one-tap access.

### Testing

Run the shortcut once against a real ADP screenshot, and once against a real
photo of the printed sheet. Check:

- Correct dates/times land on the calendar.
- Running it again on the _same_ photo doesn't create duplicate events.
- A photo that isn't a schedule (or doesn't contain your name) results in zero
  events added, not garbage events.

Test the endpoint directly with a sample image:

```bash
curl -X POST http://localhost:3000/parse-schedule \
  -H "Authorization: Bearer <your API_SECRET>" \
  -F "employeeName=Gio" \
  -F "workplaceName=Acme Coffee Co." \
  -F "image=@/path/to/schedule.jpg"
```

---

## Module 2: Spotify Weekly Top Tracks

Every week, pulls your Spotify top 3 tracks (short-term listening window) and
adds any not already there to a playlist for the current month (e.g.
"Top Tracks — August 2026"). A new playlist is created automatically at the
start of each month.

**Env vars:** `API_SECRET` (same as above — also gates the one-time
`/spotify/login` step), `CRON_SECRET` (a *separate* secret, generated the same
way, used only by the weekly cron job — kept separate so a leak in a
third-party cron dashboard can't be used against `/parse-schedule`),
`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

### One-time setup

1. **Create a Spotify Developer app** at
   https://developer.spotify.com/dashboard → **Create app**. Under Settings,
   add both of these as **Redirect URIs** (you'll use one or the other
   depending on environment):
   - `http://localhost:3000/spotify/callback` (local dev)
   - `https://<your-render-url>/spotify/callback` (production)

   Copy the **Client ID** and **Client Secret** into `SPOTIFY_CLIENT_ID` /
   `SPOTIFY_CLIENT_SECRET`. Set `SPOTIFY_REDIRECT_URI` to whichever of the two
   URIs matches where you're running the server.

2. **Create a free Upstash Redis database** at https://console.upstash.com →
   copy the REST API **URL** and **Token** into `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`. This stores your Spotify refresh token and
   monthly playlist state. Use the *same* database for both local dev and
   production so you only have to connect Spotify once.

3. **Set all the env vars** above (locally in `.env`, and/or in the Render
   dashboard for production).

4. **Connect your Spotify account** — with the server running, open this URL
   in a browser and approve the consent screen:
   ```
   http://localhost:3000/spotify/login?secret=<your API_SECRET>
   ```
   (or the `https://<your-render-url>/...` equivalent in production). You
   should land on a page that says "Spotify connected — you can close this
   tab." This is a one-time step — the refresh token it stores in Upstash is
   reused for every future sync.

5. **Set up the weekly job with [QStash](https://console.upstash.com/qstash)**
   (Upstash's scheduler — same account as the Redis database above). Under
   **Schedules** → **Create Schedule**:
   - Destination URL: `https://<your-render-url>/spotify/sync`
   - Cron expression: e.g. `0 15 * * 1` (every Monday at 15:00 UTC)
   - Method: `POST`
   - Headers: `Authorization` → `Bearer <your CRON_SECRET>`
   - Retries: QStash retries failed deliveries automatically, which also
     covers Render's free-tier cold start (a sleeping instance's first
     response can take 30-60s) — no manual timeout tuning needed like a
     plain cron pinger would require.

### Testing

```bash
curl -X POST http://localhost:3000/spotify/sync \
  -H "Authorization: Bearer <your CRON_SECRET>"
```

Expect a JSON response listing the tracks added and any already present this
month. Check your Spotify app for the new/updated monthly playlist. Run the
same command again immediately — it should report the same tracks as
"already present" rather than adding duplicates.
