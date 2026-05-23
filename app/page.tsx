"use client";

import { useState } from "react";
import { Sidebar, type SidebarSelection } from "@/components/layout/sidebar";
import { ChatPanel } from "@/components/chat/chat-panel";

export default function Home() {
  const [selection, setSelection] = useState<SidebarSelection>({
    source: null,
    accountIds: [],
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh w-screen overflow-hidden">
      <Sidebar
        selection={selection}
        onSelectionChange={setSelection}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <ChatPanel
        selection={selection}
        onMenuClick={() => setSidebarOpen(true)}
      />
    </div>
  );
}
