import { readJson, writeJson, PATHS } from "./blob";
import { DEFAULT_ROLES } from "./permissions";
import { DEFAULT_RATE_TYPES } from "./rateTypes";
import type {
  User,
  Role,
  RateType,
  PanelBeater,
  Part,
  QuoteRequest,
} from "./types";

// ---- Users ----
export async function getUsers(): Promise<User[]> {
  return (await readJson<User[]>(PATHS.users)) ?? [];
}
export async function saveUsers(users: User[]): Promise<void> {
  await writeJson(PATHS.users, users);
}
export async function findUserByEmail(email: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}
export async function findUserById(id: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.id === id) ?? null;
}
export async function upsertUser(user: User): Promise<void> {
  const users = await getUsers();
  const i = users.findIndex((u) => u.id === user.id);
  if (i >= 0) users[i] = user;
  else users.push(user);
  await saveUsers(users);
}

// ---- Roles ----
export async function getRoles(): Promise<Role[]> {
  const existing = await readJson<Role[]>(PATHS.roles);
  if (existing && existing.length) return existing;
  await writeJson(PATHS.roles, DEFAULT_ROLES); // seed on first use
  return DEFAULT_ROLES;
}
export async function saveRoles(roles: Role[]): Promise<void> {
  await writeJson(PATHS.roles, roles);
}
export async function getRole(id: string): Promise<Role | null> {
  return (await getRoles()).find((r) => r.id === id) ?? null;
}

// ---- Rate types ----
export async function getRateTypes(): Promise<RateType[]> {
  const existing = await readJson<RateType[]>(PATHS.rateTypes);
  if (existing && existing.length) return existing;
  await writeJson(PATHS.rateTypes, DEFAULT_RATE_TYPES); // seed on first use
  return DEFAULT_RATE_TYPES;
}
export async function saveRateTypes(rateTypes: RateType[]): Promise<void> {
  await writeJson(PATHS.rateTypes, rateTypes);
}

// ---- Panel beaters ----
export async function getPanelBeaters(): Promise<PanelBeater[]> {
  return (await readJson<PanelBeater[]>(PATHS.panelBeaters)) ?? [];
}
export async function savePanelBeaters(list: PanelBeater[]): Promise<void> {
  await writeJson(PATHS.panelBeaters, list);
}
export async function getPanelBeater(id: string): Promise<PanelBeater | null> {
  return (await getPanelBeaters()).find((p) => p.id === id) ?? null;
}
export async function upsertPanelBeater(pb: PanelBeater): Promise<void> {
  const list = await getPanelBeaters();
  const i = list.findIndex((p) => p.id === pb.id);
  if (i >= 0) list[i] = pb;
  else list.push(pb);
  await savePanelBeaters(list);
}

// ---- Parts ----
export async function getParts(): Promise<Part[]> {
  return (await readJson<Part[]>(PATHS.parts)) ?? [];
}
export async function saveParts(parts: Part[]): Promise<void> {
  await writeJson(PATHS.parts, parts);
}

// ---- Requests ----
export async function getRequestIndex(): Promise<string[]> {
  return (await readJson<string[]>(PATHS.requestIndex)) ?? [];
}
export async function getRequest(ref: string): Promise<QuoteRequest | null> {
  return await readJson<QuoteRequest>(PATHS.request(ref));
}
export async function saveRequest(req: QuoteRequest): Promise<void> {
  await writeJson(PATHS.request(req.reference), req);
  const index = await getRequestIndex();
  if (!index.includes(req.reference)) {
    index.unshift(req.reference);
    await writeJson(PATHS.requestIndex, index);
  }
}
export async function getAllRequests(): Promise<QuoteRequest[]> {
  const index = await getRequestIndex();
  const requests = await Promise.all(index.map((ref) => getRequest(ref)));
  return requests.filter((r): r is QuoteRequest => r !== null);
}
