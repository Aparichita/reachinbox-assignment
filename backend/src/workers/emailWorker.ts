import { Job, Worker } from "bullmq";
import IORedis from "ioredis";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { config } from "../config/env";
import pool from "../config/db";
import { sendEmail, verifyMailer } from "../services/mailer";
import { consumeSlot } from "../services/rateLimiter";

interface EmailJobData {
    emailId: number;
}

interface EmailRow extends RowDataPacket {
    id: number;
    recipient_email: string;
    status: "scheduled" | "sending" | "sent" | "failed";
    attempts: number;
    slot_index: number;
    scheduled_at: string;
    subject: string;
    body: string;
    sender_email: string;
    hourly_limit: number | null;
    delay_seconds: number;
}

function utcNow(): string {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Calculates the beginning of the next UTC hour and then
 * adds the email's original slot offset.
 *
 * Example:
 * next hour = 13:00:00
 * slot_index = 2
 * delay_seconds = 2
 *
 * new scheduled_at = 13:00:04
 */
function nextWindowSchedule(email: EmailRow): Date {
    const nextHour = new Date();

    nextHour.setUTCMinutes(0, 0, 0);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);

    return new Date(
        nextHour.getTime() +
            email.slot_index * email.delay_seconds * 1000
    );
}

// -------------------------------------------------------------
// DEDICATED REDIS CONNECTION FOR BULLMQ EMAIL WORKER
//
// BullMQ Workers use blocking commands and internally duplicate
// their connection. Sharing the app-wide singleton with the Queue
// and the rate limiter can hit connection limits on managed Redis,
// where the failure is invisible because it happens on the
// duplicated connection, below our error handlers.
// -------------------------------------------------------------

const workerConnection = process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, {
          maxRetriesPerRequest: null,
      })
    : new IORedis({
          host: config.redis.host,
          port: config.redis.port,
          maxRetriesPerRequest: null,
      });

console.log(
    `Email worker Redis target: ` +
        `host=${workerConnection.options.host ?? "unknown"}, ` +
        `port=${workerConnection.options.port ?? "unknown"}, ` +
        `db=${workerConnection.options.db ?? 0}, ` +
        `urlConfigured=${Boolean(process.env.REDIS_URL)}`
);

workerConnection.on("ready", () => {
    console.log("✅ Email worker Redis connection ready");
});

workerConnection.on("error", (error) => {
    console.error(
        "❌ Email worker Redis connection error:",
        error
    );
});

