"use client";

import { Send } from "lucide-react";
import EmailRow from "@/components/dashboard/EmailRow";
import EmailRowSkeleton from "@/components/dashboard/EmailRowSkeleton";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type { EmailState } from "@/hooks/useEmails";
import type { SentEmail } from "@/types/api";

type SentEmailsProps = {
  state: EmailState<SentEmail>;
};

export default function SentEmails({ state }: SentEmailsProps) {
  const { data, loading, error, refetch } = state;

  if (loading && data.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-zinc-200">
        {Array.from({ length: 5 }, (_, index) => (
          <EmailRowSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-6 py-10 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => void refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white">
        <EmptyState
          icon={<Send className="h-5 w-5" />}
          title="No sent emails yet"
          description="Emails you send will appear here."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200">
      {data.map((email) => (
        <EmailRow key={email.id} email={email} />
      ))}
      {error ? (
        <div className="flex items-center justify-between gap-4 bg-red-50 px-4 py-3 text-xs text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
