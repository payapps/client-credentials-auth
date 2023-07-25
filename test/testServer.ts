import crypto from 'crypto';
import express, { Express, Request, Response } from 'express';
import { Server } from 'node:http';

const expressApp: Express = express();
let httpServer: Server;

interface AccessToken {
  accessToken?: string;
  expiry?: Date;
}

const port = 5501;
const accessTokens: { [key: string]: AccessToken } = {};
let callIndex = 0;

expressApp.get('/.well-known/openid-configuration', (request: Request, response: Response) => {
  console.log(new Date().toJSON(), 'GET /.well-known/openid-configuration');
  response.send(`{
    "issuer": "http://localhost:${port}",
    "token_endpoint": "http://localhost:${port}/connect/token"
  }`);
});

expressApp.post(
  '/connect/token',
  express.urlencoded({ extended: true }),
  (request: Request<string>, response: Response) => {
    const authorizationHeader = request.header('Authorization')?.split(' ');
    if (!authorizationHeader || authorizationHeader.length !== 2) {
      console.log(new Date().toJSON(), `POST /connect/token body 401: missing authorization header`);
      response.sendStatus(401);
      return;
    }
    authorizationHeader[1] = atob(authorizationHeader[1]);
    console.log(
      new Date().toJSON(),
      `POST /connect/token authorization:`,
      authorizationHeader?.[0],
      authorizationHeader?.[1],
      request.body,
      'body:',
    );
    const accessToken = crypto.randomBytes(64).toString('base64url');
    const expiresIn = 900;
    accessTokens[accessToken] = { accessToken, expiry: new Date(new Date().getTime() + expiresIn * 1000) };
    console.log(new Date().toJSON(), `POST /connect/token issued: ${accessToken}`);
    response.send(`{ "access_token": "${accessToken}", "expires_in": ${expiresIn} }`);
  },
);

expressApp.get('/secure', (request: Request, response: Response) => {
  callIndex++;
  if (callIndex === 3) {
    console.log(new Date().toJSON(), `GET /secure 401: callIndex === 3 (trigger token re-issue retry)`);
    response.sendStatus(401);
    return;
  }
  const authorization = request.header('Authorization');
  if (!authorization) {
    console.log(new Date().toJSON(), `GET /secure 401: missing bearer token`);
    response.sendStatus(401);
    return;
  }
  const tokens = authorization?.split(' ');
  if (!tokens || tokens.length !== 2 || tokens[0] !== 'bearer') {
    console.log(new Date().toJSON(), `GET /secure 401: invalid bearer token`);
    response.sendStatus(401);
    return;
  }
  const accessToken = accessTokens[tokens[1]];
  if (!accessToken) {
    console.log(new Date().toJSON(), `GET /secure 401: access token not found`);
    response.sendStatus(401);
    return;
  }
  if (!accessToken.expiry || accessToken.expiry < new Date()) {
    console.log(new Date().toJSON(), `GET /secure 401: access token expired`);
    delete accessTokens[tokens[1]];
    response.sendStatus(401);
    return;
  }
  console.log(new Date().toJSON(), `GET /secure 200`);
  response.send('Secure content');
});

expressApp.get('/insecure', (request: Request, response: Response) => {
  console.log(new Date().toJSON(), `GET /insecure 200`);
  response.send('Insecure content');
});

expressApp.use(express.urlencoded({ extended: true }));

export const start = () => {
  httpServer = expressApp.listen(port, () => {
    console.log(new Date().toJSON(), `server is running at http://localhost:${port}`);
  });
};

export const stop = () => {
  httpServer.close();
};
