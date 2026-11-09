import { defineEventHandler } from "h3";
import { listDir } from "../../utils/dirStore";
import type { Dir } from "../../../shared/types/dir";

// Acesso (operacional e administrador) já é imposto por server/middleware/auth.ts via
// sectionForApiPath("/api/dir") → "dir"; a DIR não tem escopo por linha.
export default defineEventHandler(async (): Promise<Dir[]> => {
  return await listDir();
});
