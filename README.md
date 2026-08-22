# ReachInbox Email Scheduler

A production-grade email scheduling service. You upload a list of recipients, pick a start time, set how fast emails should go out, and the system sends them slowly over time — surviving restarts, respecting hourly limits, and never sending the same email twice.

Built for the Outbox Labs SDE Internship assignment.

**Live frontend:** `https://reachinbox-frontend-mu.vercel.app/`
**Live API:** `https://reachinbox-api-production-0367.up.railway.app`
**Demo video:** `https://www.loom.com/share/dd7820a5389d4ded854c8e80c74a2fa6`
`https://www.loom.com/share/5f9c98acbbd54f09ab3962695ff14f84`

---

## What this actually does

You have 500 email addresses and you want to email all of them starting at 9 PM tonight. You don't want to blast all 500 in one second — real providers would flag that as spam. So you send them slowly: one every 2 seconds, maximum 200 per hour.

That's the whole thing. A system that says "hold these emails, send them later, slowly, and don't mess up."

The hard part is **reliable**. If the server crashes at 8:59 PM, the emails still need to go out at 9 PM when it comes back. That's what separates this from a toy scheduler, and it's what most of the design decisions below are about.

---

## Tech stack

**Backend** — TypeScript, Express, BullMQ, Redis, MySQL, Nodemailer (Ethereal SMTP)
**Frontend** — Next.js, TypeScript, Tailwind CSS, NextAuth (Google OAuth)
**Infra** — Docker Compose for local MySQL + Redis, Railway for deployment, Vercel for the frontend

---

## Running it locally

### 1. Start the databases

```bash
docker compose up -d
```

This starts MySQL 8 and Redis 7 in containers, each with a named volume so data survives container restarts. Redis has AOF (append-only file) persistence enabled — this matters because BullMQ's delayed jobs live in Redis, and if Redis lost its data on restart, every scheduled email would vanish.

Both services have healthchecks. "Container started" is not the same as "ready to accept connections," and MySQL in particular takes a few seconds to initialize.

### 2. Get Ethereal credentials

