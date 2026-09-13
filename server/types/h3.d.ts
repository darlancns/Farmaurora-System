import type { AuthUser } from "#shared/types/auth";

// Anexado pelo server/middleware/auth.ts em toda request.
declare module "h3" {
  interface H3EventContext {
    user: AuthUser | null;
  }
}

export {};
