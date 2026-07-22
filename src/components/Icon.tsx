import {
  ArrowClockwise,
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  Check,
  Gear,
  Link as LinkIcon,
  MagnifyingGlass,
  NotePencil,
  PaperPlaneTilt,
  Plus,
  Trash,
  WarningCircle,
  X,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';

/**
 * Single icon family for the whole app (Phosphor). Never hand-rolled SVG
 * paths. `regular` weight throughout, standardised at 1.5px optical stroke.
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

const ICONS: Record<IconName, PhosphorIcon> = {
  search: MagnifyingGlass,
  plus: Plus,
  close: X,
  refresh: ArrowClockwise,
  external: ArrowSquareOut,
  trash: Trash,
  link: LinkIcon,
  note: NotePencil,
  'chevron-down': CaretDown,
  'chevron-right': CaretRight,
  check: Check,
  send: PaperPlaneTilt,
  alert: WarningCircle,
  settings: Gear,
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Bump to `bold` for small glyphs that would otherwise disappear. */
  weight?: 'regular' | 'bold';
}

export function Icon({ name, size = 15, className = '', weight = 'bold' }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      weight={weight}
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
    />
  );
}
