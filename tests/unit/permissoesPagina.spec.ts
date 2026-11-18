import { describe, expect, it } from "vitest";
import {
  AUTHENTICATED_ANY_API_PREFIXES,
  canReadSection,
  canWriteSection,
  defaultRouteForRole,
  isAuthenticatedAnyApiPath,
  isWriteMethod,
  ROLES,
  sectionForApiPath,
  sectionForPageRoute,
  type Role,
  type Section,
} from "#shared/utils/rbac";
import {
  autorizarApi,
  MENSAGEM_API_NAO_AUTENTICADO,
  MENSAGEM_API_ROTA_NAO_AUTORIZADA,
  MENSAGEM_API_SEM_PERMISSAO,
  NIVEIS_PERMISSAO,
  nivelDaSecao,
  paginaInicial,
  podeEscrever,
  podeLer,
  ROLES_COM_PERMISSAO,
  ROTA_INICIAL_PADRAO,
  ROTA_INICIAL_POR_SECAO,
  sanitizarPermissoes,
  SECOES_COM_PERMISSAO,
  type NivelPermissao,
  type Permissoes,
  type UsuarioRbac,
} from "#shared/utils/permissoesPagina";

const TODAS_AS_SECOES: Section[] = ["patients", "processos", "pagamentos", "admin", "config", "recados"];
TODAS_AS_SECOES.push("dir"); // a DIR é uma seção a mais (admin e consultor ignoram o mapa também nela)
const METODOS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE", "post", "patch"];
const METODOS_ESCRITA = ["POST", "PUT", "PATCH", "DELETE"];

// Um path de API de cada seção (com subcaminho e com query), mais os casos de borda do middleware.
const PATHS_API = [
  "/api/patients",
  "/api/patients/abc?x=1",
  "/api/attachments/signed-urls?patientId=1",
  "/api/processos",
  "/api/processos/abc/chegada",
  "/api/pagamentos/banco",
  "/api/pagamentos/despachante/1/pagar",
  "/api/dir",
  "/api/dir/abc",
  "/api/cadastros/fornecedores",
  "/api/cadastros/fornecedores/abc",
  "/api/admin/users",
  "/api/admin/users/abc/reset-password",
  "/api/recados",
  "/api/contas",
  "/api/notificacoes",
  "/api/chegada-avisos/vistos",
  "/api/lembretes/abc",
  "/api/auth/me",
  "/api/auth/conta/nome",
  // sem seção e fora da allowlist: nega por padrão
  // (prefixos parecidos com /api/dir não valem)
  "/api/directory",
  "/api/dirx",
  "/api/health",
  "/api/authorized",
  "/api/",
  // fora de /api/: o middleware não se aplica
  "/api",
  "/processos",
  "/login",
];

// A decisão do middleware ANTES da refatoração (server/middleware/auth.ts, 131-159), reescrita aqui como
// referência independente: só o cargo, sem mapa.
function decisaoDeReferencia(role: Role | null, path: string, metodo: string) {
  if (!path.startsWith("/api/")) return { permitido: true };
  if (!role) return { permitido: false, status: 401, mensagem: "Não autenticado." };
  if (isAuthenticatedAnyApiPath(path)) return { permitido: true };
  const secao = sectionForApiPath(path);
  if (!secao) return { permitido: false, status: 403, mensagem: "Rota não autorizada." };
  const permitido = isWriteMethod(metodo) ? canWriteSection(role, secao) : canReadSection(role, secao);
  return permitido ? { permitido: true } : { permitido: false, status: 403, mensagem: "Sem permissão para esta operação." };
}

const COM_MAPA: Role[] = [...ROLES_COM_PERMISSAO];

function usuario(role: Role, permissoes?: Permissoes | null): UsuarioRbac {
  return permissoes === undefined ? { role } : { role, permissoes };
}

function mapaDe(nivel: NivelPermissao): Permissoes {
  return Object.fromEntries(SECOES_COM_PERMISSAO.map((s) => [s, nivel])) as Permissoes;
}

