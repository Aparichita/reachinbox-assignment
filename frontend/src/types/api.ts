export interface ScheduledEmail {
  id: number;
  recipient_email: string;
  subject: string;
  scheduled_at: string;
  status: string;
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
