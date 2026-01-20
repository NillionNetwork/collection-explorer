// Nillion Network Configuration
// These are public testnet endpoints and safe to include in code

export const TESTNET_CONFIG = {
  NILCHAIN_URL: 'http://rpc.testnet.nilchain-rpc-proxy.nilogy.xyz',
  NILAUTH_URL: 'https://nilauth-1bc3.staging.nillion.network',
  NILDB_NODES: [
    'https://nildb-stg-n1.nillion.network',
    'https://nildb-stg-n2.nillion.network',
    'https://nildb-stg-n3.nillion.network',
  ],
} as const;

export const MAINNET_CONFIG = {
  NILCHAIN_URL: 'http://nilchain-rpc.nillion.network',
  NILAUTH_URL: 'https://nilauth-cf7f.nillion.network',
  NILDB_NODES: [
    'https://nildb-5ab1.nillion.network',
    'https://nildb-906d.kjnodes.com',
    'https://nildb-8001.cloudician.xyz',
  ],
} as const;

// Use the primary testnet config by default
export const NETWORK_CONFIG = TESTNET_CONFIG;
