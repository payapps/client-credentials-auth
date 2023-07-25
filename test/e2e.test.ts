import { ClientCredentialsAuth } from '../src/clientCredentialsAuth';
import { CredentialsClientOptions } from '../src/credentialsClientOptions';

describe('E2E tests', () => {
  // Use this to test a local instance of Payapps.Identity listening on localhost:5296
  it.skip('Gets the real access token from Payapps.Identity', async () => {
    const clientCredentialsAuth = new ClientCredentialsAuth();
    const options: CredentialsClientOptions = {
      clientId: 'progresspay-integration-test',
      clientSecret: 'topsecret',
      oidcProviderAddress: 'http://localhost:5296',
      scope: 'IntegrationApiClient',
    };
    const accessToken1 = await clientCredentialsAuth.getClientToken(options.clientId, options);
    expect(accessToken1).not.toBeNull();
    const accessToken2 = await clientCredentialsAuth.getClientToken(options.clientId, options);
    expect(accessToken2).not.toBeNull();
    console.log(accessToken1);
  }, 120000);
});
