import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROLES, canReadSection, canWriteSection, type Role, type Section } from "../../shared/utils/rbac";
import {
  SECOES_COM_PERMISSAO,
  apiDeSecaoDesligada,
  autorizarApi,
  nivelDaSecao,
  paginaInicial,
  podeEscrever,
  podeLer,
  type Permissoes,
} from "../../shared/utils/permissoesPagina";
import {
  definirSecoesDesligadas,
  dirHabilitadaNaConfig,
  religarTodasAsSecoes,
  secaoDesligada,
  secoesDesligadasPelaConfig,
} from "../../shared/utils/secoesDesligadas";
import { splitBottomNavLinks } from "../../app/utils/bottomNavLinks";

// A CHAVE QUE ESCONDE A DIR (runtimeConfig.public.dirHabilitada, padrão false). O estado de módulo (shared/utils/secoesDesligadas.ts) tem
// padrão "TUDO LIGADO", e é por isso que os demais specs do projeto não mudam. Aqui cada teste liga a chave desligada e o afterEach religa tudo.

// useNavLinks importa useAuth (runtime do Nuxt); só a função pura filtrarNavLinks interessa.
vi.mock("../../app/composables/useAuth", () => ({ useAuth: () => ({}) }));
const { filtrarNavLinks } = await import("../../app/composables/useNavLinks");

const RAIZ = join(__dirname, "..", "..");
const ler = (caminho: string): string => readFileSync(join(RAIZ, caminho), "utf-8");

const TODAS: Section[] = ["patients", "processos", "pagamentos", "dir", "compras", "admin", "config", "recados"];
const desligarDir = (): void => definirSecoesDesligadas(["dir"]);

afterEach(() => {
  religarTodasAsSecoes();
});

describe("a configuração: só um 'true' explícito liga a DIR (falha fechada)", () => {
  it.each([[true], ["true"], [" TRUE "], ["1"]])("%j liga", (valor) => {
    expect(dirHabilitadaNaConfig(valor)).toBe(true);
    expect(secoesDesligadasPelaConfig({ dirHabilitada: valor })).toEqual([]);
  });

  it.each([[false], ["false"], [""], ["0"], ["sim"], ["yes"], [1], [0], [null], [undefined], [{}], [[]]])("%j NÃO liga", (valor) => {
    expect(dirHabilitadaNaConfig(valor)).toBe(false);
    expect(secoesDesligadasPelaConfig({ dirHabilitada: valor })).toEqual(["dir"]);
  });

  it("config ausente ou sem a chave: a DIR fica desligada", () => {
    expect(secoesDesligadasPelaConfig({})).toEqual(["dir"]);
    expect(secoesDesligadasPelaConfig(undefined)).toEqual(["dir"]);
    expect(secoesDesligadasPelaConfig(null)).toEqual(["dir"]);
  });

  it("nuxt.config.ts declara public.dirHabilitada com padrão false (o ambiente liga com NUXT_PUBLIC_DIR_HABILITADA=true)", () => {
    const config = ler("nuxt.config.ts");
    expect(config).toMatch(/dirHabilitada:\s*false/);
    expect(config).toContain("NUXT_PUBLIC_DIR_HABILITADA");
  });
});

describe("o estado do módulo: padrão tudo ligado", () => {
  it("sem ninguém chamar definirSecoesDesligadas, nenhuma seção está desligada", () => {
    for (const secao of TODAS) expect(secaoDesligada(secao), secao).toBe(false);
  });

  it("definir ['dir'] desliga só a DIR; religar volta ao padrão", () => {
    desligarDir();
    expect(secaoDesligada("dir")).toBe(true);
    for (const secao of TODAS.filter((s) => s !== "dir")) expect(secaoDesligada(secao), secao).toBe(false);
    religarTodasAsSecoes();
    expect(secaoDesligada("dir")).toBe(false);
  });

  it("definir é uma SUBSTITUIÇÃO (lista vazia religa)", () => {
    desligarDir();
    definirSecoesDesligadas([]);
    expect(secaoDesligada("dir")).toBe(false);
  });
});

