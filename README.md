# reachinbox-assignment
Full-stack email job scheduler — TypeScript, Express, BullMQ, Redis, MySQL, Next.js
## Deployment note

The full stack is deployed on Railway: API service, background worker
service, managed MySQL, and managed Redis. The scheduler, spawner,
rate limiter, recovery, and persistence all run correctly in production.

Railway's free tier blocks outbound SMTP connections (an anti-spam
measure common to most PaaS providers). The deployed worker therefore
cannot reach Ethereal's SMTP server — sends fail with ETIMEDOUT on
CONN, on both port 587 (STARTTLS) and 465 (implicit TLS). Every other
layer of the deployed system works; only the final SMTP hop is
unreachable.

Email delivery is demonstrated locally in the demo video, where the
identical code sends successfully and returns Ethereal preview URLs.