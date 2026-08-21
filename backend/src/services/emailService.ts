import pool from "../config/db";
import {
    PaginatedResponse,
    ScheduledEmail,
    SentEmail,
} from "../types/campaign";

// ------------------------------------------------------------
// GET SCHEDULED EMAILS
// ------------------------------------------------------------

export async function getScheduledEmails(
    page: number,
    limit: number
): Promise<PaginatedResponse<ScheduledEmail>> {

    const offset = (page - 1) * limit;

    // Safe to use query() here because limit and offset
    // are clamped integers, not raw user-provided strings.
    const [rows] = await pool.query<any[]>(
        `
        SELECT
            emails.id,
            emails.recipient_email,
            campaigns.subject,
            emails.scheduled_at,
            emails.status
        FROM emails
        INNER JOIN campaigns
            ON emails.campaign_id = campaigns.id
        WHERE emails.status = 'scheduled'
        ORDER BY emails.scheduled_at ASC
        LIMIT ? OFFSET ?
        `,
        [limit, offset]
    );

    const [countRows] = await pool.execute<any[]>(
        `
        SELECT COUNT(*) AS total
        FROM emails
        WHERE status = 'scheduled'
        `
    );

    return {
        data: rows as ScheduledEmail[],
        total: Number(countRows[0].total),
        page,
        limit,
    };
}

// ------------------------------------------------------------
// GET SENT EMAILS
// ------------------------------------------------------------

export async function getSentEmails(
    page: number,
    limit: number
): Promise<PaginatedResponse<SentEmail>> {

    const offset = (page - 1) * limit;

    // Safe to use query() here because limit and offset
    // are clamped integers, not raw user-provided strings.
    const [rows] = await pool.query<any[]>(
        `
        SELECT
            emails.id,
            emails.recipient_email,
            campaigns.subject,
            emails.sent_at,
            emails.status,
            emails.preview_url,
            emails.error_message
        FROM emails
        INNER JOIN campaigns
            ON emails.campaign_id = campaigns.id
        WHERE emails.status IN ('sent', 'failed')
        ORDER BY emails.sent_at DESC
        LIMIT ? OFFSET ?
        `,
        [limit, offset]
    );

    const [countRows] = await pool.execute<any[]>(
        `
        SELECT COUNT(*) AS total
        FROM emails
        WHERE status IN ('sent', 'failed')
        `
    );

    return {
        data: rows as SentEmail[],
        total: Number(countRows[0].total),
        page,
        limit,
    };
}