const worker = new Worker<EmailJobData>(
    "email-queue",

    async (job: Job<EmailJobData>) => {
        const { emailId } = job.data;

        console.log(`Email worker picked emailId=${emailId}`);

        // ---------------------------------------------------------
        // 1. LOAD EMAIL + CAMPAIGN
        // ---------------------------------------------------------

        const [rows] = await pool.execute<EmailRow[]>(
            `
            SELECT
                emails.id,
                emails.recipient_email,
                emails.status,
                emails.attempts,
                emails.slot_index,
                emails.scheduled_at,
                campaigns.subject,
                campaigns.body,
                campaigns.sender_email,
                campaigns.hourly_limit,
                campaigns.delay_seconds
            FROM emails
            INNER JOIN campaigns
                ON emails.campaign_id = campaigns.id
            WHERE emails.id = ?
            `,
            [emailId]
        );

        if (rows.length === 0) {
            console.error(`emailId=${emailId} not found`);
            return;
        }

        const email = rows[0];

        // ---------------------------------------------------------
        // 2. IDEMPOTENCY CHECK
        // ---------------------------------------------------------

        if (email.status === "sent") {
            console.log(
                `emailId=${emailId} already sent; skipping`
            );
            return;
        }

        // ---------------------------------------------------------
        // 3. ATOMICALLY CLAIM THE EMAIL
        //
        // Compare-and-swap: the row is either ours or it isn't.
        // No gap between checking and taking.
        // ---------------------------------------------------------

        const [claimResult] =
            await pool.execute<ResultSetHeader>(
                `
                UPDATE emails
                SET
                    status = 'sending',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status = 'scheduled'
                `,
                [emailId]
            );

        if (claimResult.affectedRows === 0) {
            console.log(
                `emailId=${emailId} was already claimed by another worker; skipping`
            );
            return;
        }

        console.log(`emailId=${emailId} claimed successfully`);

        // ---------------------------------------------------------
        // 4. RATE LIMIT
        //
        // Claim happens BEFORE this, so only the worker that owns
        // the row consumes a slot. Otherwise the counter drifts.
        // ---------------------------------------------------------

        const hourlyLimit =
            email.hourly_limit || config.maxEmailsPerHour;

        const rateLimit = await consumeSlot(
            email.sender_email,
            hourlyLimit
        );

        // ---------------------------------------------------------
        // 5. RATE LIMIT REACHED -> DEFER
        //
        // Returns cleanly rather than throwing, so a deferral never
        // consumes a retry attempt. Status goes back to 'scheduled'
        // or the row would be stranded as 'sending' forever.
        // ---------------------------------------------------------

        if (!rateLimit.allowed) {
            const newScheduledAt =
                nextWindowSchedule(email);

            await pool.execute<ResultSetHeader>(
                `
                UPDATE emails
                SET
                    scheduled_at = ?,
                    job_enqueued = FALSE,
                    status = 'scheduled',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [newScheduledAt, emailId]
            );

            console.log(
                `Rate limit ${rateLimit.used}/${rateLimit.limit} ` +
                    `reached for ${email.sender_email}. ` +
                    `Deferred emailId=${emailId} ` +
                    `from ${email.scheduled_at} ` +
                    `to ${newScheduledAt.toISOString()}`
            );

            return;
        }

        // ---------------------------------------------------------
        // 6. SEND EMAIL
        // ---------------------------------------------------------

        try {
            console.log(
                `Sending emailId=${emailId} ` +
                    `to ${email.recipient_email}`
            );

            const previewUrl = await sendEmail(
                email.recipient_email,
                email.subject,
                email.body
            );

            // -----------------------------------------------------
            // 7. MARK AS SENT
            // -----------------------------------------------------

            await pool.execute<ResultSetHeader>(
                `
                UPDATE emails
                SET
                    status = 'sent',
                    sent_at = ?,
                    preview_url = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [
                    utcNow(),
                    previewUrl,
                    emailId,
                ]
            );

            console.log(
                `emailId=${emailId} sent successfully`
            );
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : String(error);

            // -----------------------------------------------------
            // 8. DETERMINE WHETHER THIS IS THE FINAL ATTEMPT
            // -----------------------------------------------------

            const maxAttempts =
                job.opts.attempts ?? 1;

            const isFinalAttempt =
                job.attemptsMade + 1 >= maxAttempts;

            // -----------------------------------------------------
            // 9. UPDATE DATABASE ACCORDING TO RETRY STATE
            //
            // Only mark 'failed' on the last attempt. A row that
            // fails attempt 1 and succeeds on attempt 2 should never
            // have been marked failed in between.
            // -----------------------------------------------------

            if (isFinalAttempt) {
                await pool.execute<ResultSetHeader>(
                    `
                    UPDATE emails
                    SET
                        status = 'failed',
                        attempts = attempts + 1,
                        error_message = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    `,
                    [
                        errorMessage,
                        emailId,
                    ]
                );

                console.error(
                    `emailId=${emailId} permanently failed ` +
                        `after ${maxAttempts} attempt(s): ${errorMessage}`
                );
            } else {
                await pool.execute<ResultSetHeader>(
                    `
                    UPDATE emails
                    SET
                        status = 'scheduled',
                        attempts = attempts + 1,
                        error_message = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    `,
                    [
                        errorMessage,
                        emailId,
                    ]
                );

                console.error(
                    `emailId=${emailId} failed. ` +
                        `BullMQ will retry. ` +
                        `Attempt ${job.attemptsMade + 1}/${maxAttempts}: ` +
                        `${errorMessage}`
                );
            }

            // Tell BullMQ the job failed so it can retry.
            throw error;
        }
    },

    {
        // ---------------------------------------------------------
        // DEDICATED REDIS CONNECTION
        // ---------------------------------------------------------

        connection: workerConnection,

        // ---------------------------------------------------------
        // WORKER CONCURRENCY
        // ---------------------------------------------------------

        concurrency: config.workerConcurrency,

        // ---------------------------------------------------------
        // MINIMUM SEND DELAY
        //
        // Concurrency is how many jobs can be in flight; the limiter
        // is how fast jobs are allowed through. max:1 per 2000ms
        // means sends start ~2s apart regardless of concurrency.
        // ---------------------------------------------------------

        limiter: {
            max: 1,
            duration: config.minSendDelayMs,
        },

        // The worker starts consuming as soon as this module loads.
        autorun: true,
    }
);

// -------------------------------------------------------------
// BULLMQ EVENTS
// -------------------------------------------------------------

worker.on("completed", (job) => {
    console.log(
        `BullMQ email job completed: jobId=${job.id}`
    );
});

worker.on("failed", (job, error) => {
    console.error(
        `BullMQ email job failed: jobId=${job?.id}`,
        error
    );
});

worker.on("error", (error) => {
    console.error(
        "Email worker error:",
        error
    );
});

console.log(
    `Email worker started with concurrency=${config.workerConcurrency}`
);

console.log(
    `Minimum send delay=${config.minSendDelayMs}ms`
);

// -------------------------------------------------------------
// VERIFY SMTP
//
// Log failures but do NOT exit. On a container platform an exit
// here produces a silent crash-loop: the process dies before it
// can consume anything, restarts, dies again, and no useful error
// ever surfaces. Staying up means individual sends fail visibly
// with a stored error_message instead.
// -------------------------------------------------------------

verifyMailer().catch((error) => {
    console.error(
        "Ethereal SMTP verification failed:",
        error
    );
    console.error(
        "Worker will stay up; sends will fail until credentials are fixed."
    );
});

export default worker;