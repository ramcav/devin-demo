"use client";

import { useActionState } from "react";
import { createRefundAction, decideRefundAction, retryPaymentAction, type FormState } from "../actions";

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

export function CreateRefundForm({ chargeId, card, maxLabel }: { chargeId: string; card: string; maxLabel: string }) {
  const [state, action, pending] = useActionState(createRefundAction, {});
  return (
    <form action={action} className="max-w-md space-y-3 rounded border bg-white p-4">
      <input type="hidden" name="chargeId" value={chargeId} />
      <p className="text-sm text-gray-600">
        Refunds always go back to the original payment method <strong>{card}</strong>. Refundable: {maxLabel}.
      </p>
      <label className="block text-sm">
        Amount (USD)
        <input name="amount" inputMode="decimal" required placeholder="750.00" className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <label className="block text-sm">
        Reason
        <textarea name="reason" required minLength={3} rows={3} className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
        Submit refund request
      </button>
    </form>
  );
}

/** `isCreator` only changes the UI; the approvals engine still rejects self-approval server-side. */
export function DecisionForm({ id, isCreator }: { id: string; isCreator: boolean }) {
  const [state, action, pending] = useActionState(decideRefundAction, {});
  const disabled = pending || isCreator;
  return (
    <form action={action} className="max-w-md space-y-3 rounded border bg-white p-4">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        Reason (required to reject)
        <input name="reason" className="mt-1 block w-full rounded border px-2 py-1" />
      </label>
      <Feedback state={state} />
      {isCreator && (
        <p className="text-sm text-gray-600" data-testid="creator-note">
          You raised this refund, so a different approver must approve it.
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" name="decision" value="approve" disabled={disabled} className="rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          Approve
        </button>
        <button type="submit" name="decision" value="reject" disabled={disabled} className="rounded bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          Reject
        </button>
      </div>
    </form>
  );
}

export function RetryPaymentForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(retryPaymentAction, {});
  return (
    <form action={action} className="max-w-md space-y-3">
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
        Retry payment
      </button>
    </form>
  );
}
