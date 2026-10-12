import Link from "next/link";
import { appsFor } from "@/platform/apps";
import { requirePageUser } from "@/platform/session";

export const dynamic = "force-dynamic";

export default async function Launcher() {
  const user = await requirePageUser();
  const apps = appsFor(user);
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Apps</h1>
      {apps.length === 0 ? (
        <p className="text-gray-600">No apps are available for your role.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {apps.map((app) => (
            <li key={app.id}>
              <Link href={app.href} className="block rounded border bg-white p-4 hover:border-gray-400">
                <span className="font-medium">{app.name}</span>
                <span className="block text-sm text-gray-600">{app.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
