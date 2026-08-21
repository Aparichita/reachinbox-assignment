type SpinnerProps = {
  className?: string;
};

export default function Spinner({ className = "" }: SpinnerProps) {
  return (
    <span
      aria-label="Loading"
      role="status"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-green-600 ${className}`}
    />
  );
}
