import { useEffect } from 'react';
import { Collapsible } from '../components/Collapsible';
import { Icon } from '../components/Icon';
import { ListEditor } from '../components/ListEditor';
import { SourceStatusLine } from '../components/StatusStrip';
import {
  Button,
  Card,
  CardGrid,
  Dot,
  EmptyState,
  ErrorCard,
  ExternalLink,
  LoadingRows,
  Notice,
  TabHeader,
  TabShell,
} from '../components/ui';
import { relativeTime } from '../lib/format';
import { useStore } from '../store';

/** Force a single leading @ so the handle list stays consistent. */
const asHandle = (raw: string) => {
  const trimmed = raw.trim().replace(/^@+/, '');
  return trimmed === '' ? '' : `@${trimmed}`;
};

export function TwitterTab() {
  const tweets = useStore((s) => s.tweets);
  const loadTweets = useStore((s) => s.loadTweets);
  const fetchTweets = useStore((s) => s.fetchTweets);
  const settings = useStore((s) => s.settings);
  const loadSettings = useStore((s) => s.loadSettings);
  const updateSettings = useStore((s) => s.updateSettings);

  useEffect(() => {
    void loadSettings();
    void loadTweets();
  }, [loadSettings, loadTweets]);

  const loading = tweets.status === 'loading';

  return (
    <TabShell>
      <TabHeader
        title="Twitter"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {settings?.twitterHandles.length ?? 0} handles watched
            </span>
            <Dot />
            <SourceStatusLine source="twitter" />
          </span>
        }
        actions={
          <Button size="sm" onClick={() => void fetchTweets()} busy={loading}>
            <Icon name="refresh" />
            Fetch
          </Button>
        }
      />

      <Notice>Best-effort results — not a live timeline.</Notice>

      <Collapsible title="Handles watched">
        {settings === null ? (
          <p className="text-muted text-[13px]">Loading settings…</p>
        ) : (
          <ListEditor
            label="X / Twitter handles"
            values={settings.twitterHandles}
            placeholder="@RERA_Telangana"
            normalize={asHandle}
            onChange={(twitterHandles) => void updateSettings({ twitterHandles })}
          />
        )}
      </Collapsible>

      {tweets.status === 'error' ? (
        <ErrorCard
          message={tweets.error ?? 'Unknown error'}
          onRetry={() => void loadTweets(true)}
        />
      ) : loading && tweets.items.length === 0 ? (
        <LoadingRows rows={3} />
      ) : tweets.items.length === 0 ? (
        <EmptyState
          title="No posts pulled yet"
          hint="Add a handle above, then run a fetch. Results depend on what the scraper can reach."
          action={
            <Button size="sm" onClick={() => void fetchTweets()} busy={loading}>
              <Icon name="refresh" />
              Fetch now
            </Button>
          }
        />
      ) : (
        <CardGrid>
          {tweets.items.map((tweet) => (
            <Card key={tweet.id} className="fade-in flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[14px] font-medium">{tweet.handle}</span>
                <span className="text-faint shrink-0 text-[12px]">
                  {relativeTime(tweet.postedAt)}
                </span>
              </div>
              <p className="text-[14px] leading-[1.55]">{tweet.text}</p>
              <ExternalLink href={tweet.url} className="text-muted">
                Open post
                <Icon name="external" size={12} />
              </ExternalLink>
            </Card>
          ))}
        </CardGrid>
      )}
    </TabShell>
  );
}
