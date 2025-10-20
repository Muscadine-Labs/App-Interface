'use client';

import { useAccount } from 'wagmi';
import Dashboard from '@/components/Dashboard';
import ConnectScreen from '@/components/ConnectScreen';
import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const { isConnected, status } = useAccount();
  const [hydrated, setHydrated] = useState(false);
  const loadingStartTime = useRef<number | null>(null);
  const reloadTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Wait until client hydration
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Auto-reload if stuck on loading for more than 5 seconds
  useEffect(() => {
    const isLoading = !isConnected || status === 'reconnecting';
    
    if (isLoading && hydrated) {
      // Start tracking loading time
      if (loadingStartTime.current === null) {
        loadingStartTime.current = Date.now();
      }

      // Set up reload timer
      if (reloadTimerRef.current === null) {
        reloadTimerRef.current = setTimeout(() => {
          const elapsedTime = Date.now() - (loadingStartTime.current || 0);
          if (elapsedTime >= 5000) {
            console.warn('Page stuck on loading for 5+ seconds, reloading...');
            window.location.reload();
          }
        }, 5000);
      }
    } else {
      // Not loading anymore, reset timers
      loadingStartTime.current = null;
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [isConnected, status, hydrated]);

  // While SSR or reconnecting
  if (!isConnected || status === 'reconnecting') {
    return <div></div>;
  }

  // Client knows the true connection state
  return <>{isConnected ? <Dashboard /> : <ConnectScreen />}</>;
}