describe("equivalência: sem mapa gravado, tudo igual à regra atual do cargo", () => {
  it("podeLer e podeEscrever = canReadSection e canWriteSection (cargo × seção)", () => {
    for (const role of ROLES) {
      for (const secao of TODAS_AS_SECOES) {
        for (const permissoes of [undefined, null]) {
          const u = usuario(role, permissoes);
          expect(podeLer(u, secao), `${role}/${secao}/ler`).toBe(canReadSection(role, secao));
          expect(podeEscrever(u, secao), `${role}/${secao}/escrever`).toBe(canWriteSection(role, secao));
          expect(nivelDaSecao(u, secao)).toBeNull();
        }
      }
    }
  });

  it("autorizarApi = decisão atual do middleware (cargo × path × método), inclusive 401, 403 e allowlist", () => {
    for (const role of ROLES) {
      for (const path of PATHS_API) {
        for (const metodo of METODOS) {
          expect(autorizarApi({ role }, path, metodo), `${role} ${metodo} ${path}`).toEqual(
            decisaoDeReferencia(role, path, metodo),
          );
        }
      }
    }
  });

  it("sem sessão: 401 em qualquer /api/**, inclusive /api/auth/**; fora de /api/ não se aplica", () => {
    for (const metodo of METODOS) {
      for (const path of PATHS_API) {
        for (const sem of [null, undefined]) {
          expect(autorizarApi(sem, path, metodo), `${metodo} ${path}`).toEqual(decisaoDeReferencia(null, path, metodo));
        }
      }
    }
    expect(autorizarApi(null, "/api/auth/me", "GET")).toEqual({
      permitido: false,
      status: 401,
      mensagem: MENSAGEM_API_NAO_AUTENTICADO,
    });
  });

  it("as mensagens exportadas são as do middleware de hoje", () => {
    expect(MENSAGEM_API_NAO_AUTENTICADO).toBe("Não autenticado.");
    expect(MENSAGEM_API_ROTA_NAO_AUTORIZADA).toBe("Rota não autorizada.");
    expect(MENSAGEM_API_SEM_PERMISSAO).toBe("Sem permissão para esta operação.");
  });

  it("/api/auth/** só com sessão (qualquer cargo, qualquer método) e rota sem seção = 403", () => {
    expect(AUTHENTICATED_ANY_API_PREFIXES).toEqual(["/api/auth/"]);
    for (const role of ROLES) {
      for (const metodo of METODOS) {
        expect(autorizarApi({ role }, "/api/auth/conta/nome", metodo).permitido).toBe(true);
        expect(autorizarApi({ role }, "/api/health", metodo)).toMatchObject({ permitido: false, status: 403 });
      }
    }
  });

  it("prefixo público (opção) libera sem sessão; sem a opção nenhum é público", () => {
    expect(autorizarApi(null, "/api/publico/x", "GET", { prefixosPublicos: ["/api/publico/"] })).toEqual({
      permitido: true,
    });
    expect(autorizarApi(null, "/api/publico/x", "GET")).toMatchObject({ permitido: false, status: 401 });
  });

  it("paginaInicial sem mapa é /processos para todos os cargos (igual a defaultRouteForRole)", () => {
    for (const role of ROLES) expect(paginaInicial({ role })).toBe(defaultRouteForRole(role));
  });
});

