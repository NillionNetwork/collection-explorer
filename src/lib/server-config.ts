import { TESTNET_CONFIG } from './network-config';

export type NetworkConfigType = typeof TESTNET_CONFIG & {
  NILLION_API_KEY: string;
};

// Server-side config that gets populated from request headers
export function getConfigFromHeaders(headers: Headers): NetworkConfigType {
  const configHeader = headers.get('x-nillion-config');
  
  if (configHeader) {
    try {
      return JSON.parse(configHeader);
    } catch (e) {
      // Fall back to default config if parsing fails
    }
  }
  
  // Fallback to default config - this will fail validation if no API key
  return {
    ...TESTNET_CONFIG,
    NILLION_API_KEY: '',
  };
}

export function validateServerConfig(config: NetworkConfigType) {
  if (!config.NILLION_API_KEY) {
    throw new Error('NILLION_API_KEY is required - please set it in the Network Configuration settings');
  }
  
  if (!config.NILAUTH_URL || !config.NILDB_NODES.length) {
    throw new Error('Network configuration is invalid - please check your settings');
  }
}