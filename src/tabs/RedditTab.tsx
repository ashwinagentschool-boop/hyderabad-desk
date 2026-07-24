import { useEffect, useMemo, useState } from 'react';
import type { LeadPotential, RedditCategory, RedditPost } from '../adapters/types';
import { Chip } from '../components/Badge';
import { Collapsible } from '../components/Collapsible';
import { Icon } from '../components/Icon';
import { LeadModal } from '../components/LeadModal';
import { ListEditor } from '../components/ListEditor';
import { SourceStatusLine } from '../components/StatusStrip';
import { useToast } from '../components/Toast';
import {
  Button,
  Card,
  CardGrid,
  ChipRow,
  Dot,
  EmptyState,
  ErrorCard,
  ExternalLink,
  FilterChip,
  LoadingRows,
  TabHeader,
  TabShell,
} from '../components/ui';
import { relativeTime } from '../lib/format';
import type { LeadFormValues } from '../lib/leads';
import {
  CATEGORY_FILTERS,
  CATEGORY_LABEL,
  POTENTIAL_CLASS,
  POTENTIAL_FILTERS,
  POTENTIAL_LABEL,
  propertyLabel,
  requirementFrom,
} from '../lib/reddit';
import { useStore } from '../store';

type CategoryFilter = 'all' | RedditCategory;
type PotentialFilter = 'all' | LeadPotential;

/**
 * The worker runs every two hours, so a live queue is never more than one
 * poll behind. Chosen over Supabase realtime: one cheap select a minute is
 * less machinery than a websocket plus a publication to keep in sync, and
 * a dropped socket has no silent-failure mode to debug.
 */
const POLL_MS = 60_000;

