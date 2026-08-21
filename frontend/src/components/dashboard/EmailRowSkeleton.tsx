import Skeleton from "@/components/ui/Skeleton";

export default function EmailRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-zinc-200 bg-white px-4 py-4">
      <div className="flex-1 space-y-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-7 w-24" />
    </div>
  );
}
