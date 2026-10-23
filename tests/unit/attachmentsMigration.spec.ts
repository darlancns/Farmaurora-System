import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES, canReadSection, canWriteSection } from "../../shared/utils/rbac";
import { ATTACHMENTS_BUCKET, SAFE_ATTACHMENT_KEY, attachmentObjectPath } from "../../shared/utils/attachments";

// Guarda de divergência: os cargos das policies de RLS do bucket de anexos
// (supabase/migrations/*attachments_bucket.sql) precisam ser exatamente os da
// seção "patients" de shared/utils/rbac.ts — senão o acesso direto ao Storage
// e o RBAC do servidor passam a discordar sem ninguém notar.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const migrationFile = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_attachments_bucket.sql"));
const sql = migrationFile ? readFileSync(join(MIGRATIONS_DIR, migrationFile), "utf-8") : "";

function policyBlock(name: string): string {
  const start = sql.indexOf(`create policy ${name} on storage.objects`);
  if (start === -1) return "";
  return sql.slice(start, sql.indexOf(";", start));
}

function rolesIn(block: string): string[][] {
  return [...block.matchAll(/attachments_role_in\(array\[([^\]]*)\]\)/g)].map((match) =>
    [...(match[1] ?? "").matchAll(/'([^']+)'/g)].map((role) => role[1]!).sort()
  );
}

const readRoles = ROLES.filter((role) => canReadSection(role, "patients")).sort();
const writeRoles = ROLES.filter((role) => canWriteSection(role, "patients")).sort();

describe("migration do bucket de anexos × rbac.ts", () => {
  it("o arquivo da migration existe", () => {
    expect(migrationFile).toBeDefined();
  });

  it("cria o bucket PRIVADO, só PNG, com limite de 20 MB", () => {
    expect(sql).toContain(`values ('${ATTACHMENTS_BUCKET}', '${ATTACHMENTS_BUCKET}', false, 20971520, array['image/png'])`);
    expect(sql).toContain("set public = false");
  });

  it("não cria nenhuma policy pro papel anon nem pra public", () => {
    expect(sql).not.toMatch(/to\s+(anon|public)\b/i);
  });

  it("select usa exatamente os cargos de leitura de 'patients'", () => {
    expect(rolesIn(policyBlock("attachments_select"))).toEqual([readRoles]);
  });

  it.each(["attachments_insert", "attachments_update", "attachments_delete"])(
    "%s usa exatamente os cargos de escrita de 'patients' (em todas as cláusulas)",
    (name) => {
      const found = rolesIn(policyBlock(name));
      expect(found.length).toBeGreaterThan(0);
      for (const roles of found) expect(roles).toEqual(writeRoles);
    }
  );

  it("toda policy restringe o bucket e o caminho <patientId>/<slot>.png", () => {
    for (const name of ["attachments_select", "attachments_insert", "attachments_update", "attachments_delete"]) {
      const block = policyBlock(name);
      expect(block, name).toContain(`bucket_id = '${ATTACHMENTS_BUCKET}'`);
      expect(block, name).toContain("name ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\\.png$'");
    }
  });
});

describe("caminho dos anexos", () => {
  it("segue <patientId>/<slotKey>.png", () => {
    expect(attachmentObjectPath("p_17_abc", "invoice_1")).toBe("p_17_abc/invoice_1.png");
  });

  it("o caminho gerado casa com a regex das policies", () => {
    const policyRegex = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.png$/;
    expect(policyRegex.test(attachmentObjectPath("p_1790688789197_39sfnp", "despachante_2"))).toBe(true);
  });

  it("SAFE_ATTACHMENT_KEY rejeita travessia de diretório e separadores", () => {
    for (const bad of ["../x", "a/b", "a.b", "", "a b", "..", "a\\b"]) {
      expect(SAFE_ATTACHMENT_KEY.test(bad), bad).toBe(false);
    }
    for (const good of ["p_1_abc", "invoice_1", "dsi", "servico"]) {
      expect(SAFE_ATTACHMENT_KEY.test(good), good).toBe(true);
    }
  });
});
