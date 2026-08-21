"use client";

import {
  ChevronRight,
  Clock3,
  LogOut,
  Send,
} from "lucide-react";
import { signOut } from "next-auth/react";

export type DashboardTab = "scheduled" | "sent";

type SidebarProps = {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  scheduledCount: number;
  sentCount: number;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

const navigationItems: Array<{
  tab: DashboardTab;
  label: string;
  icon: typeof Clock3;
}> = [
  { tab: "scheduled", label: "Scheduled", icon: Clock3 },
  { tab: "sent", label: "Sent", icon: Send },
];

function getInitial(user: SidebarProps["user"]): string {
  return (user.name?.trim().charAt(0) || user.email?.trim().charAt(0) || "U").toUpperCase();
}

export default function Sidebar({
  activeTab,
  onTabChange,
  scheduledCount,
  sentCount,
  user,
}: SidebarProps) {
  const counts: Record<DashboardTab, number> = {
    scheduled: scheduledCount,
    sent: sentCount,
  };

  return (
    <aside className="flex min-h-screen w-full shrink-0 flex-col border-b border-zinc-200 bg-white px-5 py-6 lg:w-65 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xl font-bold tracking-[-0.08em] text-[#111111]">
          ONB
        </span>
      </div>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="mt-8 flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-3 text-left transition hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-green-500"
        aria-label="Open account options"
      >
        {user.image ? (
          <img
            src={user.image}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-800">
            {getInitial(user)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[#111111]">
            {user.name || "Account"}
          </span>
          <span className="block truncate text-xs text-zinc-400">
            {user.email || "No email available"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center rounded-lg border border-green-600 bg-white px-4 py-2.5 text-sm font-semibold text-green-700 transition hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        Compose
      </button>

      <div className="mt-10">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Core
        </p>
        <nav className="mt-3 space-y-1" aria-label="Email views">
          {navigationItems.map(({ tab, label, icon: Icon }) => {
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  isActive
                    ? "bg-green-50 font-semibold text-green-800"
                    : "text-zinc-700 hover:bg-zinc-50"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{label}</span>
                <span className="text-xs text-zinc-400">{counts[tab]}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </aside>
  );
}
