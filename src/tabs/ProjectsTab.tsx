import { useEffect, useMemo, useState } from 'react';
import type { Project } from '../adapters/types';
import { Chip, TealBadge } from '../components/Badge';
import { Icon } from '../components/Icon';
import { SourceStatusLine } from '../components/StatusStrip';
import {
  Button,
  Card,
  CardGrid,
  ChipRow,
  Dot,
  EmptyState,
  ErrorCard,
  FilterChip,
  LoadingRows,
  SearchField,
  TabHeader,
  TabShell,
} from '../components/ui';
import { useStore } from '../store';

type BudgetBand = 'all' | 'under1' | '1to2' | 'over2';
type PossessionFilter = 'all' | 'ready' | 'under_construction';

const BUDGET_LABEL: Record<BudgetBand, string> = {
  all: 'Any budget',
  under1: 'Under 1 Cr',
  '1to2': '1 – 2 Cr',
  over2: 'Over 2 Cr',
};

/** "2.4 Cr" / "68 L" -> lakhs. Kept local; the sheet stores display strings. */
function toLakhs(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const m = /(\d+(?:\.\d+)?)\s*(cr|crore|l|lac|lakh)?/i.exec(value);
  if (m === null) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  return (m[2] ?? 'l').toLowerCase().startsWith('c') ? n * 100 : n;
}

const isReady = (p: Project) => /ready/i.test(p.possession ?? '');

function inBand(project: Project, band: BudgetBand): boolean {
  if (band === 'all') return true;
  const from = toLakhs(project.priceFrom);
  if (from === undefined) return false;
  if (band === 'under1') return from < 100;
  if (band === '1to2') return from >= 100 && from <= 200;
  return from > 200;
}

export function ProjectsTab() {
  const projects = useStore((s) => s.projects);
  const loadProjects = useStore((s) => s.loadProjects);
  const syncProjects = useStore((s) => s.syncProjects);

  const [query, setQuery] = useState('');
  const [area, setArea] = useState('all');
  const [band, setBand] = useState<BudgetBand>('all');
  const [possession, setPossession] = useState<PossessionFilter>('all');

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const areas = useMemo(
    () => [...new Set(projects.items.map((p) => p.area))].sort(),
    [projects.items],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.items.filter((p) => {
      if (area !== 'all' && p.area !== area) return false;
      if (!inBand(p, band)) return false;
      if (possession === 'ready' && !isReady(p)) return false;
      if (possession === 'under_construction' && isReady(p)) return false;
      if (q === '') return true;
      return [p.name, p.builder ?? '', p.area, p.type].join(' ').toLowerCase().includes(q);
    });
  }, [projects.items, query, area, band, possession]);

  const syncing = projects.status === 'loading';

  return (
    <TabShell>
      <TabHeader
        title="Projects"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{projects.items.length} on the sheet</span>
            <Dot />
            <SourceStatusLine source="sheet" />
          </span>
        }
        actions={
          <Button size="sm" onClick={() => void syncProjects()} busy={syncing}>
            <Icon name="refresh" />
            Sync
          </Button>
        }
      />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search project, builder or area"
      />

      <div className="grid gap-2">
        <ChipRow>
          <FilterChip active={area === 'all'} onClick={() => setArea('all')}>
            All areas
          </FilterChip>
          {areas.map((a) => (
            <FilterChip key={a} active={area === a} onClick={() => setArea(a)}>
              {a}
            </FilterChip>
          ))}
        </ChipRow>

        <ChipRow>
          {(Object.keys(BUDGET_LABEL) as BudgetBand[]).map((b) => (
            <FilterChip key={b} active={band === b} onClick={() => setBand(b)}>
              {BUDGET_LABEL[b]}
            </FilterChip>
          ))}
        </ChipRow>

        <ChipRow>
          <FilterChip active={possession === 'all'} onClick={() => setPossession('all')}>
            Any possession
          </FilterChip>
          <FilterChip
            active={possession === 'ready'}
            onClick={() => setPossession('ready')}
          >
            Ready to move
          </FilterChip>
          <FilterChip
            active={possession === 'under_construction'}
            onClick={() => setPossession('under_construction')}
          >
            Under construction
          </FilterChip>
        </ChipRow>
      </div>

      {projects.status === 'error' ? (
        <ErrorCard
          message={projects.error ?? 'Unknown error'}
          onRetry={() => void loadProjects(true)}
        />
      ) : syncing && projects.items.length === 0 ? (
        <LoadingRows rows={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No projects match"
          hint="Widen the budget band or clear the area filter."
        />
      ) : (
        <CardGrid>
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </CardGrid>
      )}
    </TabShell>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const price = [project.priceFrom, project.priceTo].filter(Boolean).join(' - ');

  return (
    <Card className="rise flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-medium">{project.name}</h2>
          {project.builder !== undefined ? (
            <p className="text-muted truncate text-[13px]">{project.builder}</p>
          ) : null}
        </div>
        {project.rera === true ? <TealBadge>RERA</TealBadge> : <Chip>No RERA</Chip>}
      </div>

      {/* Price gets its own line. It is the value the agent scans for, and
          a mono range inline in the meta run wraps at 375px. */}
      {price !== '' ? (
        <p className="num text-[15px] font-medium tracking-[-0.01em]">{price}</p>
      ) : null}

      <p className="text-[13.5px]">
        {project.area}
        <Dot spaced />
        {project.type}
      </p>

      <p className="text-muted text-[13px]">
        {project.possession ?? 'Possession TBD'}
        {project.sqftRange !== undefined ? (
          <>
            <Dot spaced />
            <span className="num">{project.sqftRange}</span>
          </>
        ) : null}
      </p>

      {project.notes !== undefined ? (
        <p className="text-muted hairline-t pt-2 text-[13px] leading-[1.5]">
          {project.notes}
        </p>
      ) : null}
    </Card>
  );
}
