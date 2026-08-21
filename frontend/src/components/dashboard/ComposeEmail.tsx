"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import { apiFetch } from "@/lib/api";
import {
  dedupeRecipients,
  parseRecipientsFromText,
} from "@/lib/recipients";
import {
  getInMinutesPreset,
  getTomorrowAtPreset,
  isFutureLocalDatetime,
  localDatetimeToIso,
} from "@/lib/datetime";
import type {
  CreateCampaignRequest,
  CreateCampaignResponse,
} from "@/types/api";

type ComposeEmailProps = {
  userEmail: string;
  onBack: () => void;
  onSuccess: () => Promise<void>;
  onError: (message: string) => void;
};

type FormErrors = {
  from?: string;
  recipients?: string;
  subject?: string;
  body?: string;
  startTime?: string;
  delay?: string;
  hourlyLimit?: string;
};

const senderEmail = process.env.NEXT_PUBLIC_SENDER_EMAIL ?? "";

function FormRow({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="grid gap-2 border-b border-zinc-100 py-5 lg:grid-cols-[140px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <label className="pt-2 text-sm font-medium text-zinc-700">{label}</label>
      <div>
        {children}
        {error ? (
          <p className="mt-1.5 text-xs text-red-600">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

function RecipientChip({
  email,
  onRemove,
}: {
  email: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800">
      {email}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-green-700 transition hover:bg-green-100 hover:text-green-900 focus:outline-none focus:ring-2 focus:ring-green-500"
        aria-label={`Remove ${email}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export default function ComposeEmail({
  userEmail,
  onBack,
  onSuccess,
  onError,
}: ComposeEmailProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientsExpanded, setRecipientsExpanded] = useState(false);
  const [skippedWarning, setSkippedWarning] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [delaySeconds, setDelaySeconds] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState("");
  const [startTimeLocal, setStartTimeLocal] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const visibleRecipients = recipientsExpanded
    ? recipients
    : recipients.slice(0, 3);
  const hiddenCount = recipientsExpanded
    ? 0
    : Math.max(recipients.length - 3, 0);

  function addRecipient(rawValue: string): boolean {
    const value = rawValue.trim().toLowerCase();

    if (!value) {
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setErrors((current) => ({
        ...current,
        recipients: "Enter a valid email address",
      }));
      return false;
    }

    setRecipients((current) => dedupeRecipients([...current, value]));
    setErrors((current) => ({ ...current, recipients: undefined }));
    return true;
  }

  function handleRecipientInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();

      if (addRecipient(recipientInput)) {
        setRecipientInput("");
      }
    }
  }

  function handleRemoveRecipient(email: string) {
    setRecipients((current) => current.filter((item) => item !== email));
  }

  async function handleFileUpload(file: File) {
    const text = await file.text();
    const { emails, skippedCount } = parseRecipientsFromText(text);

    setRecipients((current) => dedupeRecipients([...current, ...emails]));

    if (skippedCount > 0) {
      setSkippedWarning(
        `${skippedCount} invalid ${skippedCount === 1 ? "entry was" : "entries were"} skipped`
      );
    } else {
      setSkippedWarning(null);
    }

    setErrors((current) => ({ ...current, recipients: undefined }));
  }

  function validateForm(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!userEmail) {
      nextErrors.from = "User email is unavailable from your session";
    }

    if (!senderEmail) {
      nextErrors.from = "NEXT_PUBLIC_SENDER_EMAIL is not configured";
    }

    if (recipients.length === 0) {
      nextErrors.recipients = "Add at least one recipient";
    }

    if (!subject.trim()) {
      nextErrors.subject = "Subject is required";
    }

    if (!body.trim()) {
      nextErrors.body = "Body is required";
    }

    const parsedDelay = Number(delaySeconds);
    if (!Number.isInteger(parsedDelay) || parsedDelay < 1) {
      nextErrors.delay = "Delay must be at least 1 second";
    }

    const parsedHourlyLimit = Number(hourlyLimit);
    if (!Number.isInteger(parsedHourlyLimit) || parsedHourlyLimit < 1) {
      nextErrors.hourlyLimit = "Hourly limit must be at least 1";
    }

    if (!startTimeLocal) {
      nextErrors.startTime = "Choose a start time";
    } else if (!isFutureLocalDatetime(startTimeLocal)) {
      nextErrors.startTime = "Start time must be in the future";
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateForm();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload: CreateCampaignRequest = {
      user_email: userEmail,
      sender_email: senderEmail,
      subject: subject.trim(),
      body: body.trim(),
      recipients,
      start_time: localDatetimeToIso(startTimeLocal),
      delay_seconds: Number(delaySeconds),
      hourly_limit: Number(hourlyLimit),
    };

    setSubmitting(true);

    try {
      await apiFetch<CreateCampaignResponse>("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      await onSuccess();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Unable to schedule email. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-[#f7f7f5] px-6 py-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-green-500"
            aria-label="Back to email list"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="truncate text-lg font-semibold text-[#111111]">
            Compose New Email
          </h1>
        </div>

        <Button
          type="submit"
          form="compose-email-form"
          variant="outline"
          disabled={submitting}
          className="gap-2"
        >
          {submitting ? <Spinner /> : null}
          Send Later
        </Button>
      </header>

      <form
        id="compose-email-form"
        className="px-6 py-2 lg:px-8"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <FormRow label="From" error={errors.from}>
          <select
            value={senderEmail}
            disabled
            className="h-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <option value={senderEmail}>
              {senderEmail || "Sender email not configured"}
            </option>
          </select>
        </FormRow>

        <FormRow label="To" error={errors.recipients}>
          <div className="flex items-center gap-3">
            <Input
              type="email"
              value={recipientInput}
              onChange={(event) => setRecipientInput(event.target.value)}
              onKeyDown={handleRecipientInputKeyDown}
              onBlur={() => {
                if (addRecipient(recipientInput)) {
                  setRecipientInput("");
                }
              }}
              placeholder="Add recipient email"
              className="h-10 flex-1 px-3"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void handleFileUpload(file);
                }

                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 text-sm font-semibold text-green-700 transition hover:text-green-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              Upload List
            </button>
          </div>

          {recipients.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-zinc-500">
                {recipients.length} email{" "}
                {recipients.length === 1 ? "address" : "addresses"} detected
              </p>
              <div className="flex flex-wrap gap-2">
                {visibleRecipients.map((email) => (
                  <RecipientChip
                    key={email}
                    email={email}
                    onRemove={() => handleRemoveRecipient(email)}
                  />
                ))}
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setRecipientsExpanded(true)}
                    className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800 transition hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    +{hiddenCount}
                  </button>
                ) : null}
                {recipientsExpanded && recipients.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setRecipientsExpanded(false)}
                    className="text-xs font-medium text-zinc-500 transition hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    Show less
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {skippedWarning ? (
            <p className="mt-2 text-xs text-amber-700">{skippedWarning}</p>
          ) : null}
        </FormRow>

        <FormRow label="Subject" error={errors.subject}>
          <Input
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Email subject"
            className="h-10 w-full px-3"
          />
        </FormRow>

        <FormRow label="Delay / Limit">
          <div className="grid max-w-md grid-cols-2 gap-4">
            <div>
              <p className="mb-1.5 text-xs text-zinc-500">
                Delay between 2 emails
              </p>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={delaySeconds}
                onChange={(event) => setDelaySeconds(event.target.value)}
                placeholder="00"
                className="h-10 w-full px-3"
              />
              {errors.delay ? (
                <p className="mt-1.5 text-xs text-red-600">{errors.delay}</p>
              ) : null}
            </div>
            <div>
              <p className="mb-1.5 text-xs text-zinc-500">Hourly Limit</p>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={hourlyLimit}
                onChange={(event) => setHourlyLimit(event.target.value)}
                placeholder="00"
                className="h-10 w-full px-3"
              />
              {errors.hourlyLimit ? (
                <p className="mt-1.5 text-xs text-red-600">
                  {errors.hourlyLimit}
                </p>
              ) : null}
            </div>
          </div>
        </FormRow>

        <FormRow label="Start Time" error={errors.startTime}>
          <div className="space-y-3">
            <Input
              type="datetime-local"
              value={startTimeLocal}
              onChange={(event) => setStartTimeLocal(event.target.value)}
              className="h-10 w-full max-w-md px-3"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                className="px-3 py-2 text-xs"
                onClick={() =>
                  setStartTimeLocal(getInMinutesPreset(5))
                }
              >
                In 5 minutes
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="px-3 py-2 text-xs"
                onClick={() =>
                  setStartTimeLocal(getTomorrowAtPreset(10, 0))
                }
              >
                Tomorrow 10:00 AM
              </Button>
            </div>
          </div>
        </FormRow>

        <FormRow label="Body" error={errors.body}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Type Your Reply..."
            rows={12}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </FormRow>
      </form>
    </div>
  );
}
