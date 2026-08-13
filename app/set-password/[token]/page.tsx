import Link from "next/link";
import { peekPasswordSetToken } from "@/lib/store";
import { Logo } from "@/components/Logo";
import SetPasswordForm from "@/components/SetPasswordForm";

export const metadata = { title: "Choose your password · Price my Prang" };

/**
 * The landing page for a "choose your own password" link.
 *
 * The token is PEEKED here, not spent — the page has to greet the person and
 * show them a form before anything is decided, and redeeming on load would
 * burn the link for anyone who opened the email, got distracted and came back.
 * It is spent by the POST behind the form.
 */
export default async function SetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await peekPasswordSetToken(token);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-offwhite p-5">
      <div className="w-full max-w-sm space-y-4">
        <Logo variant="primary-light" className="mx-auto h-28 w-auto" priority />

        {view ? (
          <SetPasswordForm token={token} email={view.email} purpose={view.purpose} />
        ) : (
          <div className="space-y-4 text-center">
            <h1 className="font-display text-2xl font-bold text-ink">
              That link didn&apos;t work
            </h1>
            {/* Says what to DO, because there is no self-service way back: the
                account may have no password at all, so "sign in and try again"
                would be advice they cannot follow. */}
            <p className="text-sm text-ink/60">
              It has expired, has already been used, or a newer one was sent
              afterwards. Ask your Price my Prang contact to send you a fresh
              link — or reply to the email it came from.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-full bg-teal px-6 py-3 text-sm font-semibold text-white"
            >
              Go to the portal
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
