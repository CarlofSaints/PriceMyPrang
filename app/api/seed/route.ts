import { NextResponse } from "next/server";
import { getUsers, saveUsers } from "@/lib/store";
import { hashPassword } from "@/lib/auth";
import type { User } from "@/lib/types";

// One-time bootstrap: create the first admin user.
//   POST /api/seed  { secret, name, email, password }
// `secret` must match SEED_SECRET. Refuses to run if an admin already exists,
// unless force=true is passed.
export async function POST(request: Request) {
  const { secret, name, email, password, force } = (await request.json()) as {
    secret?: string;
    name?: string;
    email?: string;
    password?: string;
    force?: boolean;
  };

  if (!process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!name || !email || !password) {
    return NextResponse.json({ error: "name, email, password required" }, { status: 400 });
  }

  const users = await getUsers();
  if (users.some((u) => u.role === "admin") && !force) {
    return NextResponse.json({ error: "Admin already exists" }, { status: 409 });
  }
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const user: User = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "admin",
    active: true,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await saveUsers(users);

  return NextResponse.json({ ok: true, id: user.id, email: user.email });
}
