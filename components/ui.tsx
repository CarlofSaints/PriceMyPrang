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

/**
 * A dialog in our own chrome, for anything that used to be a browser
 * prompt()/confirm().
 *
 * Those are unstyleable, look like a phishing box, and a password typed into
 * one is offered to the browser's autofill as though it were a login. This is
 * also the only place a dialog can carry an explanation of what the button is
 * about to do.
 *
 * Closes on Escape and on a click outside the panel — a dialog with no visible
 * way out is the complaint in [[dismissable-dropdowns]]. `onClose` is held in a
 * ref so the listeners are bound once and are not torn down and rebuilt on
 * every keystroke in the form inside.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const closeRef = React.useRef(onClose);
  React.useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        // mousedown, not click: releasing the button outside after selecting
        // text inside the panel would otherwise close the dialog.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-start justify-center p-3 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="my-8 w-full max-w-lg rounded-2xl bg-offwhite p-5 shadow-2xl sm:p-6"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
              {description && <div className="mt-1 text-sm text-ink/60">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-ink/40 hover:text-ink"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {children}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-3">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`pmp-card p-5 ${className}`}>{children}</div>;
}
