import type {
  ChatAdapter,
  ChatMessage,
  Lead,
  LeadStatus,
  Project,
} from '../types';
import { id, local, nowIso, read, write } from './_util';
import { manualLeadsAdapter } from './manualLeadsAdapter';
import { projectsAdapter } from './projectsAdapter';

const STORE = 'chat';

/* ------------------------------------------------------------------ *
 * Money helpers — the sheet writes "68 L" and "2.4 Cr", not numbers.
 * ------------------------------------------------------------------ */

/** Parse an Indian price string into lakhs. "1.4 Cr" -> 140, "68 L" -> 68. */
function toLakhs(value?: string): number | undefined {
  if (!value) return undefined;
  const match = /(\d+(?:\.\d+)?)\s*(cr|crore|l|lac|lakh|lakhs)?/i.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const unit = (match[2] ?? 'l').toLowerCase();
  return unit.startsWith('c') ? amount * 100 : amount;
}

/** The upper end of a range like "1.3 - 1.5 Cr" (unit may appear once). */
function budgetCeilingLakhs(value?: string): number | undefined {
  if (!value) return undefined;
  const parts = value.split(/[-–to]+/i).filter((p) => /\d/.test(p));
  if (parts.length === 0) return undefined;
  const unitMatch = /(cr|crore|l|lac|lakh|lakhs)/i.exec(value);
  const unit = (unitMatch?.[1] ?? 'l').toLowerCase();
  const last = parts[parts.length - 1];
  const own = /(cr|crore|l|lac|lakh|lakhs)/i.test(last)
    ? toLakhs(last)
    : toLakhs(`${last} ${unit}`);
  return own;
}

const fmtLakhs = (n: number) => (n >= 100 ? `${(n / 100).toFixed(2).replace(/\.?0+$/, '')} Cr` : `${n} L`);

/* ------------------------------------------------------------------ *
 * Question understanding
 * ------------------------------------------------------------------ */

const AREAS = [
  'Kokapet',
  'Tellapur',
  'Kollur',
  'Gachibowli',
  'Bachupally',
  'Kondapur',
  'Madhapur',
  'ORR',
];

const STATUS_WORDS: Record<string, LeadStatus> = {
  new: 'new',
  contacted: 'contacted',
  'site visit': 'site_visit',
  site_visit: 'site_visit',
  visiting: 'site_visit',
  negotiation: 'negotiation',
  negotiating: 'negotiation',
  closed: 'closed',
  won: 'closed',
  lost: 'lost',
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  site_visit: 'Site visit',
  negotiation: 'Negotiation',
  closed: 'Closed',
  lost: 'Lost',
};

function findAreas(q: string): string[] {
  const lower = q.toLowerCase();
  return AREAS.filter((a) => lower.includes(a.toLowerCase()));
}

function findStatus(q: string): LeadStatus | undefined {
  const lower = q.toLowerCase();
  for (const [word, status] of Object.entries(STATUS_WORDS)) {
    if (lower.includes(word)) return status;
  }
  return undefined;
}

/** "under 1.5 Cr", "below 80L", "budget 2 cr" -> ceiling in lakhs. */
function findBudgetCeiling(q: string): number | undefined {
  const m =
    /(?:under|below|less than|upto|up to|within|max(?:imum)?|budget(?: of)?)\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(cr|crore|l|lac|lakh|lakhs)?/i.exec(
      q,
    );
  if (!m) return undefined;
  return toLakhs(`${m[1]} ${m[2] ?? 'l'}`);
}

const isReady = (p: Project) => /ready/i.test(p.possession ?? '');

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

function projectLine(p: Project): string {
  const price = [p.priceFrom, p.priceTo].filter(Boolean).join(' – ');
  const bits = [p.area, p.type, price || null, p.possession || null].filter(Boolean);
  return `• ${p.name}${p.builder ? ` (${p.builder})` : ''} — ${bits.join(' · ')}`;
}

function leadLine(l: Lead): string {
  const bits = [
    l.area || null,
    l.budget || null,
    STATUS_LABEL[l.status],
    l.source === 'reddit' ? 'from Reddit' : null,
  ].filter(Boolean);
  return `• ${l.name} — ${bits.join(' · ')}`;
}

