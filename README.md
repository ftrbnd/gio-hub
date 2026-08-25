# gio-hub

A small personal-app server, deployed on Render. It's a home for standalone
tools that don't need a UI of their own:

1. **Work Schedule Parser** — turns a photo of your schedule into events on
   your iOS Calendar.
2. **Spotify Weekly Top Tracks** — keeps a playlist stocked with your top 3
   tracks each week, one playlist per month.
3. **TickTick Playlist Reminder** — every time the weekly Spotify sync
   finishes, drops a "Check monthly playlist" task (linking to that month's
   playlist) into TickTick.
4. **Discord DM** — sends messages to your personal Discord account via a bot
   you control. Every weekly Spotify sync (Module 2) DMs you a summary of
   that week's top tracks. Also ships with a standalone test endpoint; other
   modules can call `discordService.sendDirectMessage()` to notify you of
   anything else.

All four modules share one Express app, one deploy, and one set of conventions:
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
npm run dev             # watches src/ and restarts on change
```

Or, to run it the same way it runs in production (compiled, no watch):

```bash
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
start of each month. If Discord (see Module 4 below) is connected, a summary
of that week's top tracks is also DMed to you.

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

If TickTick (see Module 3 below) is connected, the response also includes
`ticktickTaskCreated: true` and a new task should show up in your TickTick
list. If Discord (see Module 4 below) is connected, the response also
includes `discordMessageSent: true` and you should get a DM listing that
week's top tracks with a link to the playlist.

Either notification failing (not connected, API error) doesn't fail the sync
itself — it's logged and reflected as `false` in the response, same as
TickTick.

---

## Module 3: TickTick Playlist Reminder

Every time `/spotify/sync` completes successfully, it also creates a TickTick
task titled "Check monthly playlist" with that month's playlist URL in the
task notes — a nudge to go curate the auto-added tracks. If TickTick isn't
connected yet, or the TickTick API call fails, the Spotify sync itself still
succeeds (the failure is just logged).

**Env vars:** `API_SECRET` (same as above — also gates the one-time
`/ticktick/login` and `/ticktick/projects` steps), `TICKTICK_CLIENT_ID`,
`TICKTICK_CLIENT_SECRET`, `TICKTICK_REDIRECT_URI`, `TICKTICK_PROJECT_ID`.

### One-time setup

1. **Create a TickTick app** at https://developer.ticktick.com/manage →
   **Create App**. Add both of these as the **OAuth Redirect URL** (you'll
   use one or the other depending on environment):
   - `http://localhost:3000/ticktick/callback` (local dev)
   - `https://<your-render-url>/ticktick/callback` (production)

   Copy the **Client ID** and **Client Secret** into `TICKTICK_CLIENT_ID` /
   `TICKTICK_CLIENT_SECRET`. Set `TICKTICK_REDIRECT_URI` to whichever of the
   two URIs matches where you're running the server.

2. **Set the env vars above** (locally in `.env`, and/or in the Render
   dashboard for production) — except `TICKTICK_PROJECT_ID`, which you don't
   have yet.

3. **Connect your TickTick account** — with the server running, open this URL
   in a browser and approve the consent screen:
   ```
   http://localhost:3000/ticktick/login?secret=<your API_SECRET>
   ```
   (or the `https://<your-render-url>/...` equivalent in production). You
   should land on a page that says "TickTick connected — you can close this
   tab." This is a one-time step — the access token it stores in Upstash is
   reused for every future task creation. TickTick's Open API doesn't issue
   refresh tokens, so if the token eventually expires, just repeat this step.

4. **Find the list (project) you want the task added to** — hit:
   ```
   http://localhost:3000/ticktick/projects?secret=<your API_SECRET>
   ```
   and copy the `id` of the list you want from the JSON array. Set that as
   `TICKTICK_PROJECT_ID`.

### Testing

```bash
curl http://localhost:3000/ticktick/projects?secret=<your API_SECRET>
```

Expect a JSON array of your TickTick lists. Then run the Module 2 sync test
above and check TickTick for the new "Check monthly playlist" task.

---

## Module 4: Discord DM

Uses [discord.js](https://discord.js.org) (REST only — no persistent gateway
connection, so it fits this request/response server and Render's free-tier
spin-down) to send direct messages to your own Discord account through a bot
you create and control.

The weekly summary embed (Module 2) ships with a button — "TickTick Reminder:
On/Off" — that toggles whether `/spotify/sync` also creates the TickTick
"Check monthly playlist" task. Clicking it flips the stored preference and
updates the button in place; no page, no extra message. Button clicks arrive
as a webhook from Discord to `POST /discord/interactions`, verified using its
Ed25519 request signature (via
[discord-interactions](https://github.com/discord/discord-interactions-js))
rather than `API_SECRET` — Discord itself is the caller here, not your
Shortcut or cron job.

**Env vars:** `API_SECRET` (same as above — also gates the test endpoint),
`DISCORD_BOT_TOKEN`, `DISCORD_USER_ID`, `DISCORD_PUBLIC_KEY` (only needed once
you complete step 5 below).

### One-time setup

1. **Create a Discord application + bot** at
   https://discord.com/developers/applications → **New Application**. Under
   **Bot**, click **Reset Token** to reveal it and copy it into
   `DISCORD_BOT_TOKEN`. (Under **Privileged Gateway Intents** you don't need
   to enable anything — this integration never connects to the gateway.)
   On the **General Information** page, copy **Public Key** into
   `DISCORD_PUBLIC_KEY`.

2. **Invite the bot to a server you're in** — under **OAuth2 → URL
   Generator**, check the `bot` scope (no permissions needed), copy the
   generated URL, open it, and add the bot to any server you're a member of
   (a private server you create just for this works fine). Discord only lets
   a bot open a DM with you if you share a server with it.

3. **Find your Discord user ID** — in Discord, enable **Settings → Advanced →
   Developer Mode**, then right-click your own name/avatar and choose
   **Copy User ID**. Set that as `DISCORD_USER_ID`.

4. **Set the env vars above** (locally in `.env`, and/or in the Render
   dashboard for production).

5. **Set the Interactions Endpoint URL** (only needed to make the TickTick
   reminder button clickable — skip this if you just want one-way DMs) — on
   the application's **General Information** page, set it to
   `https://<your-render-url>/discord/interactions` and save. Discord sends a
   verification `PING` to this URL the moment you save, so your Render
   service needs to be awake and `DISCORD_PUBLIC_KEY` already set — hit
   `/health` first if it's been asleep. This only works against a public URL;
   it can't be verified against `localhost`.

### Testing

```bash
curl -X POST http://localhost:3000/discord/test \
  -H "Authorization: Bearer <your API_SECRET>"
```

Expect `{"sent":true}` and a DM from your bot in Discord.

To test the button, run the Module 2 sync test and click the "TickTick
Reminder" button on the resulting embed (requires step 5 above, and a public
URL — button clicks won't reach `localhost`). The button's label should flip
between "On" and "Off", and subsequent syncs should respect it: `off` means
`/spotify/sync` still updates the playlist and sends the Discord summary, but
skips creating the TickTick task (`ticktickTaskCreated: false` in the
response).
