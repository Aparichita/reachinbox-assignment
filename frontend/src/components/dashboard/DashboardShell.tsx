"use client";

import { useState } from "react";
import ComposeEmail from "@/components/dashboard/ComposeEmail";
import Sidebar, {
  type DashboardTab,
} from "@/components/dashboard/Sidebar";
import TopBar from "@/components/dashboard/TopBar";
import ScheduledEmails from "@/components/dashboard/ScheduledEmails";
import SentEmails from "@/components/dashboard/SentEmails";
import { useEmails } from "@/hooks/useEmails";
import { formatLastSyncedAt } from "@/lib/date";
import { useToast } from "@/components/ui/Toast";

type DashboardShellProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

type DashboardView = "list" | "compose";

export default function DashboardShell({
  user,
}: DashboardShellProps) {
  const [view, setView] = useState<DashboardView>("list");
  const [activeTab, setActiveTab] = useState<DashboardTab>("scheduled");
  const scheduled = useEmails("scheduled", {
    active: activeTab === "scheduled",
  });
  const sent = useEmails("sent", {
    active: activeTab === "sent",
  });
  const { showToast } = useToast();
  const activeState = activeTab === "scheduled" ? scheduled : sent;

  const handleRefresh = async () => {
    const succeeded = await activeState.refetch();

    if (succeeded) {
      showToast({ type: "success", message: "Emails refreshed" });
    } else {
      showToast({
        type: "error",
        message: "Unable to load emails. Please try again.",
      });
    }
  };

  const handleComposeSuccess = async () => {
    setView("list");
    setActiveTab("scheduled");
    await scheduled.refetch();
    showToast({
      type: "success",
      message: "Email campaign scheduled successfully",
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5] lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setView("list");
          setActiveTab(tab);
        }}
        onCompose={() => setView("compose")}
        scheduledCount={scheduled.total}
        sentCount={sent.total}
        user={user}
      />
      <main className="min-w-0 flex-1">
        {view === "compose" ? (
          <ComposeEmail
            userEmail={user.email ?? ""}
            onBack={() => setView("list")}
            onSuccess={handleComposeSuccess}
            onError={(message) =>
              showToast({ type: "error", message })
            }
          />
        ) : (
          <>
            <TopBar
              onRefresh={() => void handleRefresh()}
              refreshing={activeState.loading && activeState.data.length > 0}
            />
            <div className="p-6 lg:p-8">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs text-zinc-400">
                  {formatLastSyncedAt(activeState.lastSyncedAt)}
                </p>
              </div>
              {activeTab === "scheduled" ? (
                <ScheduledEmails state={scheduled} />
              ) : (
                <SentEmails state={sent} />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
