/**
 * Hand-rolled inline icons — no icon library, no network requests.
 * All use `currentColor` so they follow the surrounding text in both themes.
 */
export type IconName =
  | 'search'
  | 'plus'
  | 'close'
  | 'refresh'
  | 'external'
  | 'trash'
  | 'link'
  | 'note'
  | 'chevron-down'
  | 'chevron-right'
  | 'check'
  | 'send'
  | 'alert'
  | 'settings';

const PATHS: Record<IconName, string> = {
  search: 'M7 1a6 6 0 1 1 0 12A6 6 0 0 1 7 1Zm0 1.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm4.4 8.34 3.38 3.38-1.06 1.06-3.38-3.38 1.06-1.06Z',
  plus: 'M7.25 2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25V2Z',
  close:
    'M3.22 2.16 8 6.94l4.78-4.78 1.06 1.06L9.06 8l4.78 4.78-1.06 1.06L8 9.06l-4.78 4.78-1.06-1.06L6.94 8 2.16 3.22l1.06-1.06Z',
  refresh:
    'M8 2.5a5.5 5.5 0 0 1 4.9 3H11v1.5h4V3h-1.5v1.36A7 7 0 0 0 1 8h1.5A5.5 5.5 0 0 1 8 2.5Zm0 11a5.5 5.5 0 0 1-4.9-3H5V9H1v4h1.5v-1.36A7 7 0 0 0 15 8h-1.5A5.5 5.5 0 0 1 8 13.5Z',
  external:
    'M9 2h5v5h-1.5V4.56L7.53 9.53 6.47 8.47l4.97-4.97H9V2ZM3 4h3.5v1.5h-3v7h7v-3H14V14H3V4Z',
  trash:
    'M6 1h4v1.5h4V4H2V2.5h4V1Zm-2.5 4h9l-.6 9.06A1 1 0 0 1 10.9 15H5.1a1 1 0 0 1-1-.94L3.5 5Zm2.06 1.5.44 7h1l-.3-7h-1.14Zm3.74 0-.3 7h1l.44-7H9.3Z',
  link: 'M6.7 9.3a2.5 2.5 0 0 1 0-3.54l2.12-2.12a2.5 2.5 0 0 1 3.54 3.54l-1.06 1.06-1.06-1.06 1.06-1.06a1 1 0 1 0-1.42-1.42L7.76 6.82a1 1 0 0 0 0 1.42L6.7 9.3Zm2.6-2.6a2.5 2.5 0 0 1 0 3.54L7.18 12.36a2.5 2.5 0 1 1-3.54-3.54L4.7 7.76l1.06 1.06-1.06 1.06a1 1 0 1 0 1.42 1.42l2.12-2.12a1 1 0 0 0 0-1.42L9.3 6.7Z',
  note: 'M3 1h7l3 3v11H3V1Zm1.5 1.5v11h7V5H9V2.5H4.5ZM6 7h4v1.5H6V7Zm0 3h4v1.5H6V10Z',
  'chevron-down': 'M8 10.94 2.97 5.91l1.06-1.06L8 8.82l3.97-3.97 1.06 1.06L8 10.94Z',
  'chevron-right': 'M5.91 13.03 4.85 11.97 8.82 8 4.85 4.03 5.91 2.97 10.94 8l-5.03 5.03Z',
  check: 'M13.47 3.47 6.5 10.44 2.53 6.47 1.47 7.53l5.03 5.03 8.03-8.03-1.06-1.06Z',
  send: 'M1 14 15 8 1 2l2.5 5L9 8l-5.5 1L1 14Z',
  alert: 'M8 1 15 14H1L8 1Zm-.75 5v4h1.5V6h-1.5Zm0 5v1.5h1.5V11h-1.5Z',
  settings:
    'M6.5 1h3l.35 1.9 1.2.7 1.8-.66 1.5 2.6-1.45 1.28v1.36l1.45 1.28-1.5 2.6-1.8-.66-1.2.7L9.5 15h-3l-.35-1.9-1.2-.7-1.8.66-1.5-2.6L3.1 9.18V7.82L1.65 6.54l1.5-2.6 1.8.66 1.2-.7L6.5 1ZM8 5.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z',
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 14, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