describe("com mapa gravado (socio e operacional)", () => {
  const mapa: Permissoes = { processos: "ver", pagamentos: "nenhum", patients: "editar" };

  it.each(COM_MAPA)("%s — 'ver' libera só leitura: GET passa; POST/PUT/PATCH/DELETE dão 403", (role) => {
    const u = usuario(role, mapa);
    for (const path of ["/api/processos", "/api/processos/abc", "/api/processos/abc/chegada"]) {
      for (const metodo of ["GET", "HEAD", "OPTIONS"]) {
        expect(autorizarApi(u, path, metodo), `${metodo} ${path}`).toEqual({ permitido: true });
      }
      for (const metodo of METODOS_ESCRITA) {
        expect(autorizarApi(u, path, metodo), `${metodo} ${path}`).toEqual({
          permitido: false,
          status: 403,
          mensagem: MENSAGEM_API_SEM_PERMISSAO,
        });
      }
    }
    expect(podeLer(u, "processos")).toBe(true);
    expect(podeEscrever(u, "processos")).toBe(false);
  });

  it.each(COM_MAPA)("%s — 'nenhum' nega até o GET (e a escrita)", (role) => {
    const u = usuario(role, mapa);
    for (const metodo of METODOS) {
      expect(autorizarApi(u, "/api/pagamentos/banco", metodo), metodo).toMatchObject({ permitido: false, status: 403 });
    }
    expect(podeLer(u, "pagamentos")).toBe(false);
    expect(podeEscrever(u, "pagamentos")).toBe(false);
  });

  it.each(COM_MAPA)("%s — 'editar' libera leitura e escrita, mesmo onde o cargo não tinha acesso", (role) => {
    const u = usuario(role, mapa);
    for (const metodo of METODOS) {
      expect(autorizarApi(u, "/api/patients/abc", metodo), metodo).toEqual({ permitido: true });
    }
    // operacional não tinha Prestações — o mapa decide, não o cargo.
    expect(podeEscrever(usuario(role, { patients: "editar" }), "patients")).toBe(true);
  });

  it.each(COM_MAPA)("%s — seção ausente do mapa = 'nenhum' (fail-closed), inclusive mapa vazio", (role) => {
    const parcial = usuario(role, { processos: "editar" });
    expect(podeLer(parcial, "processos")).toBe(true);
    for (const secao of ["pagamentos", "patients"] as const) {
      expect(nivelDaSecao(parcial, secao)).toBe("nenhum");
      expect(podeLer(parcial, secao)).toBe(false);
      expect(podeEscrever(parcial, secao)).toBe(false);
    }
    const vazio = usuario(role, {});
    for (const secao of SECOES_COM_PERMISSAO) {
      expect(podeLer(vazio, secao)).toBe(false);
      expect(autorizarApi(vazio, `/api/${secao === "patients" ? "patients" : secao}`, "GET")).toMatchObject({
        permitido: false,
        status: 403,
      });
    }
  });

  const mapaDir: Permissoes = { processos: "ver", pagamentos: "nenhum", dir: "ver", patients: "editar" };

  it.each(COM_MAPA)("%s — DIR 'ver' libera só leitura: GET passa; POST/PUT/PATCH/DELETE dão 403", (role) => {
    const u = usuario(role, mapaDir);
    for (const path of ["/api/dir", "/api/dir/abc"]) {
      for (const metodo of ["GET", "HEAD", "OPTIONS"]) {
        expect(autorizarApi(u, path, metodo), `${metodo} ${path}`).toEqual({ permitido: true });
      }
      for (const metodo of METODOS_ESCRITA) {
        expect(autorizarApi(u, path, metodo), `${metodo} ${path}`).toEqual({
          permitido: false,
          status: 403,
          mensagem: MENSAGEM_API_SEM_PERMISSAO,
        });
      }
    }
    expect(podeLer(u, "dir")).toBe(true);
    expect(podeEscrever(u, "dir")).toBe(false);
  });

  it.each(COM_MAPA)("%s — DIR 'nenhum' nega até o GET (e a escrita)", (role) => {
    const u = usuario(role, { ...mapaDir, dir: "nenhum" });
    for (const metodo of METODOS) {
      expect(autorizarApi(u, "/api/dir", metodo), metodo).toMatchObject({ permitido: false, status: 403 });
    }
    expect(podeLer(u, "dir")).toBe(false);
    expect(podeEscrever(u, "dir")).toBe(false);
  });

  it.each(COM_MAPA)("%s — DIR 'editar' libera leitura e escrita, mesmo para o sócio (que o cargo sozinho não tinha)", (role) => {
    const u = usuario(role, { dir: "editar" });
    for (const metodo of METODOS) {
      expect(autorizarApi(u, "/api/dir/abc", metodo), metodo).toEqual({ permitido: true });
    }
    expect(podeEscrever(u, "dir")).toBe(true);
  });

  it.each(COM_MAPA)("%s — DIR ausente do mapa = 'nenhum' (fail-closed)", (role) => {
    const parcial = usuario(role, { processos: "editar" });
    expect(nivelDaSecao(parcial, "dir")).toBe("nenhum");
    expect(podeLer(parcial, "dir")).toBe(false);
    expect(podeEscrever(parcial, "dir")).toBe(false);
  });

  it.each(COM_MAPA)("%s — valor inválido na DIR = 'nenhum' (mesmo sem passar pela sanitização)", (role) => {
    const u = usuario(role, { processos: "editar", dir: {} } as unknown as Permissoes);
    expect(podeLer(u, "dir")).toBe(false);
    expect(podeEscrever(u, "dir")).toBe(false);
  });

  it.each(COM_MAPA)("%s — Cadastros (config) lê e não escreve, com qualquer mapa", (role) => {
    const tudoNenhum = usuario(role, mapaDe("nenhum"));
    expect(autorizarApi(tudoNenhum, "/api/cadastros/fornecedores", "GET").permitido).toBe(true);
    expect(autorizarApi(tudoNenhum, "/api/cadastros/fornecedores", "POST").permitido).toBe(false);
  });

  it.each(COM_MAPA)("%s — valor inválido no mapa = 'nenhum' (mesmo sem passar pela sanitização)", (role) => {
    const sujo = { processos: "EDITAR", pagamentos: 1, patients: null } as unknown as Permissoes;
    const u = usuario(role, sujo);
    for (const secao of SECOES_COM_PERMISSAO) {
      expect(podeLer(u, secao), secao).toBe(false);
      expect(podeEscrever(u, secao), secao).toBe(false);
    }
  });

  it.each(COM_MAPA)("%s — fora das seções do mapa (recados, config, admin) vale sempre a regra do cargo", (role) => {
    const tudoNenhum = usuario(role, mapaDe("nenhum"));
    for (const secao of ["recados", "config", "admin"] as const) {
      expect(nivelDaSecao(tudoNenhum, secao)).toBeNull();
      expect(podeLer(tudoNenhum, secao), secao).toBe(canReadSection(role, secao));
      expect(podeEscrever(tudoNenhum, secao), secao).toBe(canWriteSection(role, secao));
    }
    // Recados continua aberto (leitura e escrita).
    expect(autorizarApi(tudoNenhum, "/api/recados", "POST").permitido).toBe(true);
    expect(autorizarApi(tudoNenhum, "/api/auth/me", "GET").permitido).toBe(true);
  });

  it("consultor e administrador IGNORAM o mapa", () => {
    for (const permissoes of [mapaDe("nenhum"), mapaDe("ver"), {}]) {
      const adm = usuario("administrador", permissoes);
      const consultor = usuario("consultor", permissoes);
      for (const secao of TODAS_AS_SECOES) {
        expect(podeLer(adm, secao)).toBe(canReadSection("administrador", secao));
        expect(podeEscrever(adm, secao)).toBe(canWriteSection("administrador", secao));
        expect(podeLer(consultor, secao)).toBe(canReadSection("consultor", secao));
        expect(podeEscrever(consultor, secao)).toBe(canWriteSection("consultor", secao));
        expect(nivelDaSecao(adm, secao)).toBeNull();
        expect(nivelDaSecao(consultor, secao)).toBeNull();
      }
      expect(paginaInicial(adm)).toBe("/processos");
      expect(paginaInicial(consultor)).toBe("/processos");
    }
  });

  it("autorizarApi com mapa: só as seções controladas mudam; o restante da matriz é a do cargo", () => {
    for (const role of COM_MAPA) {
      const u = usuario(role, mapaDe("nenhum"));
      for (const path of PATHS_API) {
        const secao = path.startsWith("/api/") ? sectionForApiPath(path) : null;
        if (secao && (SECOES_COM_PERMISSAO as readonly Section[]).includes(secao)) continue;
        for (const metodo of METODOS) {
          expect(autorizarApi(u, path, metodo), `${role} ${metodo} ${path}`).toEqual(
            decisaoDeReferencia(role, path, metodo),
          );
        }
      }
    }
  });
});