describe("permissões com a DIR desligada: a seção vale 'nenhum' para todos os cargos", () => {
  const mapaComDir: Permissoes = { processos: "editar", pagamentos: "editar", dir: "editar", patients: "editar", compras: "editar" };

  it("LIGADA (padrão): operacional e administrador leem e escrevem a DIR (o teste abaixo só vale porque isto é verdade)", () => {
    expect(podeLer({ role: "operacional" }, "dir")).toBe(true);
    expect(podeEscrever({ role: "operacional" }, "dir")).toBe(true);
    expect(podeLer({ role: "administrador" }, "dir")).toBe(true);
    expect(podeLer({ role: "socio", permissoes: mapaComDir }, "dir")).toBe(true);
  });

  it.each(ROLES)("%s, sem mapa: não lê nem escreve a DIR; nivelDaSecao é 'nenhum'", (role) => {
    desligarDir();
    expect(podeLer({ role }, "dir")).toBe(false);
    expect(podeEscrever({ role }, "dir")).toBe(false);
    expect(nivelDaSecao({ role }, "dir")).toBe("nenhum");
  });

  it.each(ROLES)("%s, COM mapa que dá 'editar' na DIR: continua sem acesso", (role) => {
    desligarDir();
    const usuario = { role, permissoes: mapaComDir };
    expect(podeLer(usuario, "dir")).toBe(false);
    expect(podeEscrever(usuario, "dir")).toBe(false);
    expect(nivelDaSecao(usuario, "dir")).toBe("nenhum");
  });

  it.each(ROLES)("%s: as OUTRAS seções seguem exatamente a regra de antes", (role) => {
    desligarDir();
    for (const secao of TODAS.filter((s) => s !== "dir")) {
      expect(podeLer({ role }, secao), `${role} lê ${secao}`).toBe(canReadSection(role, secao));
      expect(podeEscrever({ role }, secao), `${role} escreve ${secao}`).toBe(canWriteSection(role, secao));
    }
  });

  it("o mapa de permissões das outras seções vale como sempre", () => {
    desligarDir();
    const u = { role: "operacional" as Role, permissoes: { processos: "ver", pagamentos: "nenhum", dir: "editar", patients: "nenhum", compras: "editar" } as Permissoes };
    expect(podeLer(u, "processos")).toBe(true);
    expect(podeEscrever(u, "processos")).toBe(false);
    expect(podeLer(u, "pagamentos")).toBe(false);
    expect(podeEscrever(u, "compras")).toBe(true);
  });
});

describe("paginaInicial pula a DIR desligada", () => {
  const soDir: Permissoes = { processos: "nenhum", pagamentos: "nenhum", dir: "editar", patients: "nenhum", compras: "nenhum" };
  const dirECompras: Permissoes = { processos: "nenhum", pagamentos: "nenhum", dir: "editar", patients: "nenhum", compras: "ver" };

  it("ligada: a DIR é a página inicial de quem só lê a DIR; desligada: cai em /recados", () => {
    expect(paginaInicial({ role: "operacional", permissoes: soDir })).toBe("/dir");
    desligarDir();
    expect(paginaInicial({ role: "operacional", permissoes: soDir })).toBe("/recados");
  });

  it("DIR antes de Compras na ordem do menu: desligada, a inicial passa para /compras", () => {
    expect(paginaInicial({ role: "operacional", permissoes: dirECompras })).toBe("/dir");
    desligarDir();
    expect(paginaInicial({ role: "operacional", permissoes: dirECompras })).toBe("/compras");
  });

  it.each(ROLES)("%s, sem mapa: a inicial não é a DIR (continua /processos)", (role) => {
    desligarDir();
    expect(paginaInicial({ role })).toBe("/processos");
  });

  it("nenhum cargo, com ou sem mapa, tem a DIR como página inicial com ela desligada", () => {
    desligarDir();
    for (const role of ROLES) {
      expect(paginaInicial({ role, permissoes: soDir })).not.toBe("/dir");
      expect(paginaInicial({ role })).not.toBe("/dir");
    }
    expect(SECOES_COM_PERMISSAO).toContain("dir"); // a seção continua existindo: o servidor segue aceitando a chave "dir" nos mapas
  });
});

