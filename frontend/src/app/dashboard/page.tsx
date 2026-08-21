import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100">
      <section className="mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome</h1>
        <dl className="mt-8 space-y-5 text-sm">
          <div>
            <dt className="text-zinc-500">Name</dt>
            <dd className="mt-1 text-lg text-white">
              {session.user?.name ?? "Not available"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Email</dt>
            <dd className="mt-1 text-lg text-white">
              {session.user?.email ?? "Not available"}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