describe("sanitizarPermissoes", () => {
  it("null e undefined = sem mapa (vale o cargo)", () => {
    expect(sanitizarPermissoes(null)).toBeUndefined();
    expect(sanitizarPermissoes(undefined)).toBeUndefined();
  });

  it("mapa válido: devolve TODAS as seções controladas", () => {
    expect(sanitizarPermissoes({ processos: "ver", pagamentos: "editar", patients: "ver" })).toEqual({
      processos: "ver",
      pagamentos: "editar",
      dir: "nenhum",
      patients: "ver",
    });
  });

  it("mapa válido com a DIR: devolve o nível da DIR", () => {
    expect(sanitizarPermissoes({ processos: "ver", pagamentos: "editar", dir: "editar", patients: "ver" })).toEqual({
      processos: "ver",
      pagamentos: "editar",
      dir: "editar",
      patients: "ver",
    });
  });

  it("seção ausente vira 'nenhum'; mapa vazio = tudo 'nenhum' (continua sendo um mapa gravado)", () => {
    expect(sanitizarPermissoes({ processos: "editar" })).toEqual({
      processos: "editar",
      pagamentos: "nenhum",
      dir: "nenhum",
      patients: "nenhum",
    });
    expect(sanitizarPermissoes({})).toEqual(mapaDe("nenhum"));
  });

  it("valor inválido vira 'nenhum' (maiúsculas, número, nulo, objeto, lista, vazio)", () => {
    expect(
      sanitizarPermissoes({ processos: "Editar", pagamentos: 2, patients: ["ver"] }),
    ).toEqual(mapaDe("nenhum"));
    expect(sanitizarPermissoes({ processos: "", pagamentos: true, patients: " ver" })).toEqual(mapaDe("nenhum"));
  });

  it("valor inválido na DIR vira 'nenhum'", () => {
    for (const ruim of [null, {}, [], "EDITAR", " ver", 1, true]) {
      expect(sanitizarPermissoes({ processos: "ver", dir: ruim })).toEqual({
        processos: "ver",
        pagamentos: "nenhum",
        dir: "nenhum",
        patients: "nenhum",
      });
    }
  });

  it("descarta chaves desconhecidas e seções fora do mapa (admin, recados, config, __proto__)", () => {
    const r = sanitizarPermissoes(
      JSON.parse('{"processos":"ver","admin":"editar","recados":"nenhum","config":"editar","outra":"ver","__proto__":{"x":1}}'),
    );
    expect(r).toEqual({ processos: "ver", pagamentos: "nenhum", dir: "nenhum", patients: "nenhum" });
    expect(Object.keys(r ?? {}).sort()).toEqual([...SECOES_COM_PERMISSAO].sort());
  });

  it("gravado mas ilegível (texto, número, lista, booleano) = tudo 'nenhum', nunca volta ao cargo", () => {
    for (const lixo of ["editar", "{}", 7, true, false, [], ["processos"], 0, ""]) {
      expect(sanitizarPermissoes(lixo), String(JSON.stringify(lixo))).toEqual(mapaDe("nenhum"));
    }
  });

  it("os níveis aceitos são exatamente nenhum, ver e editar", () => {
    expect(NIVEIS_PERMISSAO).toEqual(["nenhum", "ver", "editar"]);
  });
});

