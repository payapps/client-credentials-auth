## client-credentials-auth

Library for resolving access tokens using the OpenID Connect client credentials flow (OIDC `client_credentials` grant).  Designed to allow easy addition of  `Authorization` header bearer tokens to outgoing API requests, e.g. using an Axios request interceptor.

![main branch](https://github.com/payapps/client-credentials-auth/actions/workflows/main.yml/badge.svg)
![coverage](https://raw.githubusercontent.com/payapps/client-credentials-auth/badges/.badges/coverage.svg)

Discovery information and tokens are automatically cached in memory according configuration (discovery) or the token expiry (access tokens), and transparently reloaded as required.  OIDC discovery and token issuance is handled internally by the [`openid-client`](https://www.npmjs.com/package/openid-client) package.

Client credentials can be pre-configured (using ```.addClient('clientname', options)```), or resolved at runtime using a credentials store callback.  Runtime resolution allows easy async resolution of client secrets from a secret store, or environment variables.

See the `integration.test.ts` for a working example using Axios.

## Usage

1.  Create a global (using default options) and add a pre-configured client

```
const clientCredentialsAuth = new ClientCredentialsAuth();
clientCredentialsAuth.addClient("test-api", {
    clientId: "test-api-client-id",
    clientSecret: "not-very-secret",
    oidcProviderAddress: "http://localhost:5123",
    scope: "testscope",
});
```

2.  Setup your Axios request interceptor

```
axios.interceptors.request.use(async (config) => {
    const token = await clientCredentialsAuth.getClientToken("test-api");
    config.headers.Authorization = `bearer ${token}`;
    return config;
});
```

3. Setup your Axios response error interceptor

```
axios.interceptors.response.use(undefined, async (error) => {
    const { config, isRetry, response } = error;
    if (!isRetry && response && response.status === 401) {
        clientCredentialsAuth.clearClientToken("test-api");
        config.isRetry = true;
        return axios(config);
    } else {
        return Promise.reject(error);
    }
});
```


## Available Scripts

In the project directory, you can run:

### `npm run build`

Builds the library to the `dist` folder.

### `npm run coverage`

Launches the test runner capturing code coverage, then opens the coverage report.

### `npm run lint`

Runs the linter.

### `npm run prettier:check`

Runs prettier to check for any changes required.

### `npm test`

Runs all tests.

### `npm run test:coverage`

Runs all tests with coverage.

