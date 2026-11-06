import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carregarEnvE2E } from "../e2e/_guards/envE2e";
import { lerEnv } from "../e2e/_guards/supabaseEnv";

// A suíte e2e só pode falar com o Supabase local, e a URL/chave dos specs vêm de UM lugar só.
// O incidente que isto fecha: guarda olhando o ambiente enquanto os specs liam URL + service key do
// `.env` de PRODUÇÃO (e alguns esvaziam tabelas inteiras).

const CHAVES = ["NUXT_PUBLIC_SUPABASE_URL", "NUXT_PUBLIC_SUPABASE_ANON_KEY", "NUXT_SUPABASE_SERVICE_ROLE_KEY"] as const;

describe("lerEnv (helper único dos specs)", () => {
  const salvo: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of CHAVES) salvo[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of CHAVES) {
      if (salvo[k] === undefined) delete process.env[k];
      else process.env[k] = salvo[k];
    }
  });

  it("devolve a URL e a service key do AMBIENTE quando a URL é local", () => {
    process.env.NUXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY = "chave-local";
    expect(lerEnv()).toEqual({ url: "http://127.0.0.1:54321", serviceKey: "chave-local" });
  });

  it("URL de produção: ABORTA antes de devolver qualquer credencial", () => {
    process.env.NUXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
    process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY = "chave-de-producao";
    expect(() => lerEnv()).toThrow(/abcdefgh\.supabase\.co.*não é local/);
  });

  it("sem URL no ambiente ABORTA — NÃO cai no .env do projeto (que aponta pra produção)", () => {
    delete process.env.NUXT_PUBLIC_SUPABASE_URL;
    delete process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY;
    // O .env real existe na raiz do repo (cwd dos testes). Se o helper ainda o lesse, devolveria a
    // URL de produção em vez de lançar.
    expect(() => lerEnv()).toThrow(/não definida|não é local/);
  });

  it("sem service key devolve vazio (o spec se pula) em vez de lançar", () => {
    process.env.NUXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    delete process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY;
    expect(lerEnv().serviceKey).toBe("");
  });
});

describe("carregarEnvE2E (.env.e2e)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "env-e2e-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function arquivo(conteudo: string): string {
    const caminho = join(dir, ".env.e2e");
    writeFileSync(caminho, conteudo, "utf-8");
    return caminho;
  }

  const OK = [
    "# comentário",
    "NUXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
    "NUXT_PUBLIC_SUPABASE_ANON_KEY=anon-local",
    "NUXT_SUPABASE_SERVICE_ROLE_KEY=service-local",
    "E2E_ADMIN_EMAIL=e2e.admin@farmaurora.com.br",
    "",
  ].join("\n");

  it("carrega as variáveis de um arquivo válido", () => {
    const env = carregarEnvE2E(arquivo(OK));
    expect(env.NUXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(env.NUXT_SUPABASE_SERVICE_ROLE_KEY).toBe("service-local");
    expect(env.E2E_ADMIN_EMAIL).toBe("e2e.admin@farmaurora.com.br");
  });

  it("arquivo inexistente: aborta orientando a criar o .env.e2e", () => {
    expect(() => carregarEnvE2E(join(dir, "nao-existe.env"))).toThrow(/não existe.*\.env\.e2e\.example/s);
  });

  it("URL de produção no arquivo: aborta nomeando o host", () => {
    const prod = OK.replace("http://127.0.0.1:54321", "https://abcdefgh.supabase.co");
    expect(() => carregarEnvE2E(arquivo(prod))).toThrow(/abcdefgh\.supabase\.co.*não é local/s);
  });

  it("falta de chave obrigatória: aborta listando quais", () => {
    const semService = OK.replace("NUXT_SUPABASE_SERVICE_ROLE_KEY=service-local\n", "NUXT_SUPABASE_SERVICE_ROLE_KEY=\n");
    expect(() => carregarEnvE2E(arquivo(semService))).toThrow(/não define NUXT_SUPABASE_SERVICE_ROLE_KEY/);
  });
});
