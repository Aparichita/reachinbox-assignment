"use client";

import { useState } from "react";
import Sidebar, {
  type DashboardTab,
} from "@/components/dashboard/Sidebar";
import TopBar from "@/components/dashboard/TopBar";

type DashboardShellProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  scheduledCount: number;
  sentCount: number;
};

export default function DashboardShell({
  user,
  scheduledCount,
  sentCount,
}: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("scheduled");

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5] lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        scheduledCount={scheduledCount}
        sentCount={sentCount}
        user={user}
      />
      <main className="min-w-0 flex-1">
        <TopBar />
        <div className="p-6 lg:p-8">
          <div className="min-h-[calc(100vh-138px)] rounded-xl border border-dashed border-zinc-200 bg-white/40" />
        </div>
      </main>
    </div>
  );
}
