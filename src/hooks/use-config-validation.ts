'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useNetworkConfig } from '@/providers/network-config-provider';

export function useConfigValidation() {
  const { currentConfig } = useNetworkConfig();
  const pathname = usePathname();
  const [shouldShowSettings, setShouldShowSettings] = useState(false);
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Wait a bit for the config to load from localStorage
    const timer = setTimeout(() => {
      setIsInitialized(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Don't run validation until config is initialized
    if (!isInitialized) return;

    // Only validate on non-home pages
    if (pathname !== '/') {
      const hasApiKey = currentConfig.NILLION_API_KEY && currentConfig.NILLION_API_KEY.trim() !== '';
      const hasWallet = currentConfig.WALLET_ADDRESS && currentConfig.WALLET_ADDRESS.trim() !== '';
      const hasValidAuth =
        currentConfig.SIGNER_MODE === 'web3' ? hasWallet : hasApiKey;
      
      if (!hasValidAuth && !hasBeenDismissed) {
        setShouldShowSettings(true);
      } else if (hasValidAuth) {
        // Reset dismissal state when auth is present
        setHasBeenDismissed(false);
        setShouldShowSettings(false);
      }
    } else {
      // Reset state when on home page
      setShouldShowSettings(false);
      setHasBeenDismissed(false);
    }
  }, [
    pathname,
    currentConfig.NILLION_API_KEY,
    currentConfig.SIGNER_MODE,
    currentConfig.WALLET_ADDRESS,
    hasBeenDismissed,
    isInitialized,
  ]);

  const dismissSettings = () => {
    setShouldShowSettings(false);
    setHasBeenDismissed(true);
  };

  return {
    shouldShowSettings,
    dismissSettings,
    isApiKeyMissing:
      currentConfig.SIGNER_MODE === 'apiKey' &&
      (!currentConfig.NILLION_API_KEY || currentConfig.NILLION_API_KEY.trim() === ''),
  };
}