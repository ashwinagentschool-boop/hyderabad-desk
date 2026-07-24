import { AccountMenu, AuthGate } from './components/Auth';
import { StatusStrip, StatusToggle } from './components/StatusStrip';
import { TabStrip } from './components/TabStrip';
import { ToastHost } from './components/Toast';
import type { TabId } from './lib/tabs';
import { useStore } from './store';

import { ChatTab } from './tabs/ChatTab';
import { InstaTab } from './tabs/InstaTab';
import { ManualTab } from './tabs/ManualTab';
import { NewsTab } from './tabs/NewsTab';
import { PadTab } from './tabs/PadTab';
import { ProjectsTab } from './tabs/ProjectsTab';
import { RedditTab } from './tabs/RedditTab';
import { TwitterTab } from './tabs/TwitterTab';

const PANELS: Record<TabId, () => React.ReactElement> = {
  reddit: RedditTab,
  manual: ManualTab,
  projects: ProjectsTab,
  twitter: TwitterTab,
  news: NewsTab,
  insta: InstaTab,
  pad: PadTab,
  chat: ChatTab,
};

export default function App() {
  return (
    <AuthGate>
      <Desk />
    </AuthGate>
  );
}

function Desk() {
  const activeTab = useStore((s) => s.activeTab);
  const Panel = PANELS[activeTab];

  return (
    <div className="min-h-dvh">
      {/* Opaque, not frosted. Glass belongs on consumer surfaces; here it
          would put moving content behind small labels read in sunlight. */}
      <header className="bg-bg hairline-b sticky top-0 z-40">
        {/* Two stacked rows on phones. From 960px everything shares one
            row, which keeps the whole header under the 80px nav cap
            instead of eating 11% of the viewport. */}
        <div className="mx-auto max-w-[1180px] min-[960px]:px-4">
          <div className="min-[960px]:flex min-[960px]:h-15 min-[960px]:items-center min-[960px]:gap-6">
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 px-4 min-[960px]:h-auto min-[960px]:px-0">
              <span className="text-[15px] font-semibold tracking-[-0.01em]">
                Hyderabad Desk
              </span>
              <span className="flex items-center gap-1 min-[960px]:hidden">
                <StatusToggle />
                {/* Renders nothing in mock mode. */}
                <AccountMenu />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <TabStrip />
            </div>
            <span className="hidden shrink-0 items-center gap-1 min-[960px]:flex">
              <StatusToggle />
              <AccountMenu />
            </span>
          </div>
        </div>
        <StatusStrip />
      </header>

      <main
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="mx-auto max-w-[1180px] px-4 py-5 pb-14"
      >
        {/* Keyed so switching tabs resets local filter and search state. */}
        <Panel key={activeTab} />
      </main>

      <ToastHost />
    </div>
  );
}
