import { useState } from 'react';
import { Icon } from './Icon';
import { Button, TextField } from './ui';

interface ListEditorProps {
  label: string;
  values: string[];
  placeholder: string;
  /** Applied to every entry before storing (e.g. force a leading @). */
  normalize?: (raw: string) => string;
  onChange: (next: string[]) => void;
}

/**
 * Editable list of short strings: subreddits, keywords, X handles,
 * Instagram accounts. One component, four call sites.
 */
export function ListEditor({
  label,
  values,
  placeholder,
  normalize = (v) => v.trim(),
  onChange,
}: ListEditorProps) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = normalize(draft);
    if (value === '') return;
    const exists = values.some((v) => v.toLowerCase() === value.toLowerCase());
    if (!exists) onChange([...values, value]);
    setDraft('');
  };

  return (
    <div>
      <p className="text-muted mb-2.5 text-[12.5px] font-medium">{label}</p>

      {values.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li
              key={value}
              className="bg-sunken flex items-center gap-0.5 rounded-full py-1 pr-1 pl-3 text-[13px]"
            >
              <span className="max-w-[190px] truncate">{value}</span>
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="text-faint hover:text-ink flex size-6 items-center justify-center rounded-full transition-colors"
              >
                <Icon name="close" size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-faint mb-3 text-[13px]">Nothing added yet.</p>
      )}

      <div className="flex gap-2">
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={`Add to ${label}`}
        />
        <Button variant="secondary" onClick={add} disabled={draft.trim() === ''}>
          <Icon name="plus" size={14} />
          Add
        </Button>
      </div>
    </div>
  );
}
