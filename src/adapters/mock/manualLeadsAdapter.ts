import type { Lead, ManualLeadsAdapter } from '../types';
import { agoIso, id, local, nowIso, readSeeded, write } from './_util';

const STORE = 'leads';

const daysOut = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Five manual leads, seeded only when the store has never existed. */
const seed = (): Lead[] => [
  {
    id: 'ld_seed_1',
    source: 'manual',
    name: 'Praveen Kumar',
    phone: '+91 98490 11223',
    requirement: '3BHK, ready to move, near Gachibowli office',
    budget: '1.3 - 1.5 Cr',
    area: 'Gachibowli',
    status: 'site_visit',
    followUpDate: daysOut(-2), // deliberately overdue
    notes: 'Visited My Home Avatar, liked the 1720 sqft layout. Wife wants east facing.',
    createdAt: agoIso(60 * 24 * 9),
    updatedAt: agoIso(60 * 30),
  },
  {
    id: 'ld_seed_2',
    source: 'manual',
    name: 'Anita Reddy',
    phone: '+91 90000 44518',
    requirement: '2BHK investment unit, rental yield priority',
    budget: '70 - 85 L',
    area: 'Tellapur',
    status: 'contacted',
    followUpDate: daysOut(1),
    notes: 'Prefers under-construction for the payment plan. Call after 7pm only.',
    createdAt: agoIso(60 * 24 * 5),
    updatedAt: agoIso(60 * 20),
  },
  {
    id: 'ld_seed_3',
    source: 'manual',
    name: 'Sandeep Varma',
    phone: '+91 99590 78412',
    requirement: 'Villa, gated community, 4BHK minimum',
    budget: '2.5 - 3 Cr',
    area: 'Kollur',
    status: 'negotiation',
    followUpDate: daysOut(3),
    notes: 'Down to two options. Pushing for a 4% discount on the corner plot.',
    createdAt: agoIso(60 * 24 * 21),
    updatedAt: agoIso(60 * 6),
  },
  {
    id: 'ld_seed_4',
    source: 'manual',
    name: 'Farah Sultana',
    phone: '+91 91234 56780',
    requirement: 'HMDA plot, 200-300 sq yd, clear title',
    budget: '90 L - 1.1 Cr',
    area: 'Kokapet',
    status: 'new',
    followUpDate: daysOut(0), // due today
    notes: 'Referred by Sandeep Varma. Wants documents verified before any visit.',
    createdAt: agoIso(60 * 24 * 2),
    updatedAt: agoIso(60 * 24 * 2),
  },
  {
    id: 'ld_seed_5',
    source: 'manual',
    name: 'Rohit Malhotra',
    phone: '+91 88860 20147',
    requirement: '3BHK, possession within a year, metro connectivity',
    budget: '1 - 1.2 Cr',
    area: 'Madhapur',
    status: 'lost',
    notes: 'Went with a resale unit through another agent. Keep warm for 2027.',
    createdAt: agoIso(60 * 24 * 40),
    updatedAt: agoIso(60 * 24 * 11),
  },
];

function all(): Lead[] {
  return readSeeded<Lead[]>(STORE, seed);
}

/**
 * Owns the whole pipeline, not just manual entries — the Reddit tab
 * promotes a post into a lead through `create` with source 'reddit'.
 */
export const manualLeadsAdapter: ManualLeadsAdapter = {
  async list() {
    return local(() =>
      all().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    );
  },

  async create(input) {
    return local(() => {
      const leads = all();
      const lead: Lead = {
        ...input,
        id: id('ld'),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      write(STORE, [lead, ...leads]);
      return lead;
    });
  },

  async update(leadId, patch) {
    return local(() => {
      const leads = all();
      const idx = leads.findIndex((l) => l.id === leadId);
      if (idx === -1) throw new Error(`Unknown lead ${leadId}`);
      const updated: Lead = { ...leads[idx], ...patch, updatedAt: nowIso() };
      leads[idx] = updated;
      write(STORE, leads);
      return updated;
    });
  },

  async delete(leadId) {
    return local(() => {
      write(
        STORE,
        all().filter((l) => l.id !== leadId),
      );
    });
  },
};
