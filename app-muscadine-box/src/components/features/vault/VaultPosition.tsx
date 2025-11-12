'use client';

import { useAccount } from 'wagmi';
import { MorphoVaultData } from '@/types/vault';
import { useWallet } from '@/contexts/WalletContext';
import { formatSmartCurrency } from '@/lib/formatter';

interface VaultPositionProps {
  vaultData: MorphoVaultData;
}

export default function VaultPosition({ vaultData }: VaultPositionProps) {
  const { isConnected } = useAccount();
  const { morphoHoldings } = useWallet();

  // Find the current vault position
  const currentVaultPosition = morphoHoldings.positions.find(
    pos => pos.vault.address.toLowerCase() === vaultData.address.toLowerCase()
  );

  const userVaultShares = currentVaultPosition ? 
    (parseFloat(currentVaultPosition.shares) / 1e18).toFixed(6) : '0';

  const userVaultValueUsd = currentVaultPosition ? 
    (parseFloat(currentVaultPosition.shares) / 1e18) * currentVaultPosition.vault.state.sharePriceUsd : 0;

  if (!isConnected) {
    return (
      <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6">
        <p className="text-sm text-[var(--foreground-muted)]">
          Connect your wallet to view your position
        </p>
      </div>
    );
  }

  if (!currentVaultPosition) {
    return (
      <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6">
        <p className="text-sm text-[var(--foreground-muted)]">
          No holdings in this vault
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6">
      <div className="bg-[var(--surface-elevated)] rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--foreground-secondary)]">Your Vault Shares</span>
          <span className="text-lg font-semibold text-[var(--primary)]">
            {userVaultShares}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--foreground-secondary)]">Share Price</span>
          <span className="text-base font-semibold text-[var(--foreground)]">
            ${currentVaultPosition.vault.state.sharePriceUsd.toFixed(4)}
          </span>
        </div>
        <div className="border-t border-[var(--border-subtle)] pt-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-[var(--success)]">Your Total Value</span>
            <span className="text-xl font-bold text-[var(--success)]">
              {formatSmartCurrency(userVaultValueUsd)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

