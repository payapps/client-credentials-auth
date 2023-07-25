export type DiscoveryOptions = {
  cacheTimeMillseconds: number;
  maxRetryAttempts: number;
  retryDelayMilliseconds: number;
};

export const defaultDiscoveryOptions: DiscoveryOptions = {
  cacheTimeMillseconds: 1800000, // 30 minutes
  maxRetryAttempts: 5,
  retryDelayMilliseconds: 50,
};
