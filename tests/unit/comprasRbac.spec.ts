import { describe, expect, it } from "vitest";
import {
  NIVEIS_PERMISSAO,
  ROTA_INICIAL_POR_SECAO,
  SECOES_COM_PERMISSAO,
  nivelDaSecao,
  paginaInicial,
  permissoesTudoNenhum,
  podeEscrever,
  podeLer,
  sanitizarPermissoes,
  validarPermissoesEstrito,
  type NivelPermissao,
  type Permissoes,
  type UsuarioRbac,
} from "../../shared/utils/permissoesPagina";
import { ROLES, canReadSection, canWriteSection, sectionForPageRoute, type Role } from "../../shared/utils/rbac";
import { padraoDoCargo, ROTULO_SECAO_PERMISSAO } from "../../app/utils/contaPermissoesForm";

// A seção "compras" (página Compras): administrador e operacional leem e escrevem; o SÓCIO SÓ LÊ; o consultor não acessa.
// Como as outras páginas, também obedece ao mapa de permissões por página da conta (só sócio e operacional usam o mapa):
// conta SEM mapa segue a regra do cargo; conta COM mapa e sem a chave "compras" vale "nenhum".

const usuario = (role: Role, permissoes?: Permissoes | null): UsuarioRbac => ({ role, permissoes });

// A regra do cargo (conta sem mapa): [pode ler, pode escrever].
const REGRA_DO_CARGO: Record<Role, [boolean, boolean]> = {
  administrador: [true, true],
  operacional: [true, true],
  socio: [true, false],
  consultor: [false, false],
};

describe("compras — a regra do cargo (rbac.ts)", () => {
  for (const role of ROLES) {
    const [le, escreve] = REGRA_DO_CARGO[role];
    it(`${role}: ${le ? "lê" : "não lê"} e ${escreve ? "escreve" : "não escreve"}`, () => {
      expect(canReadSection(role, "compras")).toBe(le);
      expect(canWriteSection(role, "compras")).toBe(escreve);
    });
  }

  it("quem escreve também lê (nunca escrever sem ler)", () => {
    for (const role of ROLES) if (canWriteSection(role, "compras")) expect(canReadSection(role, "compras"), role).toBe(true);
  });

  it("o sócio só vê: lê, não escreve", () => {
    expect([canReadSection("socio", "compras"), canWriteSection("socio", "compras")]).toEqual([true, false]);
  });

  it("o consultor não acessa Compras de jeito nenhum", () => {
    expect([canReadSection("consultor", "compras"), canWriteSection("consultor", "compras")]).toEqual([false, false]);
  });

  it("as outras seções não mudaram (a regra de cada cargo continua a de antes)", () => {
    expect(canReadSection("consultor", "processos")).toBe(true);
    expect(canWriteSection("socio", "processos")).toBe(true);
    expect(canReadSection("socio", "dir")).toBe(false);
    expect(canWriteSection("operacional", "patients")).toBe(false);
    expect(canReadSection("operacional", "pagamentos")).toBe(true);
  });
});

describe("compras — conta SEM mapa: vale a regra do cargo (nenhuma conta existente precisa mudar)", () => {
  for (const role of ROLES) {
    for (const semMapa of [undefined, null] as const) {
      const [le, escreve] = REGRA_DO_CARGO[role];
      it(`${role} com permissoes=${String(semMapa)}`, () => {
        const u = usuario(role, semMapa);
        expect(nivelDaSecao(u, "compras")).toBeNull();
        expect(podeLer(u, "compras")).toBe(le);
        expect(podeEscrever(u, "compras")).toBe(escreve);
      });
    }
  }
});

describe("compras — conta COM mapa (só sócio e operacional usam o mapa)", () => {
  const COM_MAPA: Role[] = ["socio", "operacional"];

  for (const role of COM_MAPA) {
    for (const nivel of NIVEIS_PERMISSAO) {
      it(`${role} com compras = "${nivel}": ${nivel === "nenhum" ? "nem lê" : nivel === "ver" ? "só lê" : "lê e escreve"} (a regra do cargo não vale mais)`, () => {
        const u = usuario(role, { ...permissoesTudoNenhum(), compras: nivel });
        expect(nivelDaSecao(u, "compras")).toBe(nivel);
        expect(podeLer(u, "compras")).toBe(nivel !== "nenhum");
        expect(podeEscrever(u, "compras")).toBe(nivel === "editar");
      });
    }

    it(`${role} com mapa SEM a chave "compras" = "nenhum" (fail-closed, mesmo que o cargo pudesse)`, () => {
      const u = usuario(role, { processos: "editar", pagamentos: "editar", dir: "editar", patients: "editar" });
      expect(nivelDaSecao(u, "compras")).toBe("nenhum");
      expect(podeLer(u, "compras")).toBe(false);
      expect(podeEscrever(u, "compras")).toBe(false);
    });

    it(`${role} com mapa vazio ou com valor inválido em compras = "nenhum"`, () => {
      expect(podeLer(usuario(role, {}), "compras")).toBe(false);
      for (const ruim of ["EDITAR", "", 1, null, true, {}, ["editar"]]) {
        const u = usuario(role, { compras: ruim } as unknown as Permissoes);
        expect(podeLer(u, "compras"), String(JSON.stringify(ruim))).toBe(false);
        expect(podeEscrever(u, "compras"), String(JSON.stringify(ruim))).toBe(false);
      }
    });

    it(`${role}: o nível de compras não mexe nas outras páginas`, () => {
      const u = usuario(role, { ...permissoesTudoNenhum(), processos: "ver", compras: "editar" });
      expect(podeLer(u, "processos")).toBe(true);
      expect(podeEscrever(u, "processos")).toBe(false);
      expect(podeLer(u, "pagamentos")).toBe(false);
      expect(podeLer(u, "compras")).toBe(true);
    });
  }

  it("administrador e consultor ignoram o mapa: seguem sempre a regra do cargo", () => {
    for (const nivel of NIVEIS_PERMISSAO) {
      const mapa = { ...permissoesTudoNenhum(), compras: nivel };
      const admin = usuario("administrador", mapa);
      expect([podeLer(admin, "compras"), podeEscrever(admin, "compras")]).toEqual([true, true]);
      const consultor = usuario("consultor", mapa);
      expect([podeLer(consultor, "compras"), podeEscrever(consultor, "compras")]).toEqual([false, false]);
    }
  });
});

