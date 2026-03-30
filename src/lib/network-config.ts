// Nillion Network Configuration
// These are public testnet endpoints and safe to include in code

export const TESTNET_CONFIG = {
  NILDB_NODES: [
    'https://nildb-stg-n1.nillion.network',
    'https://nildb-stg-n2.nillion.network',
    'https://nildb-stg-n3.nillion.network',
  ],
} as const;

export const MAINNET_CONFIG = {
  NILDB_NODES: [
    'https://nildb-5ab1.nillion.network',
    'https://nildb-906d.kjnodes.com',
    'https://nildb-8001.cloudician.xyz',
  ],
} as const;
