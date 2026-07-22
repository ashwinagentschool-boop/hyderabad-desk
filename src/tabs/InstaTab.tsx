import { useEffect, useState } from 'react';
import type { InstaEntry } from '../adapters/types';
import { Collapsible } from '../components/Collapsible';
import { Icon } from '../components/Icon';
import { ListEditor } from '../components/ListEditor';
import { SourceStatusLine } from '../components/StatusStrip';
import { useToast } from '../components/Toast';
import {
  Button,
  Card,
  CardGrid,
  ConfirmButton,
  Dot,
  EmptyState,
  ErrorCard,
  ExternalLink,
  Field,
  LoadingRows,
  Notice,
  TabHeader,
  TabShell,
  TextField,
} from '../components/ui';
import { looksLikeLink, normalizeUrl, prettyUrl, relativeTime } from '../lib/format';
import { useStore } from '../store';

const asAccount = (raw: string) => {
  const trimmed = raw.trim().replace(/^@+/, '');
  return trimmed === '' ? '' : `@${trimmed}`;
};

export function InstaTab() {
  const insta = useStore((s) => s.insta);
  const loadInsta = useStore((s) => s.loadInsta);

  useEffect(() => {
    void loadInsta();
  }, [loadInsta]);

  return (
    <TabShell>
      <TabHeader
        title="Instagram"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{insta.items.length} saved</span>
            <Dot />
            <SourceStatusLine source="insta" />
          </span>
        }
      />

      <QuickSave />

      {insta.status === 'error' ? (
        <ErrorCard
          message={insta.error ?? 'Unknown error'}
          onRetry={() => void loadInsta(true)}
        />
      ) : insta.status === 'loading' && insta.items.length === 0 ? (
        <LoadingRows rows={2} />
      ) : insta.items.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          hint="Paste a post link above to keep it handy for a client pitch."
        />
      ) : (
        <CardGrid>
          {insta.items.map((entry) => (
            <SavedCard key={entry.id} entry={entry} />
          ))}
        </CardGrid>
      )}

      <AccountWatch />
    </TabShell>
  );
}

/* ------------------------------------------------------------------ */

function QuickSave() {
  const createInstaEntry = useStore((s) => s.createInstaEntry);
  const showToast = useToast((s) => s.show);

  const [url, setUrl] = useState('');
  const [account, setAccount] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const invalid = !looksLikeLink(url);

  const save = async () => {
    setTouched(true);
    if (invalid) return;
    setSaving(true);
    try {
      await createInstaEntry({
        url: normalizeUrl(url),
        account: account.trim() === '' ? undefined : asAccount(account),
        note: note.trim() === '' ? undefined : note.trim(),
      });
      setUrl('');
      setAccount('');
      setNote('');
      setTouched(false);
      showToast('Saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface hairline grid gap-3 rounded-[11px] p-3.5">
      <Field label="Post link" required>
        <TextField
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          placeholder="https://www.instagram.com/p/…"
          aria-invalid={touched && invalid}
        />
        {touched && invalid ? (
          <span className="mt-1 block text-[12px] text-[var(--c-err)]">
            That doesn't look like a link.
          </span>
        ) : null}
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Account">
          <TextField
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="@hyderabadrealty"
          />
        </Field>
        <Field label="Note">
          <TextField
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Send to Sandeep"
          />
        </Field>
      </div>

      <Button variant="primary" onClick={() => void save()} busy={saving}>
        <Icon name="plus" />
        Save link
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SavedCard({ entry }: { entry: InstaEntry }) {
  const deleteInstaEntry = useStore((s) => s.deleteInstaEntry);

  return (
    <Card className="fade-in flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[14px] font-medium">
          {entry.account ?? 'Saved post'}
        </span>
        <span className="text-faint shrink-0 text-[12px]">
          {relativeTime(entry.savedAt)}
        </span>
      </div>

      {entry.note !== undefined ? (
        <p className="text-[13.5px] leading-[1.5]">{entry.note}</p>
      ) : null}

      <p className="text-muted flex items-center gap-1.5 text-[13px]">
        <Icon name="link" size={12} />
        <span className="truncate">{prettyUrl(entry.url)}</span>
      </p>

      <div className="hairline-t flex flex-wrap items-center gap-2 pt-2.5">
        <ExternalLink href={entry.url} className="text-muted">
          Open
          <Icon name="external" size={12} />
        </ExternalLink>
        <ConfirmButton
          className="ml-auto"
          onConfirm={() => void deleteInstaEntry(entry.id)}
          confirmLabel="Confirm"
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function AccountWatch() {
  const settings = useStore((s) => s.settings);
  const loadSettings = useStore((s) => s.loadSettings);
  const updateSettings = useStore((s) => s.updateSettings);
  const discovered = useStore((s) => s.instaDiscovered);
  const fetchInstaAccounts = useStore((s) => s.fetchInstaAccounts);
  const createInstaEntry = useStore((s) => s.createInstaEntry);
  const showToast = useToast((s) => s.show);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const loading = discovered.status === 'loading';

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium">Account watch</h2>
        <Button size="sm" onClick={() => void fetchInstaAccounts()} busy={loading}>
          <Icon name="refresh" />
          Fetch
        </Button>
      </div>

      <Notice>Best-effort — Instagram limits automated access.</Notice>

      <Collapsible title="Accounts watched">
        {settings === null ? (
          <p className="text-muted text-[13px]">Loading settings…</p>
        ) : (
          <ListEditor
            label="Instagram accounts"
            values={settings.instaAccounts}
            placeholder="@hyderabadrealty"
            normalize={asAccount}
            onChange={(instaAccounts) => void updateSettings({ instaAccounts })}
          />
        )}
      </Collapsible>

      {discovered.status === 'error' ? (
        <ErrorCard
          message={discovered.error ?? 'Unknown error'}
          onRetry={() => void fetchInstaAccounts()}
        />
      ) : loading ? (
        <LoadingRows rows={2} />
      ) : discovered.status === 'ready' && discovered.items.length === 0 ? (
        <EmptyState
          title="Nothing came back"
          hint="Instagram often blocks automated reads. Saving links by hand stays reliable."
        />
      ) : discovered.items.length > 0 ? (
        <CardGrid>
          {discovered.items.map((entry) => (
            <Card key={entry.id} className="fade-in flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[14px] font-medium">
                  {entry.account ?? 'Post'}
                </span>
                <span className="text-faint shrink-0 text-[12px]">
                  {relativeTime(entry.savedAt)}
                </span>
              </div>
              {entry.note !== undefined ? (
                <p className="text-[13.5px] leading-[1.5]">{entry.note}</p>
              ) : null}
              <div className="hairline-t flex flex-wrap items-center gap-2 pt-2.5">
                <ExternalLink href={entry.url} className="text-muted">
                  Open
                  <Icon name="external" size={12} />
                </ExternalLink>
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    void createInstaEntry({
                      url: entry.url,
                      account: entry.account,
                      note: entry.note,
                    });
                    showToast('Saved');
                  }}
                >
                  <Icon name="plus" />
                  Save
                </Button>
              </div>
            </Card>
          ))}
        </CardGrid>
      ) : null}
    </div>
  );
}
