import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/platform/auth";
import { signOut } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Internal tools",
  description: "Governed internal tools platform (prototype)",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <Link href="/" className="font-semibold">
            Internal tools
          </Link>
          {user && (
            <form action={signOut} className="flex items-center gap-3 text-sm">
              <span data-testid="current-user">
                {user.name} <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{user.role}</span>
              </span>
              <button type="submit" className="text-gray-600 underline">
                Sign out
              </button>
            </form>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
