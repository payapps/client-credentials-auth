import axios from 'axios';
import { ClientCredentialsAuth } from '../src/clientCredentialsAuth';
import { CredentialsStore } from '../src/credentialsStore';
import { start, stop } from './testServer';

describe('Integration tests', () => {
  beforeAll(() => {
    start();
  });
  afterAll(() => {
    stop();
  });

  it('Gets the access token from the fake OIDC provider', async () => {
    // Make an insecure server call
    const insecureResponse = await axios.get('http://localhost:5501/insecure');
    expect(insecureResponse.status).toEqual(200);
    // Make a secure server call that should return a 401
    const secureResponse1 = await axios.get('http://localhost:5501/secure', { validateStatus: () => true });
    expect(secureResponse1.status).toEqual(401);
    // Example: setup auth
    const clientId = 'test-client';
    const credentialsStore: CredentialsStore = {
      getCredentialsClientOptions: async (clientName) => {
        if (clientName === clientId) {
          return {
            clientId,
            clientSecret: 'not-a-secret',
            oidcProviderAddress: 'http://localhost:5501',
            scope: 'test-scope',
          };
        }
        throw Error('Unknown client name');
      },
    };
    const clientCredentialsAuth = new ClientCredentialsAuth({ credentialsStore });
    // Example: Setup axios request interceptor to add the authentication header
    axios.interceptors.request.use(async (config) => {
      const token = await clientCredentialsAuth.getClientToken(clientId);
      config.headers.Authorization = `bearer ${token}`;
      return config;
    });
    // Make an secure server call that should succeed
    const secureResponse2 = await axios.get('http://localhost:5501/secure');
    expect(secureResponse2.status).toEqual(200);
    // Example: setup axios response interceptor to retry any "401 Unauthorized" the one time only
    // This transparently handles race conditions where the token is unexpired (close to expiry) in the client,
    //   but expired by the time it reaches the server
    axios.interceptors.response.use(undefined, async (error) => {
      const { config, isRetry, response } = error;
      if (!isRetry && response && response.status === 401) {
        console.log('axios response interceptor retry');
        // Clear any cached token as it may have just expired & retry
        clientCredentialsAuth.clearClientToken(clientId);
        config.isRetry = true;
        return axios(config);
      } else {
        console.log('axios response interceptor error');
        return Promise.reject(error);
      }
    });
    // Make another secure server call that should succeed after reissuing the token
    // Note: Don't use "{ validateStatus: () => true }", as this prevents the error interceptor from engaging
    const secureResponse3 = await axios.get('http://localhost:5501/secure');
    expect(secureResponse3.status).toEqual(200);
  });
});
