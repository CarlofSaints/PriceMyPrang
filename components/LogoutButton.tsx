"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="whitespace-nowrap text-sm font-semibold text-white/70 hover:text-white"
    >
      Sign out
    </button>
  );
}
