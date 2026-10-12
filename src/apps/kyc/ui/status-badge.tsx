import type { KycCaseStatus } from "../schema";

const styles: Record<KycCaseStatus, string> = {
  new: "bg-gray-100 text-gray-700",
  in_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-gray-200 text-gray-700",
  escalated: "bg-red-100 text-red-800",
};

export function StatusBadge({ status, testId }: { status: KycCaseStatus; testId?: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles[status]}`} data-testid={testId}>
      {status.replace("_", " ")}
    </span>
  );
}
