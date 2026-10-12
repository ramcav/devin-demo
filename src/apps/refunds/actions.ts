"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMoneyToCents } from "@/platform/format";
import { runAction } from "@/platform/session";
import { createRefund, decideRefund, retryRefundPayment } from "./service";

export type FormState = { error?: string; message?: string };

export async function createRefundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const amountCents = parseMoneyToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null) return { error: "Enter an amount like 750 or 750.00" };
  const res = await runAction((user) =>
    createRefund(user, { chargeId: String(formData.get("chargeId") ?? ""), amountCents, reason: String(formData.get("reason") ?? "") }),
  );
  if (!res.ok) return { error: res.error };
  revalidatePath("/refunds");
  redirect(`/refunds/${res.value.id}`);
}

export async function decideRefundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const res = await runAction((user) => decideRefund(user, id, formData.get("decision"), String(formData.get("reason") ?? "")));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/refunds/${id}`);
  return { message: `Refund is now ${res.value.status.replace("_", " ")}` };
}

export async function retryPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const res = await runAction((user) => retryRefundPayment(user, id));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/refunds/${id}`);
  return { message: `Refund is now ${res.value.status.replace("_", " ")}` };
}
