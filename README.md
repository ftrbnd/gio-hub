# work-schedule

Turns a photo of your schedule — an ADP app screenshot, or a
photo of the printed sheet posted in the store — into events on your iOS Calendar.

It's two pieces:

1. **`src/index.ts`** — a tiny Node/Express endpoint that sends your photo to
   Claude (vision) and gets back structured shifts as JSON.
2. **An iOS Shortcut** (built by hand in the Shortcuts app — see below) that lets
   you pick the photo, calls the server, and adds each shift to your Calendar.

## 1. Deploy the server to Render

Render's free web service tier needs no credit card and auto-deploys from GitHub.

1. Push this repo to a GitHub repo of your own (create it on github.com, then):
   ```bash
   git remote add origin <your-repo-url>
   git push -u origin master
   ```
2. Go to https://dashboard.render.com → **New** → **Blueprint**, and point it at
   this repo. Render will read [`render.yaml`](render.yaml) and prompt you for
   two environment variables — enter them directly in Render's dashboard (not
   anywhere else):
   - `ANTHROPIC_API_KEY` — from https://console.anthropic.com/settings/keys
   - `API_SECRET` — any long random string you make up (this is what stops
     strangers from hitting your endpoint and spending your API credits). A
     quick way to generate one:
     ```bash
     openssl rand -hex 24
     ```
3. Once deployed, note your service's URL, e.g. `https://work-schedule-server.onrender.com`.
   Check it's alive: `https://<your-url>/health` should return `{"ok":true}`.

Render's free tier spins the service down after inactivity — the first request
after a while takes ~30-60s to wake up, then responds normally.

## 2. Build the iOS Shortcut

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

## Local development

```bash
cp .env.example .env   # then fill in ANTHROPIC_API_KEY and API_SECRET
npm install
npm run build
npm start
```

Test the endpoint with a sample image:

```bash
curl -X POST http://localhost:3000/parse-schedule \
  -H "Authorization: Bearer <your API_SECRET>" \
  -F "employeeName=Gio" \
  -F "workplaceName=Acme Coffee Co." \
  -F "image=@/path/to/schedule.jpg"
```
