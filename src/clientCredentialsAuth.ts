import { BaseClient, custom, Issuer, TokenSet } from 'openid-client';
import { ClientOptions, defaultClientOptions } from './clientOptions';
import { CredentialsClientOptions } from './credentialsClientOptions';
import { CredentialsStore } from './credentialsStore';
import { DiscoveryOptions, defaultDiscoveryOptions } from './discoveryOptions';

export interface ClientCredentialsAuthOptions {
  clientOptions?: ClientOptions;
  credentialsStore?: CredentialsStore;
  discoveryOptions?: DiscoveryOptions;
}

export class ClientCredentialsAuth {
  readonly accessTokens: { [key: string]: CredentialsClientToken };
  readonly clientOptions: ClientOptions;
  readonly credentialsClientOptions: { [key: string]: CredentialsClientOptions };
  readonly credentialsStore: CredentialsStore;
  readonly discoveryOptions: DiscoveryOptions;
  readonly discoveries: { [key: string]: Discovery };

  constructor({ clientOptions, credentialsStore, discoveryOptions }: ClientCredentialsAuthOptions = {}) {
    this.clientOptions = clientOptions ?? defaultClientOptions;
    this.credentialsStore = credentialsStore;
    this.discoveryOptions = discoveryOptions ?? defaultDiscoveryOptions;
    this.accessTokens = {};
    this.credentialsClientOptions = {};
    this.discoveries = {};
    custom.setHttpOptionsDefaults({ timeout: 30000 });
  }

  addClient(clientName: string, credentialsClientOptions: CredentialsClientOptions): void {
    this.credentialsClientOptions[clientName] = credentialsClientOptions;
  }

  clearClientToken(clientName: string): void {
    delete this.accessTokens[clientName];
  }

  async getClientToken(
    clientName: string,
    credentialsClientOptions?: CredentialsClientOptions,
  ): Promise<string | null> {
    // Check for already resolved
    const token = this.accessTokens[clientName];
    if (token) {
      if (token.expiry > new Date()) {
        return token.accessToken;
      }
      // Reissue the token
      delete this.accessTokens[clientName];
    }
    // Resolve credentials client options
    if (!credentialsClientOptions) {
      credentialsClientOptions = this.credentialsClientOptions[clientName];
      if (!credentialsClientOptions) {
        if (!this.credentialsStore) {
          throw Error(
            'getClientToken: Unable to resolve credentials client options.  Supply as a parameter, or configure a credentials store.',
          );
        }
        credentialsClientOptions = await this.credentialsStore.getCredentialsClientOptions(clientName);
        this.credentialsClientOptions[clientName] = credentialsClientOptions;
      }
    }
    // Resolve issuer
    const issuer = await this.getDiscovery(credentialsClientOptions.oidcProviderAddress);
    // Resolve the token
    const accessToken = await this.getToken(issuer, clientName, credentialsClientOptions);
    return accessToken;
  }

  private async getDiscovery(oidcProviderAddress: string): Promise<Discovery> {
    let discovery = this.discoveries[oidcProviderAddress];
    if (discovery) {
      if (discovery.expiry > new Date()) {
        return discovery;
      }
      delete this.discoveries[oidcProviderAddress];
    }
    let attempt = 0;
    let oidcIssuer: Issuer<BaseClient> | null = null;
    while (!oidcIssuer) {
      try {
        oidcIssuer = await Issuer.discover(oidcProviderAddress);
      } catch (error) {
        attempt++;
        if (attempt <= this.discoveryOptions.maxRetryAttempts && this.isRetryableError(error)) {
          await this.delay(attempt, this.discoveryOptions.retryDelayMilliseconds);
        } else {
          throw Error(
            `getDiscovery: Unable to resolve discovery document from: ${oidcProviderAddress}\r\nError: (${error})`,
          );
        }
      }
    }
    discovery = {
      issuer: oidcIssuer,
      expiry: new Date(new Date().getTime() + this.discoveryOptions.cacheTimeMillseconds),
    };
    this.discoveries[oidcProviderAddress] = discovery;
    return discovery;
  }

  private async getToken(
    discovery: Discovery,
    clientName: string,
    credentialsClientOptions: CredentialsClientOptions,
  ): Promise<string> {
    let attempt = 0;
    let tokenSet: TokenSet | null = null;
    while (!tokenSet) {
      try {
        const client = new discovery.issuer.Client({
          client_id: credentialsClientOptions.clientId,
          client_secret: credentialsClientOptions.clientSecret,
        });
        const grantBody = { grant_type: 'client_credentials', scope: credentialsClientOptions.scope };
        tokenSet = await client.grant(grantBody);
      } catch (error) {
        attempt++;
        if (attempt <= this.clientOptions.maxRetryAttempts && this.isRetryableError(error)) {
          await this.delay(attempt, this.clientOptions.retryDelayMilliseconds);
        } else {
          throw Error(`getToken: Unable to obtain token for clientName: ${clientName}\r\nError: (${error})`);
        }
      }
    }
    const accessToken = tokenSet.access_token;
    if (accessToken === undefined || accessToken === null || accessToken === '') {
      throw Error(
        `getToken: Unable to obtain token for clientName: ${clientName}\r\nError: No access token in response`,
      );
    }
    const expirySeconds = tokenSet.expires_in;
    if (expirySeconds === undefined || expirySeconds === null || Number.isNaN(expirySeconds)) {
      throw Error(
        `getToken: Unable to obtain token for clientName: ${clientName}\r\nError: No token expiry in response`,
      );
    }
    this.accessTokens[clientName] = {
      accessToken,
      expiry: new Date(new Date().getTime() + expirySeconds * 1000),
    };
    return tokenSet.access_token;
  }

  private async delay(attempt: number, milliseconds: number): Promise<void> {
    // Use exponential back off
    const delayMilliseconds = Math.pow(2, attempt - 1) * milliseconds;
    return new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
  }

  private isRetryableError(error: any): boolean {
    if (
      error.message &&
      (error.message.includes('connect ECONNREFUSED') ||
        error.message.includes('408 Request Timeout') ||
        error.message.includes('502 Bad Gateway') ||
        error.message.includes('503 Service Unavailable') ||
        error.message.includes('504 Gateway Timeout'))
    ) {
      return true;
    }
    return false;
  }
}

class CredentialsClientToken {
  accessToken: string;
  expiry: Date;
}

class Discovery {
  issuer: Issuer<BaseClient>;
  expiry: Date;
}
