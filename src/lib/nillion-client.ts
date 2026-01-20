import { Signer } from '@nillion/nuc';
import { NilauthClient } from '@nillion/nilauth-client';
import { SecretVaultBuilderClient } from '@nillion/secretvaults';
import type { NetworkConfigType } from './server-config';

// Server-side Nillion client that accepts config as parameter
export async function getNillionClient(config: NetworkConfigType): Promise<SecretVaultBuilderClient> {
  if (!config.NILLION_API_KEY) {
    throw new Error('NILLION_API_KEY is required - please set it in the Network Configuration settings');
  }

  const signer = Signer.fromPrivateKey(config.NILLION_API_KEY);
  const builderDid = await signer.getDid();
  const isTestnet = config.NILAUTH_URL.includes('staging') || config.NILAUTH_URL.includes('testnet');
  const nilauthClient = await NilauthClient.create({
    baseUrl: config.NILAUTH_URL,
    chainId: isTestnet ? 11155111 : 1,
  });

  // Create builder client
  const builder = await SecretVaultBuilderClient.from({
    signer,
    dbs: [...config.NILDB_NODES],
    nilauthClient,
  });

  await builder.refreshRootToken();

  // One-time registration check (only needed once per builder DID)
  try {
    await builder.readProfile();
  } catch (profileError) {
    try {
      await builder.register({
        did: builderDid.didString,
        name: 'Demo UI Builder',
      });
    } catch (registerError) {
      // Handle case where registration happened concurrently
      if (registerError instanceof Error && registerError.message.includes('duplicate key')) {
        // Already registered, continue
      } else {
        throw registerError;
      }
    }
  }

  return builder;
}

export function getBuilderSigner(apiKey: string): Signer {
  return Signer.fromPrivateKey(apiKey);
}

export async function getBuilderDid(apiKey: string): Promise<string> {
  const signer = getBuilderSigner(apiKey);
  const did = await signer.getDid();
  return did.didString;
}
