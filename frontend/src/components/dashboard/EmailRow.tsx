import { Clock3, ExternalLink } from "lucide-react";
import { formatUtcDateTime } from "@/lib/date";
import type { ScheduledEmail, SentEmail } from "@/types/api";

type EmailRowProps = {
  email: ScheduledEmail | SentEmail;
};

function isSentEmail(email: ScheduledEmail | SentEmail): email is SentEmail {
  return "sent_at" in email;
}

export default function EmailRow({ email }: EmailRowProps) {
  const sentEmail = isSentEmail(email);
  const isFailed = sentEmail && email.status === "failed";
  const content = (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-zinc-500">To:</span>
        <span className="font-medium text-zinc-900">
          {email.recipient_email}
        </span>
        {sentEmail ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              isFailed
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {isFailed ? "Failed" : "Sent"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <Clock3 className="h-3.5 w-3.5" />
            {formatUtcDateTime(email.scheduled_at)}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="truncate font-semibold text-zinc-900">
          {email.subject}
        </span>
        <span className="text-zinc-300">—</span>
        <span className="truncate text-zinc-500">
          {sentEmail && email.preview_url
            ? "Open preview"
            : "Email preview"}
        </span>
        {sentEmail && email.preview_url ? (
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        ) : null}
      </div>
      {isFailed && email.error_message ? (
        <p className="text-xs text-red-600">{email.error_message}</p>
      ) : null}
    </div>
  );

  if (sentEmail && email.preview_url) {
    return (
      <a
        href={email.preview_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 border-b border-zinc-200 bg-white px-4 py-4 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="flex items-center gap-4 border-b border-zinc-200 bg-white px-4 py-4 transition hover:bg-zinc-50">
      {content}
    </div>
  );
}
