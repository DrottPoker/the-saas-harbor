import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-nav";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin | The SaaS Harbor" },
};

// Every admin page checks admin rights as well: a layout does not guard the segments below it.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <Shell>
      <div className="mb-8 flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold">Admin</p>
        <AdminNav />
      </div>
      {children}
    </Shell>
  );
}
