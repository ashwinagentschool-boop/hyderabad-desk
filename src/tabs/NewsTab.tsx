import { useEffect, useState } from 'react';
import type { NewsItem } from '../adapters/types';
import { Icon } from '../components/Icon';
import { SourceStatusLine } from '../components/StatusStrip';
import { useToast } from '../components/Toast';
import {
  Button,
  Card,
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

export function NewsTab() {
  const news = useStore((s) => s.news);
  const loadNews = useStore((s) => s.loadNews);
  const fetchNews = useStore((s) => s.fetchNews);

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  const loading = news.status === 'loading';

  return (
    <TabShell>
      <TabHeader
        title="News"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Last 24 hours</span>
            <Dot />
            <SourceStatusLine source="news" />
          </span>
        }
        actions={
          <Button size="sm" onClick={() => void fetchNews()} busy={loading}>
            <Icon name="refresh" />
            Fetch
          </Button>
        }
      />

      {news.status === 'error' ? (
        <ErrorCard
          message={news.error ?? 'Unknown error'}
          onRetry={() => void loadNews(true)}
        />
      ) : loading && news.items.length === 0 ? (
        <LoadingRows rows={5} />
      ) : news.items.length === 0 ? (
        <EmptyState
          title="Nothing in the last 24 hours"
          hint="Run a fetch to pull the latest Hyderabad property coverage."
        />
      ) : (
        // A list, not a grid — headlines read better in one column.
        <div className="grid gap-3">
          {news.items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </TabShell>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const createPadEntry = useStore((s) => s.createPadEntry);
  const padItems = useStore((s) => s.pad.items);
  const loadPad = useStore((s) => s.loadPad);
  const showToast = useToast((s) => s.show);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadPad();
  }, [loadPad]);

  const alreadySaved = padItems.some((e) => e.content === item.url);

  const saveToPad = async () => {
    setSaving(true);
    try {
      await createPadEntry({
        content: item.url,
        isLink: true,
        note: item.headline,
        tag: 'news',
      });
      showToast('Saved to Pad');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="fade-in flex flex-col gap-2">
      <h2 className="text-[14.5px] leading-[1.45] font-medium">{item.headline}</h2>

      <p className="text-muted text-[13px]">
        {item.source}
        <Dot spaced />
        {relativeTime(item.publishedAt)}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <ExternalLink href={item.url} className="text-muted">
          Read
          <Icon name="external" size={12} />
        </ExternalLink>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => void saveToPad()}
          busy={saving}
          disabled={alreadySaved}
        >
          {alreadySaved ? (
            <>
              <Icon name="check" />
              In Pad
            </>
          ) : (
            <>
              <Icon name="note" />
              Save to pad
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