describe("paginaInicial — nunca devolve página proibida nem entra em loop", () => {
  const NIVEIS = NIVEIS_PERMISSAO;
  // Todas as 3^3 combinações de mapa.
  // Depois, cada uma × 3 níveis da DIR = 3^4 (ver MAPAS_SEM_DIR abaixo).
  const MAPAS: Permissoes[] = [];
  for (const a of NIVEIS) {
    for (const b of NIVEIS) {
      for (const c of NIVEIS) MAPAS.push({ processos: a, pagamentos: b, patients: c });
    }
  }
  const MAPAS_SEM_DIR = MAPAS.splice(0, MAPAS.length);
  for (const mapa of MAPAS_SEM_DIR) for (const d of NIVEIS) MAPAS.push({ ...mapa, dir: d });

  // O guarda de navegação (authz.global.ts): sem leitura na seção da rota, vai para a página inicial.
  function aposGuarda(u: UsuarioRbac, rota: string): string {
    const secao = sectionForPageRoute(rota);
    return secao && !podeLer(u, secao) ? paginaInicial(u) : rota;
  }

  it("conta com tudo 'nenhum' cai em /recados", () => {
    for (const role of COM_MAPA) {
      expect(paginaInicial(usuario(role, mapaDe("nenhum")))).toBe("/recados");
      expect(paginaInicial(usuario(role, {}))).toBe(ROTA_INICIAL_PADRAO);
    }
    expect(ROTA_INICIAL_PADRAO).toBe("/recados");
  });

  it("é a primeira seção legível, na ordem do menu: processos, pagamentos, prestação", () => {
    const u = (permissoes: Permissoes) => usuario("operacional", permissoes);
    expect(paginaInicial(u({ processos: "ver", pagamentos: "editar" }))).toBe("/processos");
    expect(paginaInicial(u({ pagamentos: "ver", patients: "editar" }))).toBe("/pagamentos");
    expect(paginaInicial(u({ patients: "ver" }))).toBe("/prestacao");
  });

  it("com a DIR, a ordem do menu é processos, pagamentos, dir, prestação", () => {
    const u = (permissoes: Permissoes) => usuario("operacional", permissoes);
    expect(paginaInicial(u({ pagamentos: "ver", dir: "editar", patients: "editar" }))).toBe("/pagamentos");
    expect(paginaInicial(u({ dir: "ver", patients: "editar" }))).toBe("/dir");
    expect(paginaInicial(u({ dir: "nenhum", patients: "ver" }))).toBe("/prestacao");
  });

  it("para qualquer mapa e cargo: a página inicial é legível e o guarda não a redireciona (zero ou um salto)", () => {
    for (const role of COM_MAPA) {
      for (const mapa of MAPAS) {
        const u = usuario(role, mapa);
        const inicial = paginaInicial(u);
        const secao = sectionForPageRoute(inicial);
        expect(secao, inicial).not.toBeNull();
        expect(podeLer(u, secao!), `${role} ${JSON.stringify(mapa)} → ${inicial}`).toBe(true);
        expect(aposGuarda(u, inicial)).toBe(inicial);
      }
    }
  });

  it("de qualquer rota de página (e de '/'), no máximo um redirecionamento leva a uma página legível", () => {
    const rotas = ["/processos", "/pagamentos", "/prestacao", "/recados", "/configuracoes", "/"];
    rotas.push("/dir");
    for (const role of ROLES) {
      for (const mapa of [undefined, ...MAPAS]) {
        const u = usuario(role, mapa);
        for (const rota of rotas) {
          const destino = rota === "/" ? paginaInicial(u) : aposGuarda(u, rota);
          const secao = sectionForPageRoute(destino);
          expect(secao === null || podeLer(u, secao), `${role} ${rota} → ${destino}`).toBe(true);
          // depois do primeiro salto o destino é estável
          expect(aposGuarda(u, destino)).toBe(destino);
        }
      }
    }
  });

  it("toda seção controlada tem rota própria que o mapeamento de páginas reconhece", () => {
    for (const secao of SECOES_COM_PERMISSAO) {
      expect(sectionForPageRoute(ROTA_INICIAL_POR_SECAO[secao])).toBe(secao);
    }
  });

  it("todo cargo continua podendo ler Recados (a saída segura do paginaInicial)", () => {
    for (const role of ROLES) {
      expect(podeLer(usuario(role), "recados")).toBe(true);
      expect(podeLer(usuario(role, mapaDe("nenhum")), "recados")).toBe(true);
    }
  });
});
