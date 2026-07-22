import { useEffect, useState } from 'react';
import type { RedditPost } from '../adapters/types';
import { Chip } from '../components/Badge';
import { Collapsible } from '../components/Collapsible';
import { Icon } from '../components/Icon';
import { ListEditor } from '../components/ListEditor';
import { SourceStatusLine } from '../components/StatusStrip';
import { useToast } from '../components/Toast';
import {
  Button,
  Card,
  CardGrid,
  Dot,
  EmptyState,
  ErrorCard,
  ExternalLink,
  LoadingRows,
  TabHeader,
  TabShell,
} from '../components/ui';
import { relativeTime } from '../lib/format';
import { useStore } from '../store';

export function RedditTab() {
  const posts = useStore((s) => s.reddit);
  const loadReddit = useStore((s) => s.loadReddit);
  const refreshReddit = useStore((s) => s.refreshReddit);

  useEffect(() => {
    void loadReddit();
  }, [loadReddit]);

  const loading = posts.status === 'loading';

  return (
    <TabShell>
      <TabHeader
        title="Reddit"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {posts.items.length} pending {posts.items.length === 1 ? 'post' : 'posts'}
            </span>
            <Dot />
            <SourceStatusLine source="reddit" />
          </span>
        }
        actions={
          <Button size="sm" onClick={() => void refreshReddit()} busy={loading}>
            <Icon name="refresh" />
            Refresh
          </Button>
        }
      />

      <RedditSettings />

      {posts.status === 'error' ? (
        <ErrorCard
          message={posts.error ?? 'Unknown error'}
          onRetry={() => void loadReddit(true)}
        />
      ) : loading && posts.items.length === 0 ? (
        <LoadingRows rows={3} />
      ) : posts.items.length === 0 ? (
        <EmptyState
          title="Triage queue is clear"
          hint="New buying-intent posts from your watched subreddits land here after the next sync."
          action={
            <Button size="sm" onClick={() => void refreshReddit()} busy={loading}>
              <Icon name="refresh" />
              Refresh now
            </Button>
          }
        />
      ) : (
        <CardGrid>
          {posts.items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </CardGrid>
      )}
    </TabShell>
  );
}

/* ------------------------------------------------------------------ */

function PostCard({ post }: { post: RedditPost }) {
  const saveRedditPostAsLead = useStore((s) => s.saveRedditPostAsLead);
  const triage = useStore((s) => s.triageRedditPost);
  const showToast = useToast((s) => s.show);
  const [busy, setBusy] = useState<'save' | 'ignore' | null>(null);

  const save = async () => {
    setBusy('save');
    try {
      await saveRedditPostAsLead(post);
      showToast('Saved to Manual pipeline');
    } finally {
      setBusy(null);
    }
  };

  const ignore = async () => {
    setBusy('ignore');
    try {
      await triage(post.id, 'ignored');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="rise flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[14px] font-medium">{post.username}</span>
        <span className="text-faint shrink-0 text-[12px]">
          {relativeTime(post.postedAt)}
        </span>
      </div>

      <p className="text-[14px] leading-[1.55]">{post.snippet}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{post.subreddit}</Chip>
        {post.matchedKeywords.map((k) => (
          <Chip key={k}>{k}</Chip>
        ))}
      </div>

      <div className="hairline-t mt-0.5 flex flex-wrap items-center gap-2 pt-2.5">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void save()}
          busy={busy === 'save'}
        >
          <Icon name="plus" />
          Save lead
        </Button>
        <Button size="sm" onClick={() => void ignore()} busy={busy === 'ignore'}>
          Ignore
        </Button>
        <ExternalLink href={post.permalink} className="text-muted ml-auto">
          Open on Reddit
          <Icon name="external" size={12} />
        </ExternalLink>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function RedditSettings() {
  const settings = useStore((s) => s.settings);
  const loadSettings = useStore((s) => s.loadSettings);
  const updateSettings = useStore((s) => s.updateSettings);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <Collapsible title="Subreddits & keywords">
      {settings === null ? (
        <p className="text-muted text-[13px]">Loading settings…</p>
      ) : (
        <div className="grid gap-4">
          <ListEditor
            label="Subreddits watched"
            values={settings.subreddits}
            placeholder="hyderabad"
            normalize={(v) => v.trim().replace(/^\/?r\//i, '')}
            onChange={(subreddits) => void updateSettings({ subreddits })}
          />
          <ListEditor
            label="Match keywords"
            values={settings.keywords}
            placeholder="3bhk"
            normalize={(v) => v.trim().toLowerCase()}
            onChange={(keywords) => void updateSettings({ keywords })}
          />
          <p className="text-faint text-[12px]">
            The worker on the Pi reads this list on its next run.
          </p>
        </div>
      )}
    </Collapsible>
  );
}