describe("menu (barra lateral, barra de baixo e 'Mais')", () => {
  const rotas = (role: Role): string[] => filtrarNavLinks({ role }).allLinks.map((l) => l.to);

  it("ligada: operacional e administrador veem /dir (sanidade)", () => {
    expect(rotas("operacional")).toContain("/dir");
    expect(rotas("administrador")).toContain("/dir");
  });

  it.each(ROLES)("%s: desligada, /dir sai do menu e o resto fica na mesma ordem", (role) => {
    const antes = rotas(role).filter((r) => r !== "/dir");
    desligarDir();
    expect(rotas(role)).toEqual(antes);
    expect(rotas(role)).not.toContain("/dir");
  });

  it("conta com mapa que dá 'editar' na DIR: o item não aparece desligada", () => {
    desligarDir();
    const mapa: Permissoes = { processos: "editar", pagamentos: "nenhum", dir: "editar", patients: "nenhum", compras: "nenhum" };
    expect(filtrarNavLinks({ role: "operacional", permissoes: mapa }).allLinks.map((l) => l.label)).toEqual(["Follow-Up", "Recados", "Configurações"]);
  });

  it("barra de baixo do administrador: sem a DIR, Follow-Up, Compras, Pagamentos e Prestações ficam fixos e Recados e Configurações vão para o 'Mais'", () => {
    desligarDir();
    const { primary, overflow } = splitBottomNavLinks(filtrarNavLinks({ role: "administrador" }).allLinks.map((l) => l.label));
    expect(primary).toEqual(["Follow-Up", "Compras", "Pagamentos", "Prestações"]);
    expect(overflow).toEqual(["Recados", "Configurações"]);
  });

  it("barra de baixo do operacional: sem a DIR são 5 itens, todos fixos, sem o botão 'Mais'", () => {
    desligarDir();
    const { primary, overflow } = splitBottomNavLinks(filtrarNavLinks({ role: "operacional" }).allLinks.map((l) => l.label));
    expect(primary).toEqual(["Follow-Up", "Compras", "Pagamentos", "Recados", "Configurações"]);
    expect(overflow).toEqual([]);
  });
});

describe("API: /api/dir* não existe com a DIR desligada", () => {
  const rotasDir = ["/api/dir", "/api/dir/", "/api/dir/abc", "/api/dir/opcoes", "/api/dir?mes=2026-11", "/api/dir/abc?x=1"];
  const metodos = ["GET", "POST", "PATCH", "PUT", "DELETE"];
  const admin = { role: "administrador" as Role };
  const operacional = { role: "operacional" as Role };

  it("apiDeSecaoDesligada: só as rotas /api/dir (com subcaminho ou query), nunca outras nem páginas", () => {
    desligarDir();
    for (const rota of rotasDir) expect(apiDeSecaoDesligada(rota), rota).toBe(true);
    for (const rota of ["/api/processos", "/api/compras/opcoes", "/api/pagamentos/banco", "/api/cadastros/consultores", "/api/directory", "/api/diretoria", "/dir", "/dir/x", "/processos"]) {
      expect(apiDeSecaoDesligada(rota), rota).toBe(false);
    }
  });

  it("ligada (padrão): apiDeSecaoDesligada é sempre falso", () => {
    for (const rota of rotasDir) expect(apiDeSecaoDesligada(rota), rota).toBe(false);
  });

  it("autorizarApi: 404 'Não encontrado.' em todo método, com sessão (administrador, operacional) ou sem sessão", () => {
    desligarDir();
    for (const usuario of [admin, operacional, null]) {
      for (const metodo of metodos) {
        for (const rota of rotasDir) {
          expect(autorizarApi(usuario, rota, metodo), `${usuario?.role ?? "anônimo"} ${metodo} ${rota}`).toEqual({
            permitido: false,
            status: 404,
            mensagem: "Não encontrado.",
          });
        }
      }
    }
  });

  it("ligada: a mesma chamada volta a ser o que era (administrador permitido; anônimo 401)", () => {
    expect(autorizarApi(admin, "/api/dir", "GET")).toEqual({ permitido: true });
    expect(autorizarApi(admin, "/api/dir/abc", "PATCH")).toEqual({ permitido: true });
    expect(autorizarApi(null, "/api/dir", "GET")).toMatchObject({ permitido: false, status: 401 });
  });

  it("desligada, o resto da API não muda (401 sem sessão; permitido ou 403 pelo cargo)", () => {
    desligarDir();
    expect(autorizarApi(null, "/api/processos", "GET")).toMatchObject({ permitido: false, status: 401 });
    expect(autorizarApi(operacional, "/api/compras/opcoes", "GET")).toEqual({ permitido: true });
    expect(autorizarApi({ role: "consultor" }, "/api/compras", "GET")).toMatchObject({ permitido: false, status: 403 });
    expect(autorizarApi(admin, "/api/auth/me", "GET")).toEqual({ permitido: true });
    expect(autorizarApi(operacional, "/api/pagamentos/banco", "GET")).toEqual({ permitido: true });
  });
});

