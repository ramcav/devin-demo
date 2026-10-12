"use client";

import { useActionState, useRef } from "react";
import {
  addKycNoteAction,
  claimKycCaseAction,
  decideKycProposalAction,
  escalateKycCaseAction,
  proposeKycDecisionAction,
  type FormState,
} from "../actions";

function Feedback({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="form-error">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        {state.message}
      </p>
    );
  return null;
}

export function ClaimForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(claimKycCaseAction, {});
  return (
    <form action={action} className="max-w-md space-y-3">
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        data-testid="kyc-claim"
        className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        Claim this case
      </button>
    </form>
  );
}

export function ProposeForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(proposeKycDecisionAction, {});
  return (
    <form action={action} className="max-w-md space-y-3 rounded border bg-white p-4">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        Decision
        <select name="decision" required data-testid="kyc-propose-decision" className="mt-1 block w-full rounded border bg-white px-2 py-1">
          <option value="approve">Approve</option>
          <option value="reject">Reject</option>
        </select>
      </label>
      <label className="block text-sm">
        Reason
        <textarea name="reason" required minLength={3} rows={3} data-testid="kyc-propose-reason" className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <p className="text-xs text-gray-600">Rejections and high-risk approvals need a compliance approval.</p>
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        data-testid="kyc-propose-submit"
        className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        Propose decision
      </button>
    </form>
  );
}

export function EscalateForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(escalateKycCaseAction, {});
  return (
    <form action={action} className="max-w-md space-y-3 rounded border bg-white p-4">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        Escalation note (required)
        <textarea name="note" required minLength={3} rows={3} data-testid="kyc-escalate-note" className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        data-testid="kyc-escalate-submit"
        className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-800 disabled:opacity-50"
      >
        Escalate to compliance
      </button>
    </form>
  );
}

export function AddNoteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(addKycNoteAction, {});
  return (
    <form action={action} className="max-w-md space-y-3 rounded border bg-white p-4">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        Note
        <textarea name="body" required minLength={1} rows={3} data-testid="kyc-note-body" className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        data-testid="kyc-note-submit"
        className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        Add note
      </button>
    </form>
  );
}

/** `isProposer` only changes the UI; the approvals engine still rejects self-approval server-side. */
export function DecideProposalForm({ id, isProposer }: { id: string; isProposer: boolean }) {
  const [state, action, pending] = useActionState(decideKycProposalAction, {});
  const decision = useRef<HTMLInputElement>(null);
  const disabled = pending || isProposer;
  return (
    <form action={action} className="max-w-md space-y-3 rounded border bg-white p-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" ref={decision} />
      <label className="block text-sm">
        Reason (required to reject)
        <input name="reason" data-testid="kyc-decision-reason" className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <Feedback state={state} />
      {isProposer && (
        <p className="text-sm text-gray-600" data-testid="proposer-note">
          You proposed this decision — another compliance officer must decide it.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          onClick={() => (decision.current!.value = "approve")}
          disabled={disabled}
          data-testid="kyc-decision-approve"
          className="rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="submit"
          onClick={() => (decision.current!.value = "reject")}
          disabled={disabled}
          data-testid="kyc-decision-reject"
          className="rounded bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </form>
  );
}
