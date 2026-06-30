import { registerAs } from '@nestjs/config';

function parseCsv(value?: string) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
}

function defaultCorsOrigins() {
  const adminPort = process.env.PORTAPAY_ADMIN_PORT ?? '5173';
  return Array.from(new Set([
    `http://localhost:${adminPort}`,
    `http://127.0.0.1:${adminPort}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
  ]));
}

function redisConfig() {
  if (process.env.REDIS_URL) {
    const redisUrl = new URL(process.env.REDIS_URL);
    return {
      url: process.env.REDIS_URL,
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      username: decodeURIComponent(redisUrl.username || process.env.REDIS_USERNAME || ''),
      password: decodeURIComponent(redisUrl.password || process.env.REDIS_PASSWORD || ''),
      db: Number(redisUrl.pathname.replace('/', '') || process.env.REDIS_DB || 0),
      tls: redisUrl.protocol === 'rediss:' || process.env.REDIS_TLS === 'true',
    };
  }

  return {
    url: undefined,
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB ?? 0),
    tls: process.env.REDIS_TLS === 'true',
  };
}

function nombaEnv(prefix: 'TEST' | 'LIVE') {
  return {
    baseUrl: process.env[`NOMBA_${prefix}_BASE_URL`] ?? (prefix === 'TEST' ? 'https://sandbox.nomba.com' : 'https://api.nomba.com'),
    clientId: process.env[`NOMBA_${prefix}_CLIENT_ID`],
    clientSecret: process.env[`NOMBA_${prefix}_CLIENT_SECRET`],
    parentAccountId: process.env[`NOMBA_${prefix}_PARENT_ACCOUNT_ID`],
    subAccountId: process.env[`NOMBA_${prefix}_SUB_ACCOUNT_ID`],
    webhookSecret: process.env[`NOMBA_${prefix}_WEBHOOK_SECRET`],
  };
}

export default registerAs('app', () => {
  const nombaMode = process.env.NOMBA_ENV === 'live' ? 'live' : 'test';
  const nomba = nombaMode === 'live' ? nombaEnv('LIVE') : nombaEnv('TEST');

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? process.env.PORTAPAY_CORE_PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL,
    redis: redisConfig(),
    cors: {
      allowAll: process.env.CORS_ALLOW_ALL === 'true',
      allowedOrigins: parseCsv(process.env.CORS_ALLOWED_ORIGINS).length
        ? parseCsv(process.env.CORS_ALLOWED_ORIGINS)
        : defaultCorsOrigins(),
    },
    nomba: {
      mode: nombaMode,
      webhookUrl: process.env.NOMBA_WEBHOOK_URL,
      mock: process.env.NOMBA_MOCK === 'true',
      ...nomba,
    },
    admin: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      jwtSecret: process.env.JWT_ACCESS_SECRET,
    },
  };
});
