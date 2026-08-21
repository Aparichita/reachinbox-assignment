import { Job, Worker } from "bullmq";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import redisConnection from "../config/redis";
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
        // ---------------------------------------------------------
        //
        // Instead of:
        //
        // SELECT status
        // UPDATE status='sending'
        //
        // we do the check + update in ONE SQL statement.
        //
        // This is a compare-and-swap: change status from scheduled to
        // sending only if the current value is still scheduled.
        // If another worker already claimed it, affectedRows = 0.
        //

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
        // ---------------------------------------------------------

        const hourlyLimit =
            email.hourly_limit || config.maxEmailsPerHour;

        const rateLimit = await consumeSlot(
            email.sender_email,
            hourlyLimit
        );

        // ---------------------------------------------------------
        // 5. RATE LIMIT REACHED -> DEFER
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

            // IMPORTANT:
            // Do NOT throw.
            //
            // Therefore:
            // - BullMQ does not count this as a failure
            // - no retry attempt is consumed
            // - the spawner will pick it up next hour
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

            /*
             * BullMQ's attemptsMade is zero-based while the job
             * is currently executing.
             *
             * First attempt:
             * attemptsMade = 0
             *
             * Second attempt:
             * attemptsMade = 1
             *
             * Therefore:
             *
             * attemptsMade + 1 >= maxAttempts
             *
             * means this is the final attempt.
             */

            const isFinalAttempt =
                job.attemptsMade + 1 >= maxAttempts;

            // -----------------------------------------------------
            // 9. UPDATE DATABASE ACCORDING TO RETRY STATE
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

            // Throw so BullMQ knows the email send failed
            // and can perform its configured retry.
            throw error;
        }
    },

    {
        connection: redisConnection,

        // ---------------------------------------------------------
        // STEP 11: WORKER CONCURRENCY
        // ---------------------------------------------------------

        concurrency: config.workerConcurrency,

        // ---------------------------------------------------------
        // STEP 11: MINIMUM SEND DELAY
        // ---------------------------------------------------------
        //
        // Even though multiple jobs can be processed concurrently,
        // BullMQ will allow only one job to pass this limiter during
        // each duration window.
        //

        limiter: {
            max: 1,
            duration: config.minSendDelayMs,
        },
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
// -------------------------------------------------------------

verifyMailer().catch((error) => {
    console.error(
        "Ethereal SMTP verification failed:",
        error
    );

    process.exit(1);
});

export default worker;