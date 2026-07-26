import { readJson, writeJson, updateJson, createJsonIfAbsent, PATHS } from "./blob";
import { nextReference } from "./reference";
import { DEFAULT_ROLES } from "./permissions";
import { DEFAULT_RATE_TYPES } from "./rateTypes";
import type {
  User,
  Role,
  RateType,
  InsuranceCompany,
  PanelBeater,
  Supplier,
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

// ---- Insurance companies ----
export async function getInsurers(): Promise<InsuranceCompany[]> {
  return (await readJson<InsuranceCompany[]>(PATHS.insurers)) ?? [];
}
export async function saveInsurers(insurers: InsuranceCompany[]): Promise<void> {
  await writeJson(PATHS.insurers, insurers);
}
export async function getInsurer(id: string): Promise<InsuranceCompany | null> {
  return (await getInsurers()).find((i) => i.id === id) ?? null;
}
export async function upsertInsurer(insurer: InsuranceCompany): Promise<void> {
  const list = await getInsurers();
  const i = list.findIndex((x) => x.id === insurer.id);
  if (i >= 0) list[i] = insurer;
  else list.push(insurer);
  await saveInsurers(list);
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

// ---- Suppliers ----
export async function getSuppliers(): Promise<Supplier[]> {
  return (await readJson<Supplier[]>(PATHS.suppliers)) ?? [];
}
export async function saveSuppliers(suppliers: Supplier[]): Promise<void> {
  await writeJson(PATHS.suppliers, suppliers);
}
export async function getSupplier(id: string): Promise<Supplier | null> {
  return (await getSuppliers()).find((s) => s.id === id) ?? null;
}
export async function upsertSupplier(supplier: Supplier): Promise<void> {
  const list = await getSuppliers();
  const i = list.findIndex((s) => s.id === supplier.id);
  if (i >= 0) list[i] = supplier;
  else list.push(supplier);
  await saveSuppliers(list);
}

// ---- Requests ----
export async function getRequestIndex(): Promise<string[]> {
  return (await readJson<string[]>(PATHS.requestIndex)) ?? [];
}
export async function getRequest(ref: string): Promise<QuoteRequest | null> {
  return await readJson<QuoteRequest>(PATHS.request(ref));
}

/**
 * Add a reference to the index, newest first. Uses a compare-and-swap write:
 * a plain read-modify-write drops references when two submissions land at the
 * same moment, leaving the request blob stored but invisible to the portal.
 */
async function addToRequestIndex(reference: string): Promise<void> {
  await updateJson<string[]>(PATHS.requestIndex, (current) => {
    const index = current ?? [];
    return index.includes(reference) ? index : [reference, ...index];
  });
}

/**
 * Create a brand-new request, allocating a reference that is not already taken.
 * Never overwrites an existing request — on a reference clash we take the next
 * sequence number instead.
 */
export async function createRequest(
  draft: Omit<QuoteRequest, "reference">
): Promise<QuoteRequest> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = await nextReference(draft.lastName);
    const req: QuoteRequest = { ...draft, reference };

    if (await createJsonIfAbsent(PATHS.request(reference), req)) {
      await addToRequestIndex(reference);
      return req;
    }
  }
  throw new Error("Could not allocate a unique quote reference");
}

/** Update an existing request. */
export async function saveRequest(req: QuoteRequest): Promise<void> {
  await writeJson(PATHS.request(req.reference), req);
  await addToRequestIndex(req.reference);
}
export async function getAllRequests(): Promise<QuoteRequest[]> {
  const index = await getRequestIndex();
  const requests = await Promise.all(index.map((ref) => getRequest(ref)));
  return requests.filter((r): r is QuoteRequest => r !== null);
}