describe("compras — o mapa gravado e o que a tela de Contas envia", () => {
  it("compras é a ÚLTIMA seção controlada (a ordem das outras, que decide a página inicial, não muda)", () => {
    expect([...SECOES_COM_PERMISSAO]).toEqual(["processos", "pagamentos", "dir", "patients", "compras"]);
  });

  it("conta que já tinha mapa de 4 seções (de antes de Compras) lê compras = 'nenhum' até o administrador editar", () => {
    const gravado = { processos: "editar", pagamentos: "ver", dir: "nenhum", patients: "ver" }; // como estava no banco
    expect(sanitizarPermissoes(gravado)).toEqual({ ...gravado, compras: "nenhum" });
    for (const role of ["socio", "operacional"] as const) {
      const u = usuario(role, sanitizarPermissoes(gravado));
      expect([podeLer(u, "compras"), podeEscrever(u, "compras")]).toEqual([false, false]);
    }
  });

  it("o mapa gravado com compras é lido como está", () => {
    expect(sanitizarPermissoes({ compras: "ver" })?.compras).toBe("ver");
    expect(sanitizarPermissoes({ compras: "editar" })?.compras).toBe("editar");
    expect(sanitizarPermissoes({ compras: "talvez" })?.compras).toBe("nenhum");
  });

  it("conta nova nasce com tudo desligado, inclusive compras", () => {
    expect(permissoesTudoNenhum()).toEqual({ processos: "nenhum", pagamentos: "nenhum", dir: "nenhum", patients: "nenhum", compras: "nenhum" });
  });

  it("o servidor aceita 'compras' no envio estrito (nenhum, ver, editar) e recusa outro valor", () => {
    for (const nivel of NIVEIS_PERMISSAO) {
      const r = validarPermissoesEstrito({ compras: nivel });
      expect(r.ok && r.permissoes.compras).toBe(nivel);
    }
    expect(validarPermissoesEstrito({ compras: "tudo" }).ok).toBe(false);
    expect(validarPermissoesEstrito({ comprass: "ver" }).ok).toBe(false);
  });

  it("a tela de Contas ganha a linha 'Compras' (rótulo) e o padrão do cargo bate com a regra: operacional edita, sócio vê", () => {
    expect(ROTULO_SECAO_PERMISSAO.compras).toBe("Compras");
    expect(padraoDoCargo("operacional").compras).toBe("editar");
    expect(padraoDoCargo("socio").compras).toBe("ver");
  });

  it("toda seção controlada tem rótulo e rota própria", () => {
    for (const secao of SECOES_COM_PERMISSAO) {
      expect(ROTULO_SECAO_PERMISSAO[secao], secao).toMatch(/\S/);
      expect(sectionForPageRoute(ROTA_INICIAL_POR_SECAO[secao]), secao).toBe(secao);
    }
    expect(ROTA_INICIAL_POR_SECAO.compras).toBe("/compras");
  });
});

describe("compras — página inicial", () => {
  it("quem só lê Compras (e mais nada) entra por /compras; sem Compras, nada muda", () => {
    const so = (nivel: NivelPermissao) => usuario("operacional", { ...permissoesTudoNenhum(), compras: nivel });
    expect(paginaInicial(so("ver"))).toBe("/compras");
    expect(paginaInicial(so("editar"))).toBe("/compras");
    expect(paginaInicial(so("nenhum"))).toBe("/recados");
  });

  it("quem lê qualquer outra página continua entrando por ela (Compras é a última da fila)", () => {
    expect(paginaInicial(usuario("socio", { ...permissoesTudoNenhum(), processos: "ver", compras: "editar" }))).toBe("/processos");
    expect(paginaInicial(usuario("socio", { ...permissoesTudoNenhum(), patients: "ver", compras: "ver" }))).toBe("/prestacao");
  });

  it("sem mapa, todos os cargos continuam entrando por /processos", () => {
    for (const role of ROLES) expect(paginaInicial(usuario(role)), role).toBe("/processos");
  });
});

describe("compras — rota da página", () => {
  it("/compras e subrotas mapeiam para a seção compras; parecidas não", () => {
    for (const rota of ["/compras", "/compras/", "/compras/nova", "/compras/12/editar"]) expect(sectionForPageRoute(rota), rota).toBe("compras");
    for (const rota of ["/compra", "/comprasx", "/compras-extra", "/x/compras"]) expect(sectionForPageRoute(rota), rota).toBeNull();
  });
});
