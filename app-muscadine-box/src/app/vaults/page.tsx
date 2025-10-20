'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function VaultsContent() {
    const searchParams = useSearchParams();
    const vaultAddress = searchParams.get('address');

    return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-var(--nav-bar-height))]">
            <div className="flex flex-col items-center gap-4 p-8 bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)]">
                <h1 className="text-2xl font-bold text-[var(--foreground)]">Vault Interaction</h1>
                
                {vaultAddress ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-[var(--foreground-secondary)]">Vault Address:</p>
                        <p className="text-lg font-mono text-[var(--foreground)] bg-[var(--surface-elevated)] p-4 rounded border border-[var(--border)]">
                            {vaultAddress}
                        </p>
                    </div>
                ) : (
                    <p className="text-sm text-[var(--foreground-muted)]">No vault address provided</p>
                )}
            </div>
        </div>
    );
}

export default function VaultsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-[calc(100vh-var(--nav-bar-height))]">
                <p className="text-sm text-[var(--foreground-muted)]">Loading...</p>
            </div>
        }>
            <VaultsContent />
        </Suspense>
    );
}

