import { Suspense } from "react";
import { DashboardShell } from "@/components/DashboardShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
