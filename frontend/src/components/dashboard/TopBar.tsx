import {
  Filter,
  RefreshCw,
  Search,
} from "lucide-react";
import Input from "@/components/ui/Input";

type TopBarProps = {
  onRefresh: () => void;
  refreshing?: boolean;
};

export default function TopBar({ onRefresh, refreshing = false }: TopBarProps) {
  return (
    <header className="flex items-center gap-3 border-b border-zinc-200 bg-[#f7f7f5] px-6 py-5 lg:px-8">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          type="search"
          placeholder="Search"
          aria-label="Search"
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-4 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-green-500 focus:ring-2 focus:ring-green-100"
        />
      </label>
      <button
        type="button"
        aria-label="Filter"
        title="Filter"
        className="interactive-icon h-10 w-10 shrink-0"
      >
        <Filter className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Refresh"
        title="Refresh"
        onClick={onRefresh}
        disabled={refreshing}
        className="interactive-icon h-10 w-10 shrink-0"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </header>
  );
}
