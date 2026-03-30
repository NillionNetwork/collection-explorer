import { Signer } from '@nillion/nuc';
import { SecretVaultBuilderClient } from '@nillion/secretvaults';
import type { NetworkConfigType } from './server-config';

// Server-side Nillion client that accepts config as parameter
export async function getNillionClient(
  config: NetworkConfigType,
  options?: { blindfold?: boolean; blindfoldSeed?: string }
): Promise<SecretVaultBuilderClient> {
  if (!config.NILLION_API_KEY) {
    throw new Error('NILLION_API_KEY is required - please set it in the Network Configuration settings');
  }

  const signer = Signer.fromPrivateKey(config.NILLION_API_KEY);
  const builderDid = await signer.getDid();

  // Create builder client
  const builder = await SecretVaultBuilderClient.from({
    signer,
    dbs: [...config.NILDB_NODES],
    ...(options?.blindfold
      ? {
          blindfold: {
            operation: 'store',
          },
        }
      : {}),
  });

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
