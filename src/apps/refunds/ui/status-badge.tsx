import type { RefundStatus } from "../schema";

const styles: Record<RefundStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  rejected: "bg-gray-200 text-gray-700",
  payment_failed: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: RefundStatus }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles[status]}`} data-testid="refund-status">
      {status.replace("_", " ")}
    </span>
  );
}
