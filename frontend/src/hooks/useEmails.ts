"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type {
  PaginatedResponse,
  ScheduledEmail,
  SentEmail,
} from "@/types/api";

export type EmailTab = "scheduled" | "sent";
type EmailForTab<T extends EmailTab> = T extends "scheduled"
  ? ScheduledEmail
  : SentEmail;

export type EmailState<T> = {
  data: T[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<boolean>;
  lastSyncedAt: Date | null;
};

type UseEmailsOptions = {
  active?: boolean;
};

const POLL_INTERVAL_MS = 10_000;

function getEndpoint(tab: EmailTab): string {
  return `/api/emails/${tab}?page=1&limit=50`;
}

export function useEmails(
  tab: "scheduled",
  options?: UseEmailsOptions
): EmailState<ScheduledEmail>;
export function useEmails(
  tab: "sent",
  options?: UseEmailsOptions
): EmailState<SentEmail>;
export function useEmails<T extends EmailTab>(
  tab: T,
  options: UseEmailsOptions = {}
): EmailState<EmailForTab<T>> {
  const { active = true } = options;
  const [data, setData] = useState<EmailForTab<T>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const didStartRef = useRef(false);

  const load = useCallback(async (initialLoad = false): Promise<boolean> => {
    if (initialLoad) {
      setLoading(true);
    }

    try {
      const response = await apiFetch<
        PaginatedResponse<EmailForTab<T>>
      >(getEndpoint(tab));
      setData(response.data);
      setTotal(response.total);
      setError(null);
      setLastSyncedAt(new Date());
      return true;
    } catch {
      setError("Unable to load emails. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    const isFirstLoad = !didStartRef.current;
    didStartRef.current = true;

    if (isFirstLoad || active) {
      void load(isFirstLoad);
    }

    if (!active) {
      return;
    }

    const poll = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [active, load]);

  return {
    data,
    total,
    loading,
    error,
    refetch: () => load(),
    lastSyncedAt,
  };
}
