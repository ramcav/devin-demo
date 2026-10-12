import { mockSignInOptions } from "@/platform/auth";
import { signInAs } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const options = await mockSignInOptions();
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-1 text-2xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-gray-600">Mock identity provider: pick a synthetic user. Production would use Entra ID (OIDC).</p>
      <ul className="divide-y rounded border bg-white">
        {options.map((u) => (
          <li key={u.id}>
            <form action={signInAs} className="flex items-center justify-between px-4 py-2">
              <input type="hidden" name="userId" value={u.id} />
              <span>
                <span className="font-medium">{u.name}</span> <span className="text-xs text-gray-500">{u.email}</span>
              </span>
              <button type="submit" className="rounded border px-2 py-1 text-xs hover:bg-gray-100" aria-label={`Sign in as ${u.name}`}>
                {u.role}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
