import { useEffect, useMemo, useState } from 'react';
import type { PadEntry, PadTag } from '../adapters/types';
import { Chip } from '../components/Badge';
import { Icon } from '../components/Icon';
import {
  Button,
  Card,
  CardGrid,
  ChipRow,
  ConfirmButton,
  EmptyState,
  ErrorCard,
  ExternalLink,
  FilterChip,
  LoadingRows,
  SearchField,
  TabHeader,
  TabShell,
  TextField,
} from '../components/ui';
import { looksLikeLink, normalizeUrl, prettyUrl, relativeTime } from '../lib/format';
import { useStore } from '../store';

const TAGS: PadTag[] = ['lead', 'project', 'news', 'idea'];

const TAG_LABEL: Record<PadTag, string> = {
  lead: 'Lead',
  project: 'Project',
  news: 'News',
  idea: 'Idea',
};

export function PadTab() {
  const pad = useStore((s) => s.pad);
  const loadPad = useStore((s) => s.loadPad);

  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<PadTag | 'all'>('all');

  useEffect(() => {
    void loadPad();
  }, [loadPad]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pad.items.filter((entry) => {
      if (tagFilter !== 'all' && entry.tag !== tagFilter) return false;
      if (q === '') return true;
      return `${entry.content} ${entry.note ?? ''}`.toLowerCase().includes(q);
    });
  }, [pad.items, query, tagFilter]);

  return (
    <TabShell>
      <TabHeader
        title="Pad"
        subtitle={`${pad.items.length} ${pad.items.length === 1 ? 'note' : 'notes'}`}
      />

      <PadInput />

      <SearchField value={query} onChange={setQuery} placeholder="Search the pad" />

      <ChipRow>
        <FilterChip active={tagFilter === 'all'} onClick={() => setTagFilter('all')}>
          All
        </FilterChip>
        {TAGS.map((tag) => (
          <FilterChip
            key={tag}
            active={tagFilter === tag}
            onClick={() => setTagFilter(tag)}
          >
            {TAG_LABEL[tag]}
          </FilterChip>
        ))}
      </ChipRow>

      {pad.status === 'error' ? (
        <ErrorCard message={pad.error ?? 'Unknown error'} onRetry={() => void loadPad(true)} />
      ) : pad.status === 'loading' && pad.items.length === 0 ? (
        <LoadingRows rows={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={pad.items.length === 0 ? 'The pad is empty' : 'Nothing matches'}
          hint={
            pad.items.length === 0
              ? 'Drop a link or a quick note above — it stays here across reloads.'
              : 'Clear the filter or change the search.'
          }
        />
      ) : (
        <CardGrid>
          {visible.map((entry) => (
            <PadCard key={entry.id} entry={entry} />
          ))}
        </CardGrid>
      )}
    </TabShell>
  );
}

/* ------------------------------------------------------------------ */

function PadInput() {
  const createPadEntry = useStore((s) => s.createPadEntry);
  const updatePadEntry = useStore((s) => s.updatePadEntry);

  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  /** After an add we offer a tag picker for that entry, then get out of the way. */
  const [justAdded, setJustAdded] = useState<PadEntry | null>(null);

  const isLink = looksLikeLink(draft);

  const add = async () => {
    const content = draft.trim();
    if (content === '') return;
    setSaving(true);
    try {
      const entry = await createPadEntry({
        content: isLink ? normalizeUrl(content) : content,
        isLink,
      });
      setDraft('');
      setJustAdded(entry);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          {isLink ? (
            <Icon
              name="link"
              className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            />
          ) : null}
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="Paste a link or jot a note"
            aria-label="New pad entry"
            className={isLink ? 'pl-9' : ''}
          />
        </div>
        <Button
          variant="primary"
          onClick={() => void add()}
          busy={saving}
          disabled={draft.trim() === ''}
        >
          <Icon name="plus" />
          Add
        </Button>
      </div>

      {justAdded !== null ? (
        <div className="bg-sunken hairline fade-in flex flex-wrap items-center gap-2 rounded-[9px] px-3 py-2">
          <span className="text-muted text-[13px]">Tag it?</span>
          {TAGS.map((tag) => (
            <FilterChip
              key={tag}
              active={false}
              onClick={() => {
                void updatePadEntry(justAdded.id, { tag });
                setJustAdded(null);
              }}
            >
              {TAG_LABEL[tag]}
            </FilterChip>
          ))}
          <button
            type="button"
            onClick={() => setJustAdded(null)}
            aria-label="Skip tagging"
            className="text-faint hover:text-ink ml-auto flex size-8 items-center justify-center rounded-full"
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PadCard({ entry }: { entry: PadEntry }) {
  const deletePadEntry = useStore((s) => s.deletePadEntry);

  return (
    <Card className="fade-in flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        {entry.isLink ? (
          <p className="text-muted flex min-w-0 items-center gap-1.5 text-[13.5px]">
            <Icon name="link" size={12} />
            <span className="truncate">{prettyUrl(entry.content)}</span>
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-[14px] leading-[1.5]">{entry.content}</p>
        )}
        {entry.tag !== undefined ? <Chip>{TAG_LABEL[entry.tag]}</Chip> : null}
      </div>

      {entry.note !== undefined && entry.note !== '' ? (
        <p className="text-[13.5px] leading-[1.5]">{entry.note}</p>
      ) : null}

      <div className="hairline-t flex flex-wrap items-center gap-2 pt-2.5">
        <span className="text-faint text-[12px]">{relativeTime(entry.createdAt)}</span>
        {entry.isLink ? (
          <ExternalLink href={entry.content} className="text-muted ml-2">
            Open
            <Icon name="external" size={12} />
          </ExternalLink>
        ) : null}
        <ConfirmButton
          className="ml-auto"
          onConfirm={() => void deletePadEntry(entry.id)}
          confirmLabel="Confirm"
        />
      </div>
    </Card>
  );
}
