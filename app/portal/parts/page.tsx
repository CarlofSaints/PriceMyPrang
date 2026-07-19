import { redirect } from "next/navigation";

// Parts became the Suppliers list in the Control Centre.
export default function LegacyPartsRedirect() {
  redirect("/portal/admin/suppliers");
}
