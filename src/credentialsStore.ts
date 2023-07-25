import { CredentialsClientOptions } from './credentialsClientOptions';

export interface CredentialsStore {
  getCredentialsClientOptions: (clientName: string) => Promise<CredentialsClientOptions>;
}