Go to [ethereal.email](https://ethereal.email) and click "Create Ethereal Account". You get a fake SMTP inbox instantly — emails don't go anywhere real, but you get a preview URL showing exactly what would have been delivered. No domain needed, no spam risk.

Copy the host, port, username, and password.

### 3. Backend

```bash
cd backend
npm install
cp .env.example .env    # then fill in your values
npm run dev             # API on port 4000
```

In a second terminal:

```bash
cd backend
npm run dev:worker      # email worker + spawner
```

The API and worker run as **separate processes**. The API only produces jobs; the worker consumes them. In production you'd scale these independently — if sending gets slow, that shouldn't make your API slow.

### 4. Frontend

```bash
cd frontend
npm install
# create .env.local (see below)
npm run dev             # http://localhost:3000
```

### Environment variables

**backend/.env**

```
PORT=4000
NODE_ENV=development

MYSQL_HOST=localhost
MYSQL_PORT=3307
MYSQL_USER=reachinbox_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=reachinbox

REDIS_HOST=localhost
REDIS_PORT=6379

ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=your_account@ethereal.email
ETHEREAL_PASSWORD=your_password

WORKER_CONCURRENCY=5
MIN_SEND_DELAY_MS=2000
MAX_EMAILS_PER_HOUR=200
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_MS=5000

SPAWNER_INTERVAL_SECONDS=10
SPAWNER_LOOKAHEAD_MINUTES=5
SPAWNER_BATCH_SIZE=50
SENDING_TIMEOUT_MINUTES=5
```

**frontend/.env.local**

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate a long random string>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SENDER_EMAIL=your_account@ethereal.email
```

Every limit is configurable. Nothing is hardcoded — the app refuses to start if a required variable is missing, which is deliberate (see "fail fast" below).

For Google OAuth, add these in Google Cloud Console → Credentials:
- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

---

## Architecture

```
        Frontend (Next.js)
               │
               ▼
        Express API  ──────────┐
               │               │
               ▼               ▼
           MySQL           Redis (BullMQ)
               │               │
               │◄──────────────┤
               │               │
          Spawner ─────────────┤
        (finds due emails)     │
                               ▼
                        Email Worker
                               │
                               ▼
                        Ethereal SMTP
```

### The core idea: MySQL is truth, Redis is the schedule

MySQL stores **what** the emails are and **what happened** to them. Redis stores only **when to wake up**.

This split is the reason the system is recoverable. If Redis were wiped completely, every scheduled email still exists in MySQL and the queue can be rebuilt from it. If the app process dies, Redis still holds the timers.

### How scheduling works

**1. Campaign creation.** When you submit the compose form, the API validates everything, deduplicates the recipient list, and computes `scheduled_at` for *every* recipient upfront:

```
scheduled_at = start_time + (index × delay_seconds)
```

So with a 10:00 start and a 2-second delay: 10:00:00, 10:00:02, 10:00:04, and so on.

Campaign row and all email rows are inserted inside a **transaction**, and the emails go in as a single bulk INSERT rather than 1000 separate ones. Without the transaction you could end up with a campaign claiming 1000 recipients but only 400 rows actually inserted — silent data corruption.

**2. The batch spawner.** A background job wakes up every 10 seconds and asks MySQL: *"which emails are due in the next 5 minutes and haven't been queued yet?"* It enqueues only those.

It does **not** dump all 1000 jobs into Redis at creation time. Three reasons:

- The API stays fast and atomic. It does one small thing and returns in milliseconds.
- Pausing or cancelling a campaign means flipping one database row, not hunting down 1000 Redis job IDs.
- Redis isn't holding jobs that aren't due for six hours.

The spawner is **resumable**. The `job_enqueued` boolean on each email row is its cursor. If it crashes halfway through a batch, it restarts and simply asks which rows are still `FALSE`.

**3. The worker.** Picks up due jobs, checks the rate limit, sends via Ethereal, and writes the result back to MySQL.

### No cron. Anywhere.

The requirement banned cron, and I took that seriously — no `node-cron`, no `setInterval`, no `setTimeout` for scheduling.

Scheduling is entirely BullMQ delayed jobs. The spawner itself is a **self-rescheduling BullMQ job**: each run ends by scheduling the next one with a delay. That means the spawner's own timer lives in Redis, so killing the Node process doesn't erase it.

`setInterval` would have been cron in disguise — it dies with the process. The whole point is that the schedule outlives the code that created it.

---

## Rate limiting

The requirement was strict about this: configurable, safe across multiple workers, no in-memory counts, and rate-limited jobs must be **deferred, not dropped**.

### Redis counters, keyed by sender and hour

```
ratelimit:{sender_email}:{YYYY-MM-DDTHH}
```

Per-sender because the assignment requires supporting multiple senders. Hour-bucketed because the window then rolls over naturally — no cleanup job needed, and each key gets a ~2 hour TTL so it deletes itself.

### Why not a JavaScript variable?

```js
let count = 0;   // wrong
```

Each worker process has its own memory. Run two workers and each thinks it's on email #1. Your limit of 200 quietly becomes 400.

Redis gives all workers one shared counter.

### Why a Lua script and not just INCR

The obvious approach has a race:

```
GET count     → 199
GET count     → 199   (second worker, before the first increments)
INCR          → 200
INCR          → 201   ← over the limit
```

Check-then-increment is two separate commands, and another worker can slip in between them.

There's also a subtler bug: if you `INCR` first and *then* reject, you've burned a slot that was never used. Over time the counter drifts above reality and you under-send.

So the check and the increment happen inside a **Lua script**, which Redis executes atomically. The counter only increments when a slot is actually granted.

### When the limit is hit

The job is **not** failed or dropped. Instead:

1. Compute the start of the next UTC hour
2. Recompute `scheduled_at = next_window_start + (slot_index × delay_seconds)`
3. Write the new time back to MySQL, set `job_enqueued = FALSE`, status back to `scheduled`
4. Return cleanly — **without throwing**

That last point matters. Throwing would make BullMQ count it as a failed attempt and eventually exhaust the retries, turning a rate-limited email into a permanently failed one. A deferral consumes zero retry attempts.

### Order preservation

Every email keeps its original `slot_index`. Because the deferred time is recomputed *from* that index, emails land in the next hour in exactly their original sequence.

Order is preserved **by arithmetic**, and it's visible in the database — rather than hidden inside Redis queue internals. I chose this over BullMQ's `priority` field because priority interacts awkwardly with delayed jobs and hides the ordering somewhere I can't inspect.

---

## Concurrency and send delay

Two separate controls that people often conflate:

- **`WORKER_CONCURRENCY=5`** — how many jobs the worker can process at once
- **BullMQ limiter `{ max: 1, duration: 2000 }`** — how *frequently* jobs are allowed through

With both set, five jobs can be in flight, but only one is released every 2 seconds. Effective send rate is roughly one email per 2 seconds regardless of concurrency.

Concurrency gives throughput headroom; the limiter enforces provider-safe pacing. I chose 2 seconds as the minimum gap to mimic real provider throttling.

---

## Idempotency — three layers

The requirement: the same email must never be sent twice.

**Layer 1 — Database constraint**
`UNIQUE(campaign_id, recipient_email)`. Uploaded CSVs often contain duplicates. This stops them at the data level before they ever become two jobs.

**Layer 2 — BullMQ job ID**
`jobId = email-{emailId}`, derived from the database row. BullMQ refuses to create a second job with an existing ID, so the same email can't be double-queued.

**Layer 3 — Atomic claim in the worker**

```sql
UPDATE emails
SET status = 'sending'
WHERE id = ? AND status = 'scheduled'
```

Then check `affectedRows`. If it's 0, another worker already claimed this row — log and return.

This is a **compare-and-swap**. The row is either yours or it isn't, with no gap between checking and taking. A `SELECT` followed by an `UPDATE` has a window where two workers both read `scheduled` before either writes.

### Ordering: claim before rate limit

The worker claims the row *before* asking the rate limiter for a slot. If it were the other way around, a worker could consume a slot and then lose the claim race — burning a slot it never used, and drifting the counter.

Consequence: since the claim sets status to `sending`, the deferral path has to set it back to `scheduled`, or the row would be stranded as `sending` forever and the spawner would never pick it up again.

---

## Restart persistence

The assignment's hardest requirement: *after a restart, future emails still send at the correct time, and emails are not re-sent.*

### What happens in each failure case

**Worker process dies and restarts.** Jobs are in Redis, not in the process's memory. BullMQ reconnects and continues. Nothing lost.

**API process dies.** The API is only a producer. Rows are already in MySQL; the worker and spawner carry on regardless.

**Both die, restart later.** The spawner's query is `scheduled_at <= now + lookahead`, so past-due emails still match. The delay calculation clamps to zero — a negative delay becomes "send immediately" rather than an error.

**Redis wiped entirely.** This was the real gap, and it needed explicit handling.

If Redis is gone, MySQL still has rows marked `job_enqueued = TRUE` — telling the spawner "already queued, skip me" — but the job behind them no longer exists. Those emails would be stuck forever.

So on worker startup, a recovery function runs:

```
find: status='scheduled' AND job_enqueued=TRUE
  ↓
check whether the BullMQ job actually exists
  ↓
missing?  →  reset job_enqueued = FALSE
  ↓
spawner picks them up on the next tick
```

**Stale `sending` rows.** A worker killed mid-send leaves a row as `sending` forever, invisible to the claim query. Startup recovery resets rows that have been `sending` longer than `SENDING_TIMEOUT_MINUTES` back to `scheduled`.

---

## Timezone handling

Everything is stored as UTC. The pool is configured with `timezone: 'Z'` and `dateStrings: true` so the driver returns predictable strings instead of JavaScript `Date` objects that could silently shift.

The schema uses `DATETIME` rather than `TIMESTAMP` — `TIMESTAMP` does its own session-timezone conversion, and for a scheduler I'd rather the timezone policy be explicit in application code than implicit in MySQL's session state.

Conversion happens at the edges only:

- **Inbound:** the frontend's `datetime-local` input gives a local wall-clock string with no zone. `new Date(value).toISOString()` converts it correctly before it's sent.
- **Outbound:** the frontend appends `Z` to backend timestamps before parsing, then displays in the user's local timezone. Without the `Z`, JavaScript would interpret a UTC string as local time and every displayed time would be off by the user's offset.

`scheduled_at` (planned) and `sent_at` (actual) are deliberately **separate columns**. Retries and rate-limit deferrals make them diverge, and the gap between them is the main debugging signal — it tells you *that* something was delayed and roughly why.

---

## Features implemented

### Backend

| Requirement | Status |
|---|---|
| Accept scheduling requests via API | ✅ `POST /api/campaigns` with full validation |
| Store in relational DB | ✅ MySQL, transactional insert, bulk insert for recipients |
| BullMQ delayed jobs, no cron | ✅ Self-rescheduling spawner, zero cron/setInterval |
| Multiple senders via Ethereal SMTP | ✅ Per-campaign `sender_email` |
| Survives restart, no duplicates | ✅ Orphan recovery + stale-sending recovery |
| Configurable worker concurrency | ✅ `WORKER_CONCURRENCY` |
| Minimum delay between sends | ✅ BullMQ limiter, `MIN_SEND_DELAY_MS` (2s) |
| Hourly rate limit, Redis-backed | ✅ Atomic Lua script, per-sender, per-hour |
| Limit reached → defer, not drop | ✅ Rescheduled to next window, 0 retries consumed |
| Order preserved on deferral | ✅ Recomputed from `slot_index` |
| Idempotency | ✅ Three layers |
| Retries with backoff | ✅ 3 attempts, exponential |

### Frontend

| Requirement | Status |
|---|---|
| Real Google OAuth | ✅ NextAuth, no mock |
| Header with name, email, avatar | ✅ User card with dropdown |
| Logout | ✅ In the user dropdown |
| Scheduled / Sent sections | ✅ Sidebar navigation with live counts |
| Compose New Email | ✅ Full-screen view per the Figma |
| CSV upload with detected count | ✅ Parses, dedupes, shows "N email addresses detected" |
| Start time, delay, hourly limit | ✅ With quick presets |
| Loading states | ✅ Skeleton rows |
| Empty states | ✅ On both tables |
| Error handling | ✅ Toasts + inline field validation |
| Reusable components, DRY | ✅ `Button`, `Input`, `Spinner`, `Skeleton`, `EmptyState`, `Toast` |
| TypeScript throughout | ✅ Typed API responses and props, no `any` |

**Extras beyond the brief:** live "Last synced at" timestamp, auto-refresh every 10 seconds (paused when the tab is hidden), skipped-line warnings on CSV upload, removable recipient chips, and a `/health` endpoint.

---

## Behaviour under load

**1000+ emails scheduled for roughly the same time.** They're inserted as one bulk INSERT with timestamps computed upfront, so campaign creation stays fast. The spawner then feeds them into Redis in batches of 50 as they come due — Redis never holds jobs that aren't imminent. The worker's limiter releases them at one per 2 seconds regardless of how many are waiting.

**Rate limit exceeded.** Emails past the hourly limit are recomputed into the next hour window, preserving order via `slot_index`, and set back to `job_enqueued = FALSE` so the spawner re-picks them. Nothing is dropped, nothing fails, no retry budget is spent. If the next hour also fills up, the same deferral happens again — the system naturally spreads a large campaign across as many hours as it needs.

---

## Trade-offs and things I'd do differently

**Batch spawning vs. bulk enqueue.** Batching keeps the API fast and Redis lean, but it adds a component that can itself die. I made it resumable via the `job_enqueued` cursor. Trade-off accepted: slightly more moving parts for much better control.

**Retry state.** Between retries a row goes back to `scheduled` but keeps `job_enqueued = TRUE`. The `scheduled` status lets the retrying job pass the atomic claim; `job_enqueued` staying true stops the spawner creating a *second* job alongside BullMQ's retry. The downside: if a BullMQ job were manually deleted mid-retry, the row would be orphaned — scheduled but invisible to the spawner. Under normal operation BullMQ owns it.

**At-least-once, not exactly-once.** There's an irreducible window: SMTP accepts the message, then the process dies before MySQL records `sent`. On recovery that email could be sent again. The three idempotency layers make this window as narrow as possible, but genuinely exactly-once delivery to an external SMTP server would need provider-side deduplication. I'd rather state this honestly than claim a guarantee the system can't make.

**Fail-fast on config, but not on SMTP.** Missing environment variables crash the app at startup on purpose — a config problem should be obvious immediately, not surface at 2 AM when the first user hits an endpoint. But I deliberately made SMTP verification *non-fatal* after discovering that `process.exit(1)` on a container platform produces a silent crash-loop: the process dies before it can log anything useful, restarts, dies again. Fail-fast is right locally and wrong in a container.

**`pool.query` vs `pool.execute` for LIMIT/OFFSET.** MySQL doesn't accept LIMIT values as prepared-statement parameters, so those queries use `query()`. Safe here because the values are clamped integers from validated config, never user strings.

**Search and filter in the UI are non-functional.** They're in the Figma so I built the visual affordance, but wiring them wasn't in the requirements and I prioritized the graded features.

---

## Bugs I hit and what they taught me

These cost me real time and are worth writing down.

**`getJob()` returns truthy for completed jobs.** My orphan recovery checked "does a BullMQ job exist for this row?" and skipped rows where it did. But BullMQ retains completed jobs in Redis, so `getJob()` returned an object for jobs that had finished hours ago and would never run again. Rows stayed `job_enqueued = TRUE` forever, invisible to the spawner. Fix: check the job's *state*, not merely its existence — only `waiting`, `delayed`, and `active` count as live.

**jobId idempotency has a failure mode.** Because BullMQ counts a completed job as existing, re-adding the same `jobId` is silently ignored — the add appears to succeed but nothing enters the queue. This looked bizarre in the logs: `queue.add` returned a job, `getJob` said it existed, and yet `waiting`, `delayed`, and `active` were all zero. Fix: `removeOnComplete: { age: 3600 }` so completed jobs expire and jobId reuse stays safe.

**TypeScript elides side-effect imports.** The worker module is constructed with `autorun: true`, so importing it is what starts it. But the import binding was never referenced, so TypeScript stripped the import entirely — the worker simply didn't exist in the build. The spawner kept producing jobs and nothing consumed them. Fix: `import "./workers/emailWorker"` as an explicit side-effect import.

Each of these was invisible in the sense that nothing threw an error. The system just quietly did less than it appeared to.

---

## Deployment

Deployed on Railway as four services: API (web), worker (background), managed MySQL, managed Redis. Frontend on Vercel.

The API and worker are separate Railway services from the same repo, with root directory `backend` and different start commands (`npm start` / `npm run start:worker`).

### Known limitation: SMTP on the deployed worker

**Railway's free tier blocks outbound SMTP connections** — a standard anti-spam measure across most PaaS providers. The deployed worker cannot reach Ethereal's SMTP server; sends fail with `ETIMEDOUT` on `CONN`, on both port 587 (STARTTLS) and 465 (implicit TLS).

Everything else in the deployed stack works correctly: the API serves requests, MySQL and Redis are connected, the spawner ticks and enqueues, the worker claims jobs, recovery runs on startup, and the rate limiter functions. Only the final SMTP hop is unreachable.

Email delivery is demonstrated **locally in the demo video**, where the identical code sends successfully and returns Ethereal preview URLs.

### Debug endpoints

I added a few endpoints under `/api/test/` while debugging the deployed instance, since Railway's private database hostnames aren't reachable from outside its network:

- `GET /api/test/init-schema` — runs the schema against the managed MySQL from inside the deployed API
- `GET /api/test/db/emails` — read-only inspection of email rows
- `GET /api/test/db/unstick` — resets `job_enqueued` on overdue rows
- `GET /api/test/queue/clear-completed` — clears retained completed jobs

These are development conveniences and would be removed or authenticated in a real deployment.

---

## Assumptions

- One sender per campaign, chosen at creation time
- Recipients are deduplicated within a campaign but not across campaigns
- The hourly limit is per-sender; a campaign without one falls back to `MAX_EMAILS_PER_HOUR`
- Plain-text email bodies (the Figma shows a rich text toolbar; I skipped it as out of scope)
- Any authenticated Google user sees all campaigns — there's no per-user data isolation, since the brief didn't specify multi-tenancy