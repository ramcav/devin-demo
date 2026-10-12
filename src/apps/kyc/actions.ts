"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/platform/session";
import { addKycNote, claimKycCase, decideKycProposal, escalateKycCase, proposeKycDecision, type KycDecision } from "./service";

export type FormState = { error?: string; message?: string };

export async function claimKycCaseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const res = await runAction((user) => claimKycCase(user, id));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/kyc/${id}`);
  return { message: "Case claimed" };
}

export async function proposeKycDecisionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const res = await runAction((user) =>
    proposeKycDecision(user, id, { decision: String(formData.get("decision") ?? "") as KycDecision, reason: String(formData.get("reason") ?? "") }),
  );
  if (!res.ok) return { error: res.error };
  revalidatePath(`/kyc/${id}`);
  return { message: `Case is now ${res.value.status.replace("_", " ")}` };
}

export async function escalateKycCaseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const res = await runAction((user) => escalateKycCase(user, id, String(formData.get("note") ?? "")));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/kyc/${id}`);
  return { message: "Case escalated to compliance" };
}

export async function addKycNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const res = await runAction((user) => addKycNote(user, id, String(formData.get("body") ?? "")));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/kyc/${id}`);
  return { message: "Note added" };
}

export async function decideKycProposalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const res = await runAction((user) => decideKycProposal(user, id, formData.get("decision"), String(formData.get("reason") ?? "")));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/kyc/${id}`);
  return { message: `Case is now ${res.value.status.replace("_", " ")}` };
}
