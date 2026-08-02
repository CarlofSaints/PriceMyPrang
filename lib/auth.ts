import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { findUserById, getRoles } from "./store";
import { permissionsForRole } from "./permissions";
import type { AuthUser } from "./types";

const COOKIE_NAME = "pmp_session";
const DAY = 60 * 60 * 24;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// No 0/O/1/l/I — these get read off a screen and typed by hand.
const TEMP_PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A temporary password for an account the system creates on someone's behalf
 * (panel-beater sign-up). Always paired with mustChangePassword, so it only has
 * to survive one login.
 */
export function generateTempPassword(length = 14): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(
    values,
    (v) => TEMP_PASSWORD_ALPHABET[v % TEMP_PASSWORD_ALPHABET.length]
  ).join("");
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * DAY,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Guard for API routes. Returns either the user, or the response the route
 * should return as-is.
 *
 * As well as the signed-out check, this refuses anyone still holding an
 * admin-issued temporary password. The portal layout swaps the whole UI for the
 * change-password screen, but that only governs what's on screen — a tab left
 * open from before the reset, or a direct call, would otherwise still work.
 * Deliberately NOT used by /api/auth/change-password, which has to stay
 * reachable for them to get out of it.
 */
export async function requireUser(): Promise<
  { user: AuthUser; response?: undefined } | { user?: undefined; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user)
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  if (user.mustChangePassword)
    return {
      response: NextResponse.json(
        {
          error: "Choose a new password before continuing.",
          code: "password_change_required",
        },
        { status: 403 }
      ),
    };

  // Same shape as the password gate. Accounts that predate verification were
  // backfilled in the migration, so this only ever holds up a new sign-up.
  if (!user.emailVerifiedAt)
    return {
      response: NextResponse.json(
        {
          error: "Confirm your email address before continuing.",
          code: "email_verification_required",
        },
        { status: 403 }
      ),
    };

  return { user };
}

/** Returns the logged-in user with their role's permissions resolved, or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = payload.sub as string;
    if (!userId) return null;
    const user = await findUserById(userId);
    if (!user || !user.active) return null;
    const roles = await getRoles();
    const role = roles.find((r) => r.id === user.role);
    return {
      ...user,
      permissions: permissionsForRole(user.role, roles),
      roleName: role?.name ?? user.role,
    };
  } catch {
    return null;
  }
}

/**
 * A six-digit second-factor code.
 *
 * crypto.getRandomValues, not Math.random — this is a credential, however
 * short-lived. The modulo bias across 2^32 into 10^6 is far below anything
 * that matters for a code that expires in ten minutes and dies after five
 * wrong guesses.
 */
export function generateOtp(): string {
  const v = new Uint32Array(1);
  crypto.getRandomValues(v);
  return String(v[0] % 1_000_000).padStart(6, "0");
}
