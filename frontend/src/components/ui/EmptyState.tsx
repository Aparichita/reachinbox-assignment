import type { ReactNode } from "react";
import Button from "@/components/ui/Button";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
      {icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-green-50 text-green-700">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">{description}</p>
      {action ? (
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
