import Link from "next/link";
import { redeemEmailVerification } from "@/lib/store";
import { Logo } from "@/components/Logo";

// Redeemed on the SERVER as the page loads: the link is usually opened in
// whatever browser the email was read in, which may not be the one that signed
// up, so there is no session to lean on. The token is the credential.
export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await redeemEmailVerification(token);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-offwhite p-5">
      <div className="w-full max-w-sm space-y-4 text-center">
        <Logo variant="primary-light" className="mx-auto h-28 w-auto" priority />

        {result ? (
          <>
            <h1 className="mt-4 font-display text-2xl font-bold text-ink">Email confirmed</h1>
            <p className="text-sm text-ink/60">
              Thanks — {result.email} is confirmed. You can sign in now.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-full bg-teal px-6 py-3 text-sm font-semibold text-white"
            >
              Go to the portal
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-4 font-display text-2xl font-bold text-ink">
              That link didn&apos;t work
            </h1>
            <p className="text-sm text-ink/60">
              It has expired or has already been used. Sign in and we&apos;ll send you a fresh
              one.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-full bg-teal px-6 py-3 text-sm font-semibold text-white"
            >
              Sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
