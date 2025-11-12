'use client';

import { MorphoVaultData } from '@/types/vault';

interface VaultTabsProps {
  vaultData: MorphoVaultData;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'risk', label: 'Risk' },
  { id: 'activity', label: 'Activity' },
];

export default function VaultTabs({ activeTab, onTabChange }: VaultTabsProps) {
  return (
    <div className="flex gap-1 border-b border-[var(--border-subtle)]">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === tab.id
              ? 'text-[var(--foreground)]'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          {tab.label}
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
          )}
        </button>
      ))}
    </div>
  );
}

