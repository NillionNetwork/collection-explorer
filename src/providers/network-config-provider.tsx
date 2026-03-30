'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TESTNET_CONFIG } from '@/lib/network-config';

export type NetworkConfigType = typeof TESTNET_CONFIG & {
  NILLION_API_KEY: string;
  SIGNER_MODE: 'web3' | 'apiKey';
  WALLET_ADDRESS: string;
  WALLET_DID: string;
  WALLET_CHAIN_ID: number;
};

export type PresetType = 'testnet' | 'custom';

interface NetworkConfigContextType {
  currentConfig: NetworkConfigType;
  currentPreset: PresetType;
  setNetworkConfig: (config: NetworkConfigType, preset?: PresetType) => void;
}

const NetworkConfigContext = createContext<NetworkConfigContextType | undefined>(undefined);

const STORAGE_KEY = 'nillion-network-config';
const PRESET_KEY = 'nillion-network-preset';

// Default configuration with empty API key
const DEFAULT_CONFIG: NetworkConfigType = {
  ...TESTNET_CONFIG,
  NILLION_API_KEY: '',
  SIGNER_MODE: 'web3',
  WALLET_ADDRESS: '',
  WALLET_DID: '',
  WALLET_CHAIN_ID: 11155111,
};

export const PRESET_CONFIGS = {
  testnet: TESTNET_CONFIG,
};

export function NetworkConfigProvider({ children }: { children: ReactNode }) {
  const [currentConfig, setCurrentConfig] = useState<NetworkConfigType>(DEFAULT_CONFIG);
  const [currentPreset, setCurrentPreset] = useState<PresetType>('testnet');

  // Load saved config from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem(STORAGE_KEY);
    const savedPreset = localStorage.getItem(PRESET_KEY) as PresetType;
    
    if (savedConfig) {
      try {
        const parsedConfig = JSON.parse(savedConfig);
        setCurrentConfig({
          ...DEFAULT_CONFIG,
          ...parsedConfig,
        });
      } catch (e) {
        // Reset to default if config is corrupted
      }
    }
    
    if (savedPreset && ['testnet', 'custom'].includes(savedPreset)) {
      setCurrentPreset(savedPreset);
    }
  }, []);

  const setNetworkConfig = (config: NetworkConfigType, preset: PresetType = 'custom') => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    localStorage.setItem(PRESET_KEY, preset);
    // Force a page reload to ensure all components pick up the new config
    window.location.reload();
  };

  const value: NetworkConfigContextType = {
    currentConfig,
    currentPreset,
    setNetworkConfig,
  };

  return (
    <NetworkConfigContext.Provider value={value}>
      {children}
    </NetworkConfigContext.Provider>
  );
}

export function useNetworkConfig() {
  const context = useContext(NetworkConfigContext);
  if (!context) {
    throw new Error('useNetworkConfig must be used within NetworkConfigProvider');
  }
  return context;
}

// Helper to get current config without context (for initial load)
export function getCurrentNetworkConfig(): NetworkConfigType {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Return default if parsing fails
      }
    }
  }
  
  // Return default config if nothing is saved
  return DEFAULT_CONFIG;
}