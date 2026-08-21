import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant =
  | "primary"
  | "outline"
  | "ghost"
  | "link"
  | "pill"
  | "google";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const baseClasses =
  "inline-flex items-center justify-center font-semibold transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 active:scale-[0.98]";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "rounded-lg bg-green-600 px-4 py-2.5 text-sm text-white hover:bg-green-700",
  outline:
    "rounded-lg border border-green-600 bg-white px-4 py-2.5 text-sm text-green-700 hover:bg-green-50",
  ghost:
    "rounded-lg bg-transparent px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  link: "gap-1.5 rounded-none bg-transparent px-0 py-0 text-sm text-green-700 hover:text-green-800 hover:underline active:scale-100",
  pill: "rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-green-600 hover:bg-green-50 hover:text-green-800",
  google:
    "w-full gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-[#111111] shadow-sm hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md active:translate-y-0 active:shadow-sm",
};

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
