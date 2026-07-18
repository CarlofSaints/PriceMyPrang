import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import QuoteBuilder from "@/components/QuoteBuilder";

export default async function QuoteBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Assessors/admins build any quote; panel-beater logins may build their own
  // (the API scopes them to requests assigned to their listing).
  if (!can(user, "build_quotes") && !can(user, "onboard_self")) redirect("/portal");

  const { ref } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Quote builder</h1>
        <p className="text-ink/60">Assemble parts and labour into a branded PDF quote.</p>
      </div>
      <QuoteBuilder initialRef={ref} />
    </div>
  );
}
