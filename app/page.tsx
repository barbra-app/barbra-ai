import { redirect } from "next/navigation";

import { getCurrentUser } from "@/services/auth";

export default async function HomePage() {
  const current = await getCurrentUser();
  redirect(current ? "/dashboard" : "/login");
}
