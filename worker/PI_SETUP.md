# Raspberry Pi setup

Everything needed to get the Reddit worker running on a Pi, from a fresh
clone to a systemd timer firing every two hours.

Written for Raspberry Pi OS (Bookworm) with the default `pi` user. If your
user or path differs, change the three marked lines in
`systemd/reddit-fetch.service` to match.

**Requires Python 3.11 or newer.** Bookworm ships 3.11; check with
`python3 --version`.

---

## 1. Clone

```bash
cd ~
git clone <your-repo-url> hyderabad-desk
cd hyderabad-desk/worker
```

The worker lives inside the same repository as the frontend. Only the
`worker/` directory is needed on the Pi, but cloning the whole thing keeps
`git pull` as the update path.

## 2. Virtual environment

```bash
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt
```

The systemd unit calls `.venv/bin/python` directly, so the venv never has
to be "activated" for the timer to work.

## 3. Credentials

```bash
cp .env.example .env
nano .env
```

Fill in all three:

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` |
| `ANTHROPIC_API_KEY` | platform.claude.com → API keys |

`worker/.env` is gitignored and must never be committed. The
`service_role` key bypasses row level security — it belongs on the Pi and
nowhere else. It must never appear in the frontend, in a `VITE_*`
variable, or in the Vercel project.

Lock the file down while you are here:

```bash
chmod 600 .env
```

## 4. Smoke test

Before installing any systemd unit, prove the worker runs:

```bash
./.venv/bin/python fetch_reddit.py --dry-run --limit 5
```

A dry run fetches from Reddit and prints what it would store. It makes no
database writes and no LLM calls, so it costs nothing and cannot corrupt
anything. Expect output like:

```
INFO fetch_reddit: r/hyderabadrealestate: 5 posts
INFO fetch_reddit: r/hyderabad: 5 posts
INFO fetch_reddit: 15 fetched across 3 subreddit(s), 0 already stored, 5 new
INFO fetch_reddit:   would classify+insert t3_1abc23  r/hyderabad  Looking for a 3BHK ...
INFO fetch_reddit: dry run: no rows written, no LLM calls, 5 post(s) would be inserted
```

Then do one real run, still capped:

```bash
./.venv/bin/python fetch_reddit.py --limit 10
```

Check the rows landed: Supabase → Table Editor → `reddit_posts`. Then run
the identical command again. The second run must insert **zero** rows and
make **zero** LLM calls — dedupe happens before classification, so each
post is classified exactly once in its lifetime.

### Other flags

| Flag | What it does |
| --- | --- |
| `--dry-run` | Print what would happen. No writes, no LLM calls. |
| `--limit N` | Cap the posts processed this run. |
| `--only-sub SUB` | Fetch one subreddit instead of the settings list. |

## 5. Install the timer

```bash
sudo cp systemd/reddit-fetch.service /etc/systemd/system/
sudo cp systemd/reddit-fetch.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now reddit-fetch.timer
```

`enable --now` both enables the timer at boot and starts it immediately.
It does **not** run the job right away — the first run happens at the next
scheduled slot. To trigger one now:

```bash
sudo systemctl start reddit-fetch.service
```

## 6. Verify

```bash
# Is the timer armed, and when does it next fire?
systemctl list-timers reddit-fetch.timer

# What did the last run do?
journalctl -u reddit-fetch --since "1 hour ago"

# Follow a run live
journalctl -u reddit-fetch -f
```

`systemctl list-timers` shows `NEXT`, `LEFT`, `LAST` and `PASSED`. If
`NEXT` is blank, the timer is not enabled.

The app itself is the other health check: open the header status strip.
"Reddit · synced 12m ago · 6 new" means the Pi wrote a `fetch_logs` row.
A red dot means the last run recorded an error, and the message says what.

---

## Changing the schedule

Edit `OnCalendar` in `/etc/systemd/system/reddit-fetch.timer`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart reddit-fetch.timer
```

| Cadence | `OnCalendar=` |
| --- | --- |
| Every 2 hours (default) | `*-*-* 00/2:07:00` |
| Every hour | `*-*-* *:07:00` |
| Every 6 hours | `*-*-* 00/6:07:00` |
| Twice a day, 8am and 8pm | `*-*-* 08,20:07:00` |

Check any expression before committing to it:

```bash
systemd-analyze calendar '*-*-* 00/2:07:00'
```

`Persistent=true` means a Pi that was off runs the missed job once on next
boot rather than silently skipping the window. `RandomizedDelaySec=300`
adds up to five minutes of jitter so the Pi is not hitting Reddit on a
perfectly predictable schedule.

Reddit's own rate limits are respected by the worker itself: requests are
spaced about a second apart, and a 429 backs off 30s then 60s before that
subreddit is skipped for the run.

---

## Changing which subreddits are watched

**No Pi access needed.** The watchlist lives in the `settings` table, and
the agent edits it in the app: Reddit tab → "Subreddits watched". The
worker reads that row at the start of every run, so a change takes effect
on the next firing with no redeploy, no restart and no SSH.

There is no keyword list any more. Every new post goes to the classifier,
which reads intent instead of matching words.

---

## Updating the worker

```bash
cd ~/hyderabad-desk
git pull
./worker/.venv/bin/pip install -r worker/requirements.txt
```

No restart is needed — `Type=oneshot` means each firing starts a fresh
process, so the next run picks up the new code.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `SUPABASE_URL is not set` | `.env` is missing or still has `PASTE_HERE`. |
| Every run logs `429` | Reddit is rate limiting this IP. Lengthen `OnCalendar`; the per-run backoff already handles bursts. |
| Timer never fires | Not enabled. `sudo systemctl enable --now reddit-fetch.timer`. |
| `status=203/EXEC` in the journal | The path in the unit is wrong. Check the `WorkingDirectory` and `ExecStart` lines. |
| Rows appear but `summary` is the raw title | Classification fell back. The run message says how many; check the journal for the API error. |
| App shows "never synced" | No `fetch_logs` row yet. Run the service once by hand and watch the journal. |
| Posts the agent ignored keep coming back | Should be impossible: the worker only ever inserts, and dedupes on `reddit_id` first. If it happens, something is upserting — check you are on current code. |
