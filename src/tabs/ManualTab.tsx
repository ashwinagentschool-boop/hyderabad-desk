import { useEffect, useMemo, useState } from 'react';
import type { Lead, LeadSource, LeadStatus } from '../adapters/types';
import { SourceBadge, StatusSelect } from '../components/Badge';
import { Icon } from '../components/Icon';
import { LeadModal } from '../components/LeadModal';
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
} from '../components/ui';
import {
  isDueToday,
  isOverdue,
  relativeTime,
  shortDate,
  STATUS_LABEL,
  STATUS_ORDER,
} from '../lib/format';
import { useStore } from '../store';

type SourceFilter = 'all' | LeadSource;
type StatusFilter = 'all' | LeadStatus;

export function ManualTab() {
  const leads = useStore((s) => s.leads);
  const loadLeads = useStore((s) => s.loadLeads);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Lead | 'new' | null>(null);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = leads.items.filter((lead) => {
      if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false;
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (q === '') return true;
      return [lead.name, lead.area ?? '', lead.requirement]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    // Overdue follow-ups pin to the top, oldest first; everything else
    // falls back to most-recently-touched.
    return filtered.sort((a, b) => {
      const aOver = isOverdue(a.followUpDate, a.status);
      const bOver = isOverdue(b.followUpDate, b.status);
      if (aOver !== bOver) return aOver ? -1 : 1;
      if (aOver && bOver) return (a.followUpDate ?? '').localeCompare(b.followUpDate ?? '');
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [leads.items, sourceFilter, statusFilter, query]);

  const overdueCount = leads.items.filter((l) =>
    isOverdue(l.followUpDate, l.status),
  ).length;

  return (
    <TabShell>
      <TabHeader
        title="Pipeline"
        subtitle={
          overdueCount > 0
            ? `${leads.items.length} leads · ${overdueCount} overdue`
            : `${leads.items.length} leads`
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            <Icon name="plus" />
            Add lead
          </Button>
        }
      />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search name, area or requirement"
      />

      <div className="grid gap-2">
        <ChipRow>
          <FilterChip active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>
            All sources
          </FilterChip>
          <FilterChip
            active={sourceFilter === 'manual'}
            onClick={() => setSourceFilter('manual')}
          >
            Manual
          </FilterChip>
          <FilterChip
            active={sourceFilter === 'reddit'}
            onClick={() => setSourceFilter('reddit')}
          >
            Reddit
          </FilterChip>
        </ChipRow>

        <ChipRow>
          <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
            All statuses
          </FilterChip>
          {STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              active={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {STATUS_LABEL[status]}
            </FilterChip>
          ))}
        </ChipRow>
      </div>

      {leads.status === 'error' ? (
        <ErrorCard
          message={leads.error ?? 'Unknown error'}
          onRetry={() => void loadLeads(true)}
        />
      ) : leads.status === 'loading' && leads.items.length === 0 ? (
        <LoadingRows rows={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={leads.items.length === 0 ? 'No leads yet' : 'Nothing matches those filters'}
          hint={
            leads.items.length === 0
              ? 'Add one manually, or save a buying-intent post from the Reddit tab.'
              : 'Clear a filter or change the search to see more.'
          }
          action={
            leads.items.length === 0 ? (
              <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
                <Icon name="plus" />
                Add lead
              </Button>
            ) : null
          }
        />
      ) : (
        <CardGrid>
          {visible.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onEdit={() => setEditing(lead)} />
          ))}
        </CardGrid>
      )}

      {editing !== null ? (
        <LeadModal
          lead={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </TabShell>
  );
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

function LeadCard({ lead, onEdit }: { lead: Lead; onEdit: () => void }) {
  const updateLead = useStore((s) => s.updateLead);
  const deleteLead = useStore((s) => s.deleteLead);
  const overdue = isOverdue(lead.followUpDate, lead.status);
  const dueToday = isDueToday(lead.followUpDate, lead.status);

  return (
    <Card tone={overdue ? 'overdue' : 'default'} className="rise flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left text-[16px] font-semibold tracking-[-0.01em]"
        >
          <span className="block truncate">{lead.name}</span>
        </button>
        <SourceBadge source={lead.source} />
      </div>

      <p className="text-[14px] leading-[1.5]">{lead.requirement}</p>

      {/* No separators here: this row wraps at 375px and a trailing
          middle-dot orphaned at the end of a line reads as a bug.
          Weight and colour carry the hierarchy instead. */}
      <div className="text-muted flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
        {lead.area !== undefined && lead.area !== '' ? <span>{lead.area}</span> : null}
        {lead.budget !== undefined && lead.budget !== '' ? (
          <span className="num text-ink font-medium">{lead.budget}</span>
        ) : null}
        {lead.phone !== undefined && lead.phone !== '' ? (
          <a
            href={`tel:${lead.phone.replace(/\s/g, '')}`}
            className="num hover:text-ink transition-colors"
          >
            {lead.phone}
          </a>
        ) : null}
      </div>

      {/* Overdue is the one thing that must survive a two-second glance,
          so it gets a rule as well as colour. */}
      {lead.followUpDate !== undefined ? (
        <p
          className={`text-[13px] font-medium ${
            overdue
              ? 'text-[var(--c-overdue-rule)] border-l-2 border-[var(--c-overdue-rule)] pl-2.5'
              : 'text-muted'
          }`}
        >
          {overdue
            ? `Overdue since ${shortDate(lead.followUpDate)}`
            : dueToday
              ? 'Follow up today'
              : `Follow up ${shortDate(lead.followUpDate)}`}
        </p>
      ) : null}

      {lead.notes !== undefined && lead.notes !== '' ? (
        <p className="text-muted text-[13px] leading-[1.5]">{lead.notes}</p>
      ) : null}

      <div className="hairline-t mt-0.5 flex flex-wrap items-center gap-2 pt-2.5">
        <StatusSelect
          status={lead.status}
          label={`Status for ${lead.name}`}
          onChange={(status) => void updateLead(lead.id, { status })}
        />

        <Button size="sm" onClick={onEdit}>
          Edit
        </Button>

        {lead.redditPermalink !== undefined ? (
          <ExternalLink href={lead.redditPermalink} className="text-muted">
            Source
            <Icon name="external" size={12} />
          </ExternalLink>
        ) : null}

        <ConfirmButton
          className="ml-auto"
          onConfirm={() => void deleteLead(lead.id)}
          confirmLabel="Confirm"
        />
      </div>

      <p className="text-faint text-[11.5px]">updated {relativeTime(lead.updatedAt)}</p>
    </Card>
  );
}
