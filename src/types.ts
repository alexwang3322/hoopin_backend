export interface Env {
  DB: D1Database;
  DEV_AUTH: string;
  CLERK_SECRET_KEY: string;
  CLERK_WEBHOOK_SIGNING_SECRET: string;
  SEED_REFRESH_ADMIN_USER_ID?: string;
}

export interface AppVariables {
  viewerId: string | null;
}
