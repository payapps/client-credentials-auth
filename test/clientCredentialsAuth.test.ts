import { Issuer } from 'openid-client';

import { ClientCredentialsAuth, ClientCredentialsAuthOptions } from '../src/clientCredentialsAuth';
import { CredentialsClientOptions } from '../src/credentialsClientOptions';
import { CredentialsStore } from '../src/credentialsStore';

const clientId = 'test-client';
const clientSecret = 'not-a-secret';
const oidcProviderAddress = 'http://localhost';
const scope = 'test-scope';
const accessToken = 'testaccesstoken';
const options: CredentialsClientOptions = { clientId, clientSecret, oidcProviderAddress, scope };
let mockGrant: jest.Mock<any, any, any>;
let mockDiscover: jest.Mock<any, any, any>;
let mockClient: jest.Mock<any, any, any>;

describe('ClientCredentialsAuth tests', () => {
  it('Gets an access token using passed options', async () => {
    // Arrange
    setupMocks();
    const clientCredentialsAuth = new ClientCredentialsAuth();
    // Act
    const result = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert
    expect(result).toEqual(accessToken);
    expect(mockDiscover).toBeCalledWith(oidcProviderAddress);
    const clientArg = mockClient.mock.calls[0][0];
    expect(clientArg.client_id).toEqual(clientId);
    expect(clientArg.client_secret).toEqual(clientSecret);
    const grantArg = mockGrant.mock.calls[0][0];
    expect(grantArg.grant_type).toEqual('client_credentials');
    expect(grantArg.scope).toEqual(scope);
  });

  it('Gets an access token using a named client via credentials store', async () => {
    // Arrange
    setupMocks();
    const credentialsStore: CredentialsStore = {
      getCredentialsClientOptions: jest.fn().mockImplementation(() => {
        return Promise.resolve<CredentialsClientOptions>({
          clientId,
          clientSecret,
          oidcProviderAddress,
          scope,
        });
      }),
    };
    const clientCredentialsAuth = new ClientCredentialsAuth({ credentialsStore });
    // Act
    const result = await clientCredentialsAuth.getClientToken(options.clientId);
    // Assert
    expect(result).toEqual(accessToken);
  });

  it('Gets an access token using a preconfigured named client', async () => {
    // Arrange
    setupMocks();
    const clientCredentialsAuth = new ClientCredentialsAuth();
    // Act
    clientCredentialsAuth.addClient(options.clientId, options);
    const result = await clientCredentialsAuth.getClientToken(options.clientId);
    // Assert
    expect(result).toEqual(accessToken);
  });

  it('Throws when using a non-existent named client with no credentials store', async () => {
    // Arrange
    setupMocks();
    const clientCredentialsAuth = new ClientCredentialsAuth();
    // Act & Assert
    await expect(clientCredentialsAuth.getClientToken(options.clientId)).rejects.toThrow(
      /Unable to resolve credentials client options/,
    );
  });

  it('Throws when a bad access token is received', async () => {
    // Arrange
    setupMocks({ accessToken: '' });
    const clientCredentialsAuth = new ClientCredentialsAuth();
    // Act & Assert
    await expect(clientCredentialsAuth.getClientToken(options.clientId, options)).rejects.toThrow(
      /Error: No access token in response/,
    );
  });

  it('Throws when a bad token expiry is received', async () => {
    // Arrange
    setupMocks({ expiresIn: NaN });
    const clientCredentialsAuth = new ClientCredentialsAuth();
    // Act & Assert
    await expect(clientCredentialsAuth.getClientToken(options.clientId, options)).rejects.toThrow(
      /Error: No token expiry in response/,
    );
  });

  it('Caches and clears the access token', async () => {
    // Arrange
    setupMocks();
    const clientCredentialsAuth = new ClientCredentialsAuth();
    // Act 1 (discovery & token lookup)
    const result1 = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert 1
    expect(result1).toEqual(accessToken);
    expect(mockDiscover).toBeCalledWith(oidcProviderAddress);
    // Act 2 (should skip discovery & token lookup)
    const result2 = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert 2 (no extra lookups)
    expect(result2).toEqual(accessToken);
    expect(mockDiscover).toBeCalledTimes(1);
    expect(mockGrant).toBeCalledTimes(1);
    // Act 3 (clear the cached token)
    clientCredentialsAuth.clearClientToken(options.clientId);
    const result3 = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert 3 (extra token lookup)
    expect(result3).toEqual(accessToken);
    expect(mockDiscover).toBeCalledTimes(1);
    expect(mockGrant).toBeCalledTimes(2);
  });

  it('Caches the discovery data', async () => {
    // Arrange (access token expires immediately)
    setupMocks({ expiresIn: 0 });
    const clientCredentialsAuth = new ClientCredentialsAuth();
    // Act 1 (discovery lookup)
    const result1 = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert 1
    expect(result1).toEqual(accessToken);
    expect(mockDiscover).toBeCalledWith(oidcProviderAddress);
    // Act 2 (should skip discovery lookup)
    const result2 = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert 2 (discovery lookup is not called a second time)
    expect(result2).toEqual(accessToken);
    expect(mockDiscover).toBeCalledTimes(1);
    expect(mockGrant).toBeCalledTimes(2);
  });

  it('Expires cached discovery', async () => {
    // Arrange (token expires immediately, discovery not cached)
    setupMocks({ expiresIn: 0 });
    const noDiscoveryCacheOptions: ClientCredentialsAuthOptions = {
      discoveryOptions: {
        cacheTimeMillseconds: 0,
        maxRetryAttempts: 0,
        retryDelayMilliseconds: 0,
      },
    };
    const clientCredentialsAuth = new ClientCredentialsAuth(noDiscoveryCacheOptions);
    // Act 1 (discovery lookup)
    const result1 = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert 1
    expect(result1).toEqual(accessToken);
    expect(mockDiscover).toBeCalledWith(oidcProviderAddress);
    // Act 2 (should repeat discovery lookup)
    const result2 = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert 1
    expect(result2).toEqual(accessToken);
    expect(mockDiscover).toBeCalledTimes(2);
  });

  it('Successfully retries discovery errors', async () => {
    // Arrange
    const discover = jest
      .fn()
      .mockRejectedValueOnce(new Error(' connect ECONNREFUSED '))
      .mockRejectedValueOnce(new Error(' 408 Request Timeout '))
      .mockRejectedValueOnce(new Error(' 502 Bad Gateway '))
      .mockRejectedValueOnce(new Error(' 503 Service Unavailable '))
      .mockRejectedValueOnce(new Error(' 504 Gateway Timeout '))
      .mockResolvedValueOnce({ Client: mockClient });
    setupMocks({ discover });
    const discoveryRetryOptions: ClientCredentialsAuthOptions = {
      discoveryOptions: {
        cacheTimeMillseconds: 0,
        maxRetryAttempts: 6,
        retryDelayMilliseconds: 1,
      },
    };
    const clientCredentialsAuth = new ClientCredentialsAuth(discoveryRetryOptions);
    // Act
    const result = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert
    expect(result).toEqual(accessToken);
    expect(discover).toBeCalledTimes(6);
  });

  it('Throws for a non-retryable discovery error', async () => {
    // Arrange
    const discover = jest.fn().mockRejectedValueOnce(new Error(' 404 Not Found '));
    setupMocks({ expiresIn: 0, discover });
    const clientCredentialsAuth = new ClientCredentialsAuth();
    // Act & Assert
    await expect(clientCredentialsAuth.getClientToken(options.clientId, options)).rejects.toThrow(/404 Not Found/);
  });

  it('Successfully retries token errors', async () => {
    // Arrange
    const grant = jest.fn().mockRejectedValueOnce(new Error(' connect ECONNREFUSED ')).mockResolvedValueOnce({
      access_token: accessToken,
      expires_in: 900,
    });
    setupMocks({ grant });
    const clientRetryOptions: ClientCredentialsAuthOptions = {
      clientOptions: {
        maxRetryAttempts: 2,
        retryDelayMilliseconds: 1,
      },
    };
    const clientCredentialsAuth = new ClientCredentialsAuth(clientRetryOptions);
    // Act
    const result = await clientCredentialsAuth.getClientToken(options.clientId, options);
    // Assert
    expect(result).toEqual(accessToken);
    expect(grant).toBeCalledTimes(2);
  });

  it('Throws for non-retryable token error', async () => {
    // Arrange
    const grant = jest.fn().mockRejectedValueOnce(new Error(' 404 Not Found '));
    setupMocks({ grant });
    const clientCredentialsAuth = new ClientCredentialsAuth();
    // Act & Assert
    await expect(clientCredentialsAuth.getClientToken(options.clientId, options)).rejects.toThrow(/404 Not Found/);
  });
});

const setupMocks = ({
  accessToken: accessTokenOverride,
  discover,
  expiresIn,
  grant,
}: {
  accessToken?: string;
  discover?: jest.Mock<any, any, any>;
  expiresIn?: number;
  grant?: jest.Mock<any, any, any>;
} = {}) => {
  mockGrant =
    grant ??
    jest.fn().mockImplementation(() => ({
      access_token: accessTokenOverride ?? accessToken,
      expires_in: expiresIn ?? 900,
    }));
  const mockBaseClient = { grant: mockGrant };
  mockClient = jest.fn().mockImplementation(() => mockBaseClient);
  mockDiscover = discover ?? jest.fn().mockReturnValue({ Client: mockClient });
  Issuer.discover = mockDiscover;
};
