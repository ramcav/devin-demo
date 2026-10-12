"use server";

import { redirect } from "next/navigation";
import { authFor, nextCookieJar } from "@/platform/auth";

export async function signInAs(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  await authFor(await nextCookieJar()).signIn(userId);
  redirect("/");
}

export async function signOut() {
  await authFor(await nextCookieJar()).signOut();
  redirect("/login");
}
