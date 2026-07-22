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
  const activeTab = useStore((s) => s.activeTab);
  const Panel = PANELS[activeTab];

  return (
    <div className="min-h-dvh">
      <header className="bg-bg hairline-b sticky top-0 z-40">
        <div className="mx-auto flex h-12 max-w-[1180px] items-center justify-between gap-3 px-4">
          <span className="text-[15px] font-medium">Hyderabad Desk</span>
          <StatusToggle />
        </div>
        <div className="mx-auto max-w-[1180px]">
          <TabStrip />
        </div>
        <StatusStrip />
      </header>

      <main
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="mx-auto max-w-[1180px] px-4 py-4 pb-10"
      >
        {/* Keyed so switching tabs resets local filter/search state. */}
        <Panel key={activeTab} />
      </main>

      <ToastHost />
    </div>
  );
}
