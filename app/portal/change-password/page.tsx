import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import TwoFactorToggle from "@/components/TwoFactorToggle";

// Everything about how this account is secured, in one place. The top-bar link
// still reads "Change password", because that is what people arrive here to do.
export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Your sign-in</h1>
        <p className="text-sm text-ink/60">Signed in as {user.email}</p>
      </div>

      <div className="pmp-card">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Change password</h2>
        <ChangePasswordForm />
      </div>

      <div className="pmp-card">
        <TwoFactorToggle initialEnabled={!!user.twoFactorEnabled} />
      </div>
    </div>
  );
}
