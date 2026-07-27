/**
 * Create the first admin user directly against the database.
 *
 *   npm run db:seed-admin -- --name "Carl" --email you@example.com --password "..."
 *
 * Same job as POST /api/seed, but run locally so it doesn't need SEED_SECRET
 * (which is marked Sensitive in Vercel and reads back empty). Refuses to
 * overwrite an existing admin unless --force is passed.
 */
import { getUsers, saveUsers, getRoles } from "../lib/store";
import { hashPassword } from "../lib/auth";
import type { User } from "../lib/types";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("name");
  const email = arg("email");
  const password = arg("password");
  const force = process.argv.includes("--force");

  if (!name || !email || !password) {
    console.error(
      'Usage: npm run db:seed-admin -- --name "Your Name" --email you@example.com --password "secret" [--force]'
    );
    process.exit(1);
  }

  // users.roleId is a foreign key, so the built-in roles have to exist first.
  // getRoles() seeds DEFAULT_ROLES when the table is empty.
  const roles = await getRoles();
  console.log(`Roles present: ${roles.map((r) => r.id).join(", ")}`);

  const users = await getUsers();
  console.log(`Existing users: ${users.length}`);

  if (users.some((u) => u.role === "admin") && !force) {
    console.error("An admin already exists. Re-run with --force to add another.");
    process.exit(1);
  }
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    console.error(`${email} is already in use.`);
    process.exit(1);
  }

  const user: User = {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    role: "admin",
    active: true,
    createdAt: new Date().toISOString(),
  };

  // saveUsers() replaces the whole collection, so pass the existing rows too.
  await saveUsers([...users, user]);

  const check = await getUsers();
  const created = check.find((u) => u.id === user.id);
  if (!created) throw new Error("User was not persisted");
  console.log(`\nAdmin created: ${created.name} <${created.email}> (role=${created.role})`);
  console.log("Sign in at /login and create the rest of the users from /portal/users.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
