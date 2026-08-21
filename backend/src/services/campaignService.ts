import { ResultSetHeader } from "mysql2";
import pool from "../config/db";
import {
    CreateCampaignRequest,
    CreateCampaignResponse,
} from "../types/campaign";
import { AppError } from "../utils/AppError";

// ------------------------------------------------------------
// VALIDATION HELPERS
// ------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
    return EMAIL_REGEX.test(email);
}

function toUtcDateTime(isoString: string): string {
    const date = new Date(isoString);

    if (Number.isNaN(date.getTime())) {
        throw new AppError("start_time must be a valid ISO date");
    }

    // Convert to UTC and remove the T + milliseconds
    // because MySQL DATETIME expects:
    // YYYY-MM-DD HH:mm:ss
    return date.toISOString().slice(0, 19).replace("T", " ");
}

function addSeconds(
    isoString: string,
    seconds: number
): string {
    const date = new Date(isoString);

    date.setTime(date.getTime() + seconds * 1000);

    return date.toISOString().slice(0, 19).replace("T", " ");
}

// ------------------------------------------------------------
// CREATE CAMPAIGN
// ------------------------------------------------------------

export async function createCampaign(
    input: CreateCampaignRequest
): Promise<CreateCampaignResponse> {

    // --------------------------------------------------------
    // 1. VALIDATION
    // --------------------------------------------------------

    if (!input.user_email || !validateEmail(input.user_email)) {
        throw new AppError(
            "user_email must be a valid email address",
            400
        );
    }

    if (!input.sender_email || !validateEmail(input.sender_email)) {
        throw new AppError(
            "sender_email must be a valid email address",
            400
        );
    }

    if (!input.subject?.trim()) {
        throw new AppError("subject is required", 400);
    }

    if (!input.body?.trim()) {
        throw new AppError("body is required", 400);
    }

    if (
        !Array.isArray(input.recipients) ||
        input.recipients.length === 0
    ) {
        throw new AppError(
            "recipients must contain at least one email address",
            400
        );
    }

    for (const email of input.recipients) {
        if (!validateEmail(email.trim())) {
            throw new AppError(
                `Invalid recipient email: ${email}`,
                400
            );
        }
    }

    if (
        !Number.isInteger(input.delay_seconds) ||
        input.delay_seconds < 1
    ) {
        throw new AppError(
            "delay_seconds must be at least 1",
            400
        );
    }

    if (
        !Number.isInteger(input.hourly_limit) ||
        input.hourly_limit < 1
    ) {
        throw new AppError(
            "hourly_limit must be at least 1",
            400
        );
    }

    const startDate = new Date(input.start_time);

    if (Number.isNaN(startDate.getTime())) {
        throw new AppError(
            "start_time must be a valid ISO date",
            400
        );
    }

    if (startDate.getTime() <= Date.now()) {
        throw new AppError(
            "start_time must be in the future",
            400
        );
    }

    // --------------------------------------------------------
    // 2. DEDUPLICATE RECIPIENTS
    // --------------------------------------------------------

    const uniqueRecipients = [
        ...new Set(
            input.recipients.map(
                (email) => email.trim().toLowerCase()
            )
        ),
    ];

    // --------------------------------------------------------
    // 3. CONVERT START TIME TO UTC DATETIME
    // --------------------------------------------------------

    const startTimeUtc = toUtcDateTime(input.start_time);

    // --------------------------------------------------------
    // 4. START TRANSACTION
    // --------------------------------------------------------

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // ----------------------------------------------------
        // INSERT CAMPAIGN
        // ----------------------------------------------------

        const [campaignResult] =
            await connection.execute<ResultSetHeader>(
                `
                INSERT INTO campaigns (
                    user_email,
                    subject,
                    body,
                    start_time,
                    delay_seconds,
                    hourly_limit,
                    sender_email,
                    total_recipients,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    input.user_email,
                    input.subject.trim(),
                    input.body.trim(),
                    startTimeUtc,
                    input.delay_seconds,
                    input.hourly_limit,
                    input.sender_email,
                    uniqueRecipients.length,
                    "active",
                ]
            );

        const campaignId = campaignResult.insertId;

        // ----------------------------------------------------
        // COMPUTE EMAIL ROWS
        // ----------------------------------------------------

        const emailRows = uniqueRecipients.map(
            (recipient, index) => {
                const scheduledAt = addSeconds(
                    input.start_time,
                    index * input.delay_seconds
                );

                return [
                    campaignId,
                    recipient,
                    index,
                    scheduledAt,
                    "scheduled",
                    false,
                    0,
                ];
            }
        );

        // ----------------------------------------------------
        // BULK INSERT EMAILS
        // ----------------------------------------------------

        const placeholders = emailRows
            .map(() => "(?, ?, ?, ?, ?, ?, ?)")
            .join(", ");

        const values = emailRows.flat();

        // query() is used here because this is a potentially
        // large bulk insert with a dynamically generated number
        // of placeholders (for example, 1000 recipients).
        await connection.query<ResultSetHeader>(
            `
            INSERT INTO emails (
                campaign_id,
                recipient_email,
                slot_index,
                scheduled_at,
                status,
                job_enqueued,
                attempts
            )
            VALUES ${placeholders}
            `,
            values
        );

        // ----------------------------------------------------
        // COMMIT
        // ----------------------------------------------------

        await connection.commit();

        // ----------------------------------------------------
        // RETURN CREATED CAMPAIGN
        // ----------------------------------------------------

        const [rows] = await connection.execute<any[]>(
            `
            SELECT
                id,
                user_email,
                sender_email,
                subject,
                body,
                start_time,
                delay_seconds,
                hourly_limit,
                total_recipients,
                status,
                created_at,
                updated_at
            FROM campaigns
            WHERE id = ?
            `,
            [campaignId]
        );

        return rows[0] as CreateCampaignResponse;

    } catch (error) {

        // Something failed → undo the whole transaction.
        await connection.rollback();

        throw error;

    } finally {

        // Return the connection to the pool.
        connection.release();
    }
}