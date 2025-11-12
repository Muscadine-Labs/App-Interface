'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { findVaultByAddress } from '@/lib/vault-utils';
import { Vault } from '@/types/vault';
import { useVaultDataFetch } from '@/hooks/useVaultDataFetch';
import { useVaultListPreloader } from '@/hooks/useVaultDataFetch';
import { VAULTS } from '@/lib/vaults';
import VaultHero from '@/components/features/vault/VaultHero';
import VaultStatGrid from '@/components/features/vault/VaultStatGrid';
import VaultActionCard from '@/components/features/vault/VaultActionCard';
import VaultRiskDisclosures from '@/components/features/vault/VaultRiskDisclosures';
import VaultTabs from '@/components/features/vault/VaultTabs';

export default function VaultPage() {
  const params = useParams();
  const router = useRouter();
  const address = (params?.address as string) || '';
  const [activeTab, setActiveTab] = useState<string>('risk');

  // Find vault by address
  const vault = findVaultByAddress(address);

  // Fetch vault data
  const { vaultData, isLoading, hasError, refetch } = useVaultDataFetch(vault);

  // Preload all vault data
  const vaults: Vault[] = Object.values(VAULTS).map((v) => ({
    address: v.address,
    name: v.name,
    symbol: v.symbol,
    chainId: v.chainId,
  }));
  useVaultListPreloader(vaults);

  // Redirect to dashboard if vault not found
  useEffect(() => {
    if (!vault && address) {
      // Small delay to avoid flash of content
      const timer = setTimeout(() => {
        router.push('/');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [vault, address, router]);

  // Show loading state while redirecting or loading
  if (!vault || (isLoading && !vaultData)) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
        <p className="text-[var(--foreground-muted)] text-sm mt-2">
          {!vault ? 'Vault not found. Redirecting...' : 'Loading vault data...'}
        </p>
      </div>
    );
  }

  // Show error state
  if (hasError && !vaultData) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <p className="text-[var(--danger)] text-sm mb-4">
          Failed to load vault data
        </p>
        <button
          onClick={refetch}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Show no data state
  if (!vaultData) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <p className="text-[var(--foreground-muted)] text-sm">
          No vault data available
        </p>
      </div>
    );
  }

  return (
    <div className="w-full bg-[var(--background)] min-h-screen flex flex-col gap-8 p-12">

      {/* Hero Section */}
      <VaultHero vaultData={vaultData} />

      {/* Main Content */}
      <div className="flex flex-col w-full mx-auto py-8">
        {/* Key Stats */}
        
        <VaultStatGrid vaultData={vaultData} />


        {/* Tab content & interaction card */}
        <div className="grid grid-cols-[2fr_1fr] gap-6 py-8">
            {/* Left Column - Tab Content (66% width) */}
            <div className="bg-[var(--background)] flex flex-col">
                <VaultTabs
                    vaultData={vaultData}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />

                {/* Tab Content */}
                <div className="mt-6">
                    {activeTab === 'risk' && <VaultRiskDisclosures vaultData={vaultData} />}
                    {activeTab === 'overview' && (
                    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6">
                        <p className="text-sm text-[var(--foreground-muted)]">
                        Overview content coming soon...
                        </p>
                    </div>
                    )}
                    {activeTab === 'performance' && (
                    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6">
                        <p className="text-sm text-[var(--foreground-muted)]">
                        Performance content coming soon...
                        </p>
                    </div>
                    )}
                    {activeTab === 'activity' && (
                    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6">
                        <p className="text-sm text-[var(--foreground-muted)]">
                        Activity content coming soon...
                        </p>
                    </div>
                    )}
                </div>
            </div>

            {/* Right Column - Action Card (33% width) */}
            <VaultActionCard vaultData={vaultData} />
        </div>
        </div>

    </div>
  );
}

