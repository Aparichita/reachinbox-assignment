export interface CreateCampaignRequest {
    user_email: string;
    sender_email: string;
    subject: string;
    body: string;
    recipients: string[];
    start_time: string;
    delay_seconds: number;
    hourly_limit: number;
}

export interface CreateCampaignResponse {
    id: number;
    user_email: string;
    sender_email: string;
    subject: string;
    body: string;
    start_time: string;
    delay_seconds: number;
    hourly_limit: number;
    total_recipients: number;
    status: "active" | "paused" | "completed";
    created_at: string;
    updated_at: string;
}

export interface ScheduledEmail {
    id: number;
    recipient_email: string;
    subject: string;
    scheduled_at: string;
    status: "scheduled";
}

export interface SentEmail {
    id: number;
    recipient_email: string;
    subject: string;
    sent_at: string | null;
    status: "sent" | "failed";
    preview_url: string | null;
    error_message: string | null;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}