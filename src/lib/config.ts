import { getCurrentNetworkConfig } from '@/providers/network-config-provider';

// Get the current network configuration from localStorage (or default)
export const config = getCurrentNetworkConfig();

export function validateConfig() {
  if (!config.NILLION_API_KEY) {
    throw new Error('NILLION_API_KEY is required - please set it in the Network Configuration settings');
  }
  
  // Validate network config exists
  if (!config.NILAUTH_URL || !config.NILDB_NODES.length) {
    throw new Error('Network configuration is invalid - please check your settings');
  }
}