import { Worker, Job } from "bullmq";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import redisConnection from "../config/redis";
import { config } from "../config/env";
import pool from "../config/db";
import { sendEmail, verifyMailer } from "../services/mailer";

interface EmailJobData {
    emailId: number;
}

interface EmailRow extends RowDataPacket {
    id: number;
    recipient_email: string;
    status: "scheduled" | "sending" | "sent" | "failed";
    attempts: number;
    subject: string;
    body: string;
    sender_email: string;
}

// All times are written from Node in UTC, matching how scheduled_at
// was inserted. Keeping one source of truth for time means the gap
// between scheduled_at and sent_at is a real signal, not a timezone bug.
function utcNow(): string {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
}

const worker = new Worker<EmailJobData>(
    "email-queue",

    async (job: Job<EmailJobData>) => {
        const { emailId } = job.data;

        console.log(`📨 Worker picked emailId=${emailId}`);

        // ----------------------------------------------------
        // 1. READ EMAIL + CAMPAIGN FROM DATABASE
        // ----------------------------------------------------

        const [rows] = await pool.execute<EmailRow[]>(
            `
            SELECT
                emails.id,
                emails.recipient_email,
                emails.status,
                emails.attempts,
                campaigns.subject,
                campaigns.body,
                campaigns.sender_email
            FROM emails
            INNER JOIN campaigns
                ON emails.campaign_id = campaigns.id
            WHERE emails.id = ?
            `,
            [emailId]
        );

        if (rows.length === 0) {
            console.error(`❌ emailId=${emailId} not found`);
            return;
        }

        const email = rows[0];

        console.log(
            `🔍 Loaded emailId=${emailId}, status=${email.status}`
        );

        // ----------------------------------------------------
        // 2. SECOND IDEMPOTENCY CHECK
        //
        // The jobId already blocks duplicate jobs at the queue level.
        // This catches the other case: a job retried after a crash
        // that happened AFTER the send but BEFORE the DB update.
        // ----------------------------------------------------

        if (email.status === "sent") {
            console.log(
                `⏭️ emailId=${emailId} already sent. Skipping.`
            );

            return;
        }

        // ----------------------------------------------------
        // 3. MARK AS SENDING
        // ----------------------------------------------------

        await pool.execute<ResultSetHeader>(
            `
            UPDATE emails
            SET status = 'sending',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [emailId]
        );

        console.log(`📤 emailId=${emailId} marked as sending`);

        // ----------------------------------------------------
        // 4. SEND THROUGH ETHEREAL
        // ----------------------------------------------------

        try {
            console.log(
                `📨 Sending emailId=${emailId} to ${email.recipient_email}`
            );

            const previewUrl = await sendEmail(
                email.recipient_email,
                email.subject,
                email.body
            );

            // ------------------------------------------------
            // 5. MARK AS SENT
            // ------------------------------------------------

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
                [utcNow(), previewUrl, emailId]
            );

            console.log(
                `✅ emailId=${emailId} sent successfully`
            );

            console.log(
                `🔗 Preview: ${previewUrl ?? "No preview URL"}`
            );
        } catch (error) {
            // ----------------------------------------------
            // 6. RECORD THE FAILED ATTEMPT
            //
            // Deliberately NOT setting status = 'failed' here.
            // Retries come later; a row that fails attempt 1 and
            // succeeds on attempt 2 should never have been marked
            // failed in between. Status stays 'scheduled' until
            // all attempts are exhausted.
            // ----------------------------------------------

            const errorMessage =
                error instanceof Error
                    ? error.message
                    : String(error);

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
                [errorMessage, emailId]
            );

            console.error(
                `❌ emailId=${emailId} failed: ${errorMessage}`
            );

            // Throwing tells BullMQ the job failed so it can retry.
            throw error;
        }
    },

    {
        connection: redisConnection,
        concurrency: config.workerConcurrency,
    }
);

worker.on("completed", (job) => {
    console.log(`✅ BullMQ job completed: jobId=${job.id}`);
});

worker.on("failed", (job, error) => {
    console.error(
        `❌ BullMQ job failed: jobId=${job?.id}`,
        error
    );
});

worker.on("error", (error) => {
    console.error("❌ BullMQ worker error:", error);
});

console.log(
    `👷 Email worker started with concurrency=${config.workerConcurrency}`
);

verifyMailer()
    .then(() => {
        console.log("✅ Ethereal SMTP connection verified");
    })
    .catch((error) => {
        console.error("❌ Ethereal SMTP verification failed:", error);
        process.exit(1);
    });

export default worker;
