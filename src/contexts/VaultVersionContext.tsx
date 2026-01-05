'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type VaultVersion = 'v1' | 'v2' | 'all';

interface VaultVersionContextType {
  version: VaultVersion;
  setVersion: (version: VaultVersion) => void;
}

const VaultVersionContext = createContext<VaultVersionContextType | undefined>(undefined);

const VAULT_VERSION_STORAGE_KEY = 'muscadine-vault-version';

export function VaultVersionProvider({ children }: { children: ReactNode }) {
  // Safe SSR defaults - no localStorage access during render
  const [version, setVersionState] = useState<VaultVersion>('v1'); // Default to v1

  // Initialize version from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem(VAULT_VERSION_STORAGE_KEY) as VaultVersion | null;
    if (stored && (stored === 'v1' || stored === 'v2' || stored === 'all')) {
      setVersionState(stored);
    }
  }, []); // Run only once on mount

  // Persist version to localStorage
  const setVersion = (newVersion: VaultVersion) => {
    setVersionState(newVersion);
    if (typeof window !== 'undefined') {
      localStorage.setItem(VAULT_VERSION_STORAGE_KEY, newVersion);
    }
  };

  return (
    <VaultVersionContext.Provider value={{ version, setVersion }}>
      {children}
    </VaultVersionContext.Provider>
  );
}

export function useVaultVersion() {
  const context = useContext(VaultVersionContext);
  if (context === undefined) {
    throw new Error('useVaultVersion must be used within a VaultVersionProvider');
  }
  return context;
}

