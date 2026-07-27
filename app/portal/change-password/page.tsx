import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Change password</h1>
        <p className="text-sm text-ink/60">
          Signed in as {user.email}
        </p>
      </div>
      <div className="pmp-card">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
