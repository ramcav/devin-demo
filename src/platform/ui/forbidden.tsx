export function Forbidden({ message = "You don't have access to this page." }: { message?: string }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
      <p className="font-medium">403 · Forbidden</p>
      <p className="text-sm">{message}</p>
    </div>
  );
}