export function RedditTab() {
  const posts = useStore((s) => s.reddit);
  const loadReddit = useStore((s) => s.loadReddit);
  const refreshReddit = useStore((s) => s.refreshReddit);
  const pollReddit = useStore((s) => s.pollReddit);

  const [category, setCategory] = useState<CategoryFilter>('all');
  const [potential, setPotential] = useState<PotentialFilter>('all');

  useEffect(() => {
    void loadReddit();
  }, [loadReddit]);

  useEffect(() => {
    // Only poll while the tab is actually on screen, and take a reading
    // immediately on return so a phone unlocked after lunch is current.
    const tick = () => {
      if (document.visibilityState === 'visible') void pollReddit();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [pollReddit]);

  const visible = useMemo(
    () =>
      posts.items.filter((post) => {
        if (category !== 'all' && post.category !== category) return false;
        if (potential !== 'all' && post.leadPotential !== potential) return false;
        return true;
      }),
    [posts.items, category, potential],
  );

  const loading = posts.status === 'loading';
  const filtered = visible.length !== posts.items.length;

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

      <div className="grid gap-2">
        <ChipRow>
          <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
            All kinds
          </FilterChip>
          {CATEGORY_FILTERS.map((value) => (
            <FilterChip
              key={value}
              active={category === value}
              onClick={() => setCategory(value)}
            >
              {CATEGORY_LABEL[value]}
            </FilterChip>
          ))}
        </ChipRow>

        <ChipRow>
          <FilterChip active={potential === 'all'} onClick={() => setPotential('all')}>
            Any potential
          </FilterChip>
          {POTENTIAL_FILTERS.map((value) => (
            <FilterChip
              key={value}
              active={potential === value}
              onClick={() => setPotential(value)}
            >
              {POTENTIAL_LABEL[value]}
            </FilterChip>
          ))}
        </ChipRow>
      </div>

      <RedditSettings />

      {posts.status === 'error' ? (
        <ErrorCard
          message={posts.error ?? 'Unknown error'}
          onRetry={() => void loadReddit(true)}
        />
      ) : loading && posts.items.length === 0 ? (
        <LoadingRows rows={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filtered ? 'Nothing matches those filters' : 'Triage queue is clear'}
          hint={
            filtered
              ? 'Clear a filter to see the rest of the queue.'
              : 'The worker checks your subreddits every two hours. New posts land here already classified.'
          }
          action={
            filtered ? (
              <Button
                size="sm"
                onClick={() => {
                  setCategory('all');
                  setPotential('all');
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={() => void refreshReddit()} busy={loading}>
                <Icon name="refresh" />
                Refresh now
              </Button>
            )
          }
        />
      ) : (
        <CardGrid>
          {visible.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </CardGrid>
      )}
    </TabShell>
  );
}

/* ------------------------------------------------------------------ */

function PotentialBadge({ potential }: { potential: LeadPotential }) {
  // 'none' is the majority of a busy feed. A badge saying "not a lead" on
  // half the cards is noise, so it renders nothing at all.
  if (potential === 'none') return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[3px] text-[11px] leading-[15px] font-medium whitespace-nowrap ${POTENTIAL_CLASS[potential]}`}
    >
      {POTENTIAL_LABEL[potential]}
    </span>
  );
}

function PostCard({ post }: { post: RedditPost }) {
  const triage = useStore((s) => s.triageRedditPost);
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [saving, setSaving] = useState(false);

  const ignore = async () => {
    setBusy(true);
    try {
      await triage(post.id, 'ignored');
    } finally {
      setBusy(false);
    }
  };

  const property = propertyLabel(post.propertyType);

  return (
    <Card className="rise flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[14px] font-medium">{post.username}</span>
        <span className="text-faint shrink-0 text-[12px]">
          {relativeTime(post.postedAt)}
        </span>
      </div>

      {/* The classifier's sentence is the card. It is written for exactly
          this: an agent deciding in two seconds whether to act. */}
      <p className="text-[14px] leading-[1.55]">{post.summary}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <PotentialBadge potential={post.leadPotential} />
        <Chip>{CATEGORY_LABEL[post.category]}</Chip>
        <Chip>r/{post.subreddit}</Chip>
      </div>

      {post.areas.length > 0 || post.budget !== undefined || property !== undefined ? (
        <div className="text-muted flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
          {post.areas.length > 0 ? <span>{post.areas.join(', ')}</span> : null}
          {post.budget !== undefined ? (
            <span className="num text-ink font-medium">{post.budget}</span>
          ) : null}
          {property !== undefined ? <span>{property}</span> : null}
        </div>
      ) : null}

      {/* The raw post stays one tap away. The summary can be wrong, and the
          agent needs the author's own words before picking up the phone. */}
      <div>
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          aria-expanded={showOriginal}
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-[12.5px] font-medium transition-colors"
        >
          <Icon
            name="chevron-right"
            size={11}
            className={`transition-transform duration-200 ${showOriginal ? 'rotate-90' : ''}`}
          />
          {showOriginal ? 'Hide original post' : 'Show original post'}
        </button>
        {showOriginal ? (
          <div className="bg-sunken mt-2 grid gap-1.5 rounded-[10px] p-3">
            <p className="text-[13.5px] leading-[1.5] font-medium">{post.title}</p>
            {post.body !== undefined ? (
              <p className="text-muted text-[13px] leading-[1.55] whitespace-pre-line">
                {post.body}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="hairline-t mt-0.5 flex flex-wrap items-center gap-2 pt-2.5">
        <Button variant="primary" size="sm" onClick={() => setSaving(true)}>
          <Icon name="plus" />
          Save lead
        </Button>
        <Button size="sm" onClick={() => void ignore()} busy={busy}>
          Ignore
        </Button>
        <ExternalLink href={post.permalink} className="text-muted ml-auto">
          Open on Reddit
          <Icon name="external" size={12} />
        </ExternalLink>
      </div>

      {saving ? <SaveLeadModal post={post} onClose={() => setSaving(false)} /> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Saving is a review step, not a blind copy. The classifier already found
 * the area, budget and property type, so the form opens filled in and the
 * agent corrects it before it becomes a lead.
 */
function SaveLeadModal({ post, onClose }: { post: RedditPost; onClose: () => void }) {
  const saveRedditPostAsLead = useStore((s) => s.saveRedditPostAsLead);
  const showToast = useToast((s) => s.show);

  const prefill: Partial<LeadFormValues> = {
    name: post.username,
    requirement: requirementFrom(post.summary, post.title),
    budget: post.budget,
    // One area goes in the field; the rest stay visible in the note below.
    area: post.areas[0],
    status: 'new',
    notes:
      post.areas.length > 1
        ? `Also mentioned: ${post.areas.slice(1).join(', ')}.`
        : undefined,
  };

  const submit = async (values: LeadFormValues) => {
    await saveRedditPostAsLead(post, values);
    showToast('Saved to Pipeline');
  };

  return (
    <LeadModal
      lead={null}
      prefill={prefill}
      title="Save as lead"
      submitLabel="Save lead"
      onSubmit={submit}
      onClose={onClose}
      context={
        <div className="bg-sunken grid gap-1.5 rounded-[10px] p-3">
          <p className="eyebrow">From r/{post.subreddit}</p>
          <p className="text-[13.5px] leading-[1.5]">{post.title}</p>
          <ExternalLink href={post.permalink} className="text-muted">
            Open on Reddit
            <Icon name="external" size={12} />
          </ExternalLink>
        </div>
      }
    />
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
    <Collapsible title="Subreddits watched">
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
          {/* The keyword list is gone on purpose: every new post now goes to
              the classifier, which reads intent rather than matching words. */}
          <p className="text-faint text-[12px]">
            The worker on the Pi reads this list on its next run, so a change here
            needs no restart. Every new post is classified, so there is no keyword
            list to maintain.
          </p>
        </div>
      )}
    </Collapsible>
  );
}
