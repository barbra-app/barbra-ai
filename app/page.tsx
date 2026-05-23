"use client";

import { useState } from "react";
import { Sidebar, type SidebarSelection } from "@/components/layout/sidebar";
import { ChatPanel } from "@/components/chat/chat-panel";

export default function Home() {
  const [selection, setSelection] = useState<SidebarSelection>({
    account: null,
    campaignIds: [],
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar selection={selection} onSelectionChange={setSelection} />
      <ChatPanel selection={selection} />
    </div>
  );
}