describe("os plugins aplicam o valor do runtimeConfig", () => {
  async function plugin(arquivo: "app" | "server", publico: Record<string, unknown>): Promise<void> {
    vi.resetModules();
    const config = { public: publico };
    if (arquivo === "app") {
      vi.doMock("#app", () => ({ defineNuxtPlugin: <T>(fn: T): T => fn, useRuntimeConfig: () => config }));
      const modulo = await import("../../app/plugins/secoesDesligadas");
      (modulo.default as unknown as () => void)();
    } else {
      vi.doMock("#imports", () => ({ defineNitroPlugin: <T>(fn: T): T => fn, useRuntimeConfig: () => config }));
      const modulo = await import("../../server/plugins/secoesDesligadas");
      (modulo.default as unknown as () => void)();
    }
  }

  // vi.resetModules recarrega shared/utils/secoesDesligadas.ts dentro do plugin: o estado que vale é o do módulo recarregado.
  async function estadoDepois(arquivo: "app" | "server", publico: Record<string, unknown>): Promise<boolean> {
    await plugin(arquivo, publico);
    const { secaoDesligada: lerEstado } = await import("../../shared/utils/secoesDesligadas");
    return lerEstado("dir");
  }

  afterEach(() => {
    vi.doUnmock("#app");
    vi.doUnmock("#imports");
    vi.resetModules();
  });

  it.each(["app", "server"] as const)("plugin %s: sem a chave (ou false) a DIR fica desligada; true liga", async (arquivo) => {
    expect(await estadoDepois(arquivo, {}), "sem a chave").toBe(true);
    expect(await estadoDepois(arquivo, { dirHabilitada: false }), "false").toBe(true);
    expect(await estadoDepois(arquivo, { dirHabilitada: "true" }), "texto true (do ambiente)").toBe(false);
    expect(await estadoDepois(arquivo, { dirHabilitada: true }), "true").toBe(false);
  });

  it("os dois plugins existem e só chamam as funções compartilhadas", () => {
    for (const arquivo of ["app/plugins/secoesDesligadas.ts", "server/plugins/secoesDesligadas.ts"]) {
      const texto = ler(arquivo);
      expect(texto, arquivo).toContain("definirSecoesDesligadas(secoesDesligadasPelaConfig(useRuntimeConfig().public))");
    }
  });
});

describe("documentação e e2e: a chave está explicada e ligada onde precisa", () => {
  it(".env.example traz NUXT_PUBLIC_DIR_HABILITADA COMENTADA, com a explicação do padrão", () => {
    const exemplo = ler(".env.example");
    expect(exemplo).toMatch(/^# NUXT_PUBLIC_DIR_HABILITADA=true\s*$/m);
    expect(exemplo).not.toMatch(/^NUXT_PUBLIC_DIR_HABILITADA=/m);
    expect(exemplo).toMatch(/PADRÃO: DESLIGADA/);
  });

  it("o webServer do Playwright sobe com a DIR ligada (os e2e dir* e compras* dependem dela)", () => {
    expect(ler("playwright.config.ts")).toMatch(/NUXT_PUBLIC_DIR_HABILITADA:\s*"true"/);
  });

  it("o README lista a variável como opcional", () => {
    expect(ler("README.md")).toMatch(/NUXT_PUBLIC_DIR_HABILITADA.*opcional/);
  });
});
