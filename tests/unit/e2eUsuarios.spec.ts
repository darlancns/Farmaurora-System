import { describe, expect, it } from "vitest";
import {
  CONSULTOR_NOME_PADRAO,
  CONTAS_E2E,
  appMetadataDe,
  definirNoEnvTexto,
  emailDe,
  gerarSenha,
  lerEnvTexto,
  planejarVariaveis,
  urlEhLoopback,
} from "../../scripts/lib/e2eUsuarios.mjs";
import { roleAppMetadata } from "../../server/utils/authUser";
import { CONSULTORES_PROCESSO } from "../../shared/constants/processos";
import { ROLES } from "../../shared/utils/rbac";
import { urlEhLocal } from "../e2e/_guards/supabaseLocal";
import { MIN_PASSWORD_LENGTH } from "../../shared/constants/conta";

// Peças puras de scripts/setup-e2e-local-users.mjs (contas dedicadas de teste e2e, só no Supabase local).

describe("CONTAS_E2E", () => {
  it("tem uma conta para cada cargo do sistema", () => {
    expect(CONTAS_E2E.map((c) => c.role).sort()).toEqual([...ROLES].sort());
  });

  it("o consultor padrão é um consultor válido (CONSULTORES_PROCESSO)", () => {
    expect(CONSULTORES_PROCESSO).toContain(CONSULTOR_NOME_PADRAO);
  });

  it("e-mails distintos e previsíveis por cargo", () => {
    const emails = CONTAS_E2E.map((c) => emailDe(c));
    expect(new Set(emails).size).toBe(4);
    expect(emailDe(CONTAS_E2E[0]!)).toBe("e2e.admin@farmaurora.com.br");
    expect(emailDe(CONTAS_E2E[0]!, "local.test")).toBe("e2e.admin@local.test");
  });
});

describe("appMetadataDe — mesmo formato que o app grava (roleAppMetadata)", () => {
  it.each(CONTAS_E2E.map((c) => [c.role, c] as const))("%s", (_role, conta) => {
    const doApp = roleAppMetadata(
      conta.role,
      conta.role === "consultor" ? (conta.consultorNome as (typeof CONSULTORES_PROCESSO)[number]) : undefined,
      conta.nome,
    );
    expect(appMetadataDe(conta)).toEqual(doApp);
  });

  it("consultorNome é null fora do cargo consultor", () => {
    const admin = CONTAS_E2E.find((c) => c.role === "administrador")!;
    expect(appMetadataDe(admin).consultorNome).toBeNull();
  });
});

describe("gerarSenha", () => {
  it("é longa, aleatória e atende o mínimo do app", () => {
    const a = gerarSenha();
    const b = gerarSenha();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(a).toMatch(/[a-z]/);
    expect(a).toMatch(/[A-Z]/);
    expect(a).toMatch(/\d/);
    expect(a).toMatch(/[^A-Za-z0-9]/);
  });
});

describe("urlEhLoopback — igual à guarda do Playwright", () => {
  const casos = [
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "http://[::1]:54321",
    "https://abcdefgh.supabase.co",
    "https://localhost.evil.com",
    "http://127.0.0.1.evil.com",
    "",
    "não é url",
  ];
  it.each(casos)("%s", (url) => {
    expect(urlEhLoopback(url)).toBe(urlEhLocal(url));
  });
});

describe("definirNoEnvTexto / lerEnvTexto", () => {
  it("troca a linha existente e acrescenta as novas, sem tocar no resto", () => {
    const antes = "# topo\nA=1\nSENHA=velha\n\n# fim\nB=2\n";
    const depois = definirNoEnvTexto(antes, { SENHA: "nova", NOVA: "x" });
    expect(depois).toBe("# topo\nA=1\nSENHA=nova\n\n# fim\nB=2\nNOVA=x\n");
  });

  it("preserva CRLF", () => {
    const depois = definirNoEnvTexto("A=1\r\nB=2\r\n", { B: "3" });
    expect(depois).toBe("A=1\r\nB=3\r\n");
  });

  it("não confunde chave com prefixo parecido", () => {
    const depois = definirNoEnvTexto("E2E_ADMIN_EMAIL_X=1\nE2E_ADMIN_EMAIL=velho\n", { E2E_ADMIN_EMAIL: "novo" });
    expect(depois).toBe("E2E_ADMIN_EMAIL_X=1\nE2E_ADMIN_EMAIL=novo\n");
  });

  it("round-trip com lerEnvTexto", () => {
    const texto = definirNoEnvTexto("", { A: "1", B: "dois" });
    expect(lerEnvTexto(texto)).toEqual({ A: "1", B: "dois" });
  });
});

describe("planejarVariaveis", () => {
  const base = {
    NUXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NUXT_SUPABASE_SERVICE_ROLE_KEY: "service-local",
  };

  it("grava e-mail + senha de cada cargo, E2E_CONSULTOR_NOME, E2E_USER_* (= operacional) e a service key", () => {
    const { pares, senhas } = planejarVariaveis(base);
    for (const chave of ["ADMIN", "OPERACIONAL", "SOCIO", "CONSULTOR"]) {
      expect(pares[`E2E_${chave}_EMAIL`]).toBe(`e2e.${chave.toLowerCase()}@farmaurora.com.br`);
      expect(pares[`E2E_${chave}_PASSWORD`]).toBe(senhas[chave]);
    }
    expect(pares.E2E_CONSULTOR_NOME).toBe(CONSULTOR_NOME_PADRAO);
    expect(pares.E2E_USER_EMAIL).toBe(pares.E2E_OPERACIONAL_EMAIL);
    expect(pares.E2E_USER_PASSWORD).toBe(pares.E2E_OPERACIONAL_PASSWORD);
    expect(pares.E2E_SERVICE_ROLE_KEY).toBe("service-local");
  });

  it("rodar de novo REAPROVEITA as senhas já gravadas (idempotente)", () => {
    const primeira = planejarVariaveis(base);
    const segunda = planejarVariaveis({ ...base, ...primeira.pares });
    expect(segunda.senhas).toEqual(primeira.senhas);
  });

  it("--rotate gera senhas novas", () => {
    const primeira = planejarVariaveis(base);
    const rodada = planejarVariaveis({ ...base, ...primeira.pares }, { rotacionar: true });
    for (const chave of Object.keys(primeira.senhas)) {
      expect(rodada.senhas[chave]).not.toBe(primeira.senhas[chave]);
    }
  });

  it("senhas distintas entre as contas", () => {
    const { senhas } = planejarVariaveis(base);
    expect(new Set(Object.values(senhas)).size).toBe(4);
  });
});
