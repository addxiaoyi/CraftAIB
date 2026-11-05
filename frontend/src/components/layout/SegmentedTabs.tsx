import type { LucideIcon } from 'lucide-react';

export interface SegmentedTabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedTabsProps {
  items: SegmentedTabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}

export function SegmentedTabs({ items, value, onChange, ariaLabel, className = '' }: SegmentedTabsProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 ${className}`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = value === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            aria-pressed={isActive}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              isActive
                ? 'bg-white/10 font-semibold text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {Icon && <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
