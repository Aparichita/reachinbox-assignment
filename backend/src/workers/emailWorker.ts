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

function nextWindowSchedule(email: EmailRow): Date {
    const nextHour = new Date();
    nextHour.setUTCMinutes(0, 0, 0);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);

    return new Date(
        nextHour.getTime() + email.slot_index * email.delay_seconds * 1000
    );
}

const worker = new Worker<EmailJobData>(
    "email-queue",
    async (job: Job<EmailJobData>) => {
        const { emailId } = job.data;
        console.log(`Email worker picked emailId=${emailId}`);

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
            INNER JOIN campaigns ON emails.campaign_id = campaigns.id
            WHERE emails.id = ?
            `,
            [emailId]
        );

        if (rows.length === 0) {
            console.error(`emailId=${emailId} not found`);
            return;
        }

        const email = rows[0];

        if (email.status === "sent") {
            console.log(`emailId=${emailId} already sent; skipping`);
            return;
        }

        // This is deliberately before status='sending' and sendEmail(). The
        // Lua script makes check-and-increment atomic across all workers.
        const hourlyLimit = email.hourly_limit || config.maxEmailsPerHour;
        const rateLimit = await consumeSlot(email.sender_email, hourlyLimit);

        if (!rateLimit.allowed) {
            const newScheduledAt = nextWindowSchedule(email);

            await pool.execute<ResultSetHeader>(
                `
                UPDATE emails
                SET scheduled_at = ?,
                    job_enqueued = FALSE,
                    status = 'scheduled',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [newScheduledAt, emailId]
            );

            console.log(
                `Rate limit ${rateLimit.used}/${rateLimit.limit} reached for ` +
                    `${email.sender_email}; deferred emailId=${emailId} to ` +
                    newScheduledAt.toISOString()
            );
            return;
        }

        await pool.execute<ResultSetHeader>(
            `
            UPDATE emails
            SET status = 'sending', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [emailId]
        );

        try {
            console.log(`Sending emailId=${emailId} to ${email.recipient_email}`);
            const previewUrl = await sendEmail(
                email.recipient_email,
                email.subject,
                email.body
            );

            await pool.execute<ResultSetHeader>(
                `
                UPDATE emails
                SET status = 'sent',
                    sent_at = ?,
                    preview_url = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [utcNow(), previewUrl, emailId]
            );

            console.log(`emailId=${emailId} sent successfully`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            await pool.execute<ResultSetHeader>(
                `
                UPDATE emails
                SET status = 'scheduled',
                    attempts = attempts + 1,
                    error_message = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [errorMessage, emailId]
            );

            console.error(`emailId=${emailId} failed: ${errorMessage}`);
            throw error;
        }
    },
    {
        connection: redisConnection,
        concurrency: config.workerConcurrency,
    }
);

worker.on("completed", (job) => {
    console.log(`BullMQ email job completed: jobId=${job.id}`);
});

worker.on("failed", (job, error) => {
    console.error(`BullMQ email job failed: jobId=${job?.id}`, error);
});

worker.on("error", (error) => {
    console.error("Email worker error:", error);
});

console.log(`Email worker started with concurrency=${config.workerConcurrency}`);

verifyMailer().catch((error) => {
    console.error("Ethereal SMTP verification failed:", error);
    process.exit(1);
});

export default worker;
