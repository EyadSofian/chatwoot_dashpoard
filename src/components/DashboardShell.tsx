"use client";

import { useState } from "react";
import { Sidebar, SIDEBAR_WIDTH } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { FilterBar } from "@/components/FilterBar";
import { SyncWarning } from "@/components/SyncWarning";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    // The rail is `fixed`, so it is out of flow entirely. The content column
    // reserves its width with padding-inline-end instead of sitting beside it —
    // which is what keeps the sidebar from scrolling away with the page, and
    // keeps the sticky topbar/filters inside the content column rather than
    // stretching across the sidebar. `overflow-x-hidden` guarantees the drawer
    // (translated off-screen on mobile) can never create a horizontal scrollbar.
    <div className="min-h-dvh overflow-x-hidden bg-background">
      <Sidebar open={open} onClose={() => setOpen(false)} />

      {/* RTL: padding-inline-START is the RIGHT side — the side the rail is on. */}
      <div
        className="flex min-h-dvh min-w-0 flex-col lg:[padding-inline-start:var(--sidebar-w)]"
        style={{ ["--sidebar-w" as string]: `${SIDEBAR_WIDTH}px` }}
      >
        <Topbar onMenu={() => setOpen(true)} />
        <FilterBar />

        <main className="min-w-0 flex-1 p-4 pb-10 sm:p-5">
          <div className="mx-auto min-w-0 max-w-[1600px] animate-fade-up">
            <SyncWarning />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