function listOrNone(lines: string[], noneText: string): string {
  return lines.length > 0 ? lines.join('\n') : noneText;
}

/** "2026-07-20" -> "20 Jul". Kept local so the adapter has no UI deps. */
function humanDate(dateKey: string | undefined): string {
  if (dateKey === undefined) return 'no date';
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ *
 * The rule engine
 * ------------------------------------------------------------------ */

function answer(question: string, projects: Project[], leads: Lead[]): string {
  const q = question.trim();
  const lower = q.toLowerCase();
  const areas = findAreas(q);
  const ceiling = findBudgetCeiling(q);
  const status = findStatus(q);

  const asksLeads = /\blead|client|buyer|enquir|follow/.test(lower);
  const asksProjects = /\bproject|inventory|property|flat|apartment|villa|bhk/.test(lower);

  /* --- lead ↔ project area match ------------------------------------ */
  if (/match|suit|fit|which leads/.test(lower) && (asksProjects || areas.length > 0)) {
    const targetAreas = areas.length > 0 ? areas : AREAS;
    const lines: string[] = [];
    for (const area of targetAreas) {
      const areaLeads = leads.filter(
        (l) =>
          l.status !== 'closed' &&
          l.status !== 'lost' &&
          (l.area ?? '').toLowerCase().includes(area.toLowerCase()),
      );
      const areaProjects = projects.filter((p) =>
        p.area.toLowerCase().includes(area.toLowerCase()),
      );
      if (areaLeads.length === 0 || areaProjects.length === 0) continue;

      for (const lead of areaLeads) {
        const cap = budgetCeilingLakhs(lead.budget);
        const affordable = areaProjects.filter((p) => {
          const from = toLakhs(p.priceFrom);
          return cap === undefined || from === undefined || from <= cap;
        });
        if (affordable.length === 0) {
          lines.push(
            `• ${lead.name} (${area}, ${lead.budget ?? 'budget not set'}) — nothing in ${area} lands inside that budget.`,
          );
        } else {
          lines.push(
            `• ${lead.name} (${area}, ${lead.budget ?? 'budget not set'}) → ${affordable
              .map((p) => p.name)
              .join(', ')}`,
          );
        }
      }
    }
    return listOrNone(
      lines,
      'No open leads currently sit in the same area as a project on the list.',
    );
  }

  /* --- compare two named projects ----------------------------------- */
  if (/compare|versus|\bvs\b|difference between/.test(lower)) {
    const named = projects.filter((p) => lower.includes(p.name.toLowerCase()));
    if (named.length >= 2) {
      const [a, b] = named;
      const rows = [
        `${a.name} vs ${b.name}`,
        '',
        `Area — ${a.area} vs ${b.area}`,
        `Type — ${a.type} vs ${b.type}`,
        `Price — ${[a.priceFrom, a.priceTo].filter(Boolean).join(' – ') || 'n/a'} vs ${
          [b.priceFrom, b.priceTo].filter(Boolean).join(' – ') || 'n/a'
        }`,
        `Size — ${a.sqftRange ?? 'n/a'} vs ${b.sqftRange ?? 'n/a'}`,
        `Possession — ${a.possession ?? 'n/a'} vs ${b.possession ?? 'n/a'}`,
        `RERA — ${a.rera ? 'yes' : 'no'} vs ${b.rera ? 'yes' : 'no'}`,
      ];
      return rows.join('\n');
    }
    return `Name two projects and I'll put them side by side. Currently tracking:\n${projects
      .map((p) => `• ${p.name}`)
      .join('\n')}`;
  }

  /* --- overdue / follow-ups ----------------------------------------- */
  if (/overdue|due|follow[- ]?up|today/.test(lower)) {
    const today = new Date().toISOString().slice(0, 10);
    const due = leads.filter(
      (l) =>
        l.followUpDate !== undefined &&
        l.followUpDate <= today &&
        l.status !== 'closed' &&
        l.status !== 'lost',
    );
    return `${due.length} follow-up${due.length === 1 ? '' : 's'} due or overdue.\n${listOrNone(
      due.map((l) => `${leadLine(l)} · due ${humanDate(l.followUpDate)}`),
      'Nothing is overdue right now.',
    )}`;
  }

  /* --- leads by status / area --------------------------------------- */
  if (asksLeads || status !== undefined) {
    let matched = leads;
    if (status !== undefined) matched = matched.filter((l) => l.status === status);
    if (areas.length > 0) {
      matched = matched.filter((l) =>
        areas.some((a) => (l.area ?? '').toLowerCase().includes(a.toLowerCase())),
      );
    }
    if (ceiling !== undefined) {
      matched = matched.filter((l) => {
        const cap = budgetCeilingLakhs(l.budget);
        return cap !== undefined && cap <= ceiling;
      });
    }
    const filters = [
      status !== undefined ? `marked ${STATUS_LABEL[status]}` : null,
      areas.length > 0 ? `in ${areas.join(' / ')}` : null,
      ceiling !== undefined ? `under ${fmtLakhs(ceiling)}` : null,
    ].filter(Boolean);
    const header = `${matched.length} lead${matched.length === 1 ? '' : 's'}${
      filters.length > 0 ? ` ${filters.join(', ')}` : ''
    }.`;
    return `${header}\n${listOrNone(matched.map(leadLine), 'No leads match that.')}`;
  }

  /* --- projects: possession / area / budget ------------------------- */
  const wantsReady = /ready to move|ready-to-move|\bready\b|immediate/.test(lower);
  const wantsUnderConstruction = /under[- ]construction|ongoing|upcoming|launch/.test(
    lower,
  );

  if (asksProjects || wantsReady || wantsUnderConstruction || areas.length > 0 || ceiling !== undefined) {
    let matched = projects;
    if (wantsReady) matched = matched.filter(isReady);
    if (wantsUnderConstruction) matched = matched.filter((p) => !isReady(p));
    if (areas.length > 0) {
      matched = matched.filter((p) =>
        areas.some((a) => p.area.toLowerCase().includes(a.toLowerCase())),
      );
    }
    if (ceiling !== undefined) {
      matched = matched.filter((p) => {
        const from = toLakhs(p.priceFrom);
        return from !== undefined && from <= ceiling;
      });
    }
    if (/rera/.test(lower)) matched = matched.filter((p) => p.rera === true);

    const filters = [
      wantsReady ? 'ready to move' : null,
      wantsUnderConstruction ? 'under construction' : null,
      areas.length > 0 ? `in ${areas.join(' / ')}` : null,
      ceiling !== undefined ? `starting under ${fmtLakhs(ceiling)}` : null,
      /rera/.test(lower) ? 'RERA registered' : null,
    ].filter(Boolean);

    const header = `${matched.length} project${matched.length === 1 ? '' : 's'}${
      filters.length > 0 ? ` ${filters.join(', ')}` : ''
    }.`;
    return `${header}\n${listOrNone(
      matched.map(projectLine),
      'Nothing on the list matches those filters.',
    )}`;
  }

  /* --- fallback ------------------------------------------------------ */
  return [
    `I can answer from ${projects.length} projects and ${leads.length} leads.`,
    '',
    'Try asking about:',
    '• ready to move projects, or projects in Kokapet under 2 Cr',
    '• which leads are in negotiation, or leads in Tellapur',
    '• which leads match Kokapet projects',
    '• compare Sattva Lakeridge and Vertex Panache',
    '• what follow-ups are overdue',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Adapter
 * ------------------------------------------------------------------ */

/** One retry — the projects fetch is deliberately flaky, chat shouldn't be. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

export const chatAdapter: ChatAdapter = {
  async history() {
    return local(() => read<ChatMessage[]>(STORE, []));
  },

  async ask(question) {
    const [projects, leads] = await Promise.all([
      withRetry(() => projectsAdapter.list()),
      manualLeadsAdapter.list(),
    ]);

    const userMessage: ChatMessage = {
      id: id('cm'),
      role: 'user',
      text: question,
      createdAt: nowIso(),
    };
    const reply: ChatMessage = {
      id: id('cm'),
      role: 'assistant',
      text: answer(question, projects, leads),
      createdAt: nowIso(),
    };

    const history = read<ChatMessage[]>(STORE, []);
    write(STORE, [...history, userMessage, reply]);
    return reply;
  },

  async clear() {
    return local(() => {
      write(STORE, [] as ChatMessage[]);
    });
  },
};
