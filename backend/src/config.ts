import { cleanEnv, str, num } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development','production','test'] }),
  PORT: num({ default: 4000 }),
  GNEWS_API_KEY: str(),
  DATABASE_URL: str({ default: '' }),
});