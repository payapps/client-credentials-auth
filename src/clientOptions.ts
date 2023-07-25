export type ClientOptions = {
  maxRetryAttempts: number;
  retryDelayMilliseconds: number;
};

export const defaultClientOptions: ClientOptions = {
  maxRetryAttempts: 5,
  retryDelayMilliseconds: 50,
};
