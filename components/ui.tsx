import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "coral" | "outline" | "ghost";
  size?: "md" | "lg";
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/60 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { md: "px-5 py-2.5 text-sm", lg: "px-7 py-4 text-base" };
  const variants = {
    primary: "bg-teal text-white hover:bg-[#026e76]",
    coral: "bg-coral text-white hover:bg-[#d94a33]",
    outline: "border border-teal/30 text-ink hover:bg-teal/5 bg-white",
    ghost: "text-ink hover:bg-ink/5",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-ink mb-1.5">
        {label} {required && <span className="text-coral">*</span>}
      </span>
      {hint && <span className="block text-xs text-ink/60 mb-1.5">{hint}</span>}
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-teal/20 bg-white px-4 py-3 text-ink placeholder:text-ink/40 focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`pmp-card p-5 ${className}`}>{children}</div>;
}
