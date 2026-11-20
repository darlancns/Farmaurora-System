// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Compra, ListaCompras, OpcoesCompra, PreviaEncaminhar, RespostaEncaminhar } from "../../shared/types/compra";
import { permissoesTudoNenhum, type NivelPermissao } from "../../shared/utils/permissoesPagina";
import { itemDaLista } from "../../shared/utils/compraLista";
import { compraTeste, ordemTeste, previaTeste } from "./helpers/encaminharFixtures";

// A PÁGINA Compras real (no happy-dom, com o fetch simulado): o botão "Encaminhar para a DIR" respeita compras = editar E dir = editar,
// abre o painel, envia, mostra o resultado e invalida o cache da DIR; 409 de versão abre a faixa de conflito; PO que já existe na DIR entra
// no "N pendências". Dados fictícios (TESTE).

vi.mock("#app", async () => {
  const stub = await import("./helpers/nuxtAppStub");
  return { ...stub, useRoute: () => ({ query: { id: "cmp_teste_000001", mes: "2026-12", aba: "resumo" } }), useRouter: () => ({ replace: async () => undefined }) };
});
vi.mock("../../app/components/GlobalHeader.vue", () => ({
  default: defineComponent({
    props: { title: { type: String, default: "" } },
    setup: () => () => h("div"),
  }),
}));

import ComprasPage from "../../app/pages/compras.vue";
import { useAuth } from "../../app/composables/useAuth";
import { invalidarCacheDir, useDir } from "../../app/composables/useDir";

const montados: Array<() => void> = [];
afterEach(() => {
  while (montados.length) montados.pop()!();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const texto = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string): T | null => document.querySelector<T>(sel);
const esperar = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) {
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();
  }
};

function usuario(compras: NivelPermissao, dir: NivelPermissao): AuthUser {
  return { id: "u1", email: "u@x.com", role: "operacional", nome: "Operacional TESTE", isAdmin: false, permissoes: { ...permissoesTudoNenhum(), compras, dir } };
}

interface Servidor {
  compra: Compra;
  previa: PreviaEncaminhar;
  chamadas: Array<{ metodo: string; url: string; corpo?: unknown }>;
  respostaPost: () => Promise<Response>;
  /** A resposta do salvamento automático (PATCH). */
  respostaPatch: () => Promise<Response>;
}

const OPCOES: OpcoesCompra = {
  fornecedores: [],
  despachantes: [],
  ciasAereas: [],
  transportadoras: [],
  consultores: [],
  temperaturas: [],
  medicamentos: { itens: [], pagina: 1, limite: 50, temMais: false },
};

function resposta(status: number, corpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

function servidor(compra: Compra = compraTeste()): Servidor {
  const s: Servidor = {
    compra,
    previa: previaTeste(compra),
    chamadas: [],
    respostaPatch: async () => resposta(200, s.compra),
    respostaPost: async () => {
      const devolvida: Compra = { ...s.compra, updatedAt: "2026-12-01T12:05:00.000Z", ordens: s.compra.ordens.map((o) => ({ ...o, dirId: `dir_${o.id}`, encaminhadaEm: "2026-12-01T12:05:00.000Z" })) };
      const r: RespostaEncaminhar = { compra: devolvida, criadas: s.compra.ordens.map((o) => ({ ordemId: o.id, dirId: `dir_${o.id}`, po: o.po })), jaEncaminhada: false };
      return resposta(200, r);
    },
  };
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    s.chamadas.push({ metodo, url, ...(init?.body ? { corpo: JSON.parse(String(init.body)) } : {}) });
    if (url === "/api/compras/opcoes") return resposta(200, OPCOES);
    if (url.startsWith("/api/compras?")) {
      const lista: ListaCompras = {
        anoMes: "2026-12",
        compras: [itemDaLista({ ...s.compra, atualizadoEm: s.compra.updatedAt })],
        status: null,
        pagina: 1,
        limite: 50,
        temMais: false,
        total: 1,
        totais: { rascunho: 0, pronta: 1, parcial: 0, encaminhada: 0, cancelada: 0 },
      };
      return resposta(200, lista);
    }
    if (url === `/api/compras/${s.compra.id}` && metodo === "PATCH") return s.respostaPatch();
    if (url === `/api/compras/${s.compra.id}`) return resposta(200, s.compra);
    if (url === `/api/compras/${s.compra.id}/encaminhar-previa`) return resposta(200, s.previa);
    if (url === `/api/compras/${s.compra.id}/encaminhar` && metodo === "POST") return s.respostaPost();
    if (url === "/api/dir") return resposta(200, []);
    return resposta(404, {});
  });
  return s;
}

async function abrirPagina(user: AuthUser, s: Servidor): Promise<void> {
  useAuth().user.value = user;
  useAuth().loaded.value = true;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(ComprasPage);
  app.component("NuxtLink", defineComponent({ props: { to: { type: String, default: "" } }, setup: (p, { slots }) => () => h("a", { href: p.to }, slots.default?.()) }));
  app.mount(el);
  montados.push(() => app.unmount());
  await esperar();
  expect(s.chamadas.some((c) => c.url === `/api/compras/${s.compra.id}`)).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-01T12:00:00.000Z"));
  invalidarCacheDir();
  useDir().registros.value = [];
});

const ADMIN = usuario("editar", "editar");

describe("o botão 'Encaminhar para a DIR' na página (permissões)", () => {
  it("compras = editar E dir = editar: habilitado, com o texto de apoio normal", async () => {
    await abrirPagina(ADMIN, servidor());
    const botao = q<HTMLButtonElement>("#btn-encaminhar-dir")!;
    expect(botao.disabled).toBe(false);
    expect(texto(q("#encaminhar-dir-aviso"))).toBe("Cria uma linha na DIR para cada ordem.");
  });

  it("compras = editar e dir = VER: desabilitado ('Sem permissão para escrever na DIR'); clicar não abre painel nem chama nada", async () => {
    const s = servidor();
    await abrirPagina(usuario("editar", "ver"), s);
    const botao = q<HTMLButtonElement>("#btn-encaminhar-dir")!;
    expect(botao.disabled).toBe(true);
    expect(texto(q("#encaminhar-dir-aviso"))).toBe("Sem permissão para escrever na DIR");
    botao.click();
    await esperar();
    expect(q("#compra-encaminhar")).toBeNull();
    expect(s.chamadas.some((c) => c.url.includes("encaminhar"))).toBe(false);
  });

  it("compras = editar e dir = nenhum: também desabilitado com a razão da DIR", async () => {
    await abrirPagina(usuario("editar", "nenhum"), servidor());
    expect(q<HTMLButtonElement>("#btn-encaminhar-dir")!.disabled).toBe(true);
    expect(texto(q("#encaminhar-dir-aviso"))).toBe("Sem permissão para escrever na DIR");
  });

  it("compras = VER (o sócio) e dir = editar: desabilitado ('Sem permissão para editar Compras'), nunca escondido sem explicação", async () => {
    await abrirPagina(usuario("ver", "editar"), servidor());
    const botao = q<HTMLButtonElement>("#btn-encaminhar-dir")!;
    expect(botao).not.toBeNull();
    expect(botao.disabled).toBe(true);
    expect(texto(q("#encaminhar-dir-aviso"))).toBe("Sem permissão para editar Compras");
  });

  it("compra cancelada: desabilitado com 'Compra cancelada'", async () => {
    await abrirPagina(ADMIN, servidor(compraTeste({ cancelada: true })));
    expect(q<HTMLButtonElement>("#btn-encaminhar-dir")!.disabled).toBe(true);
    expect(texto(q("#encaminhar-dir-aviso"))).toBe("Compra cancelada");
  });

  it("todas as ordens já encaminhadas: desabilitado com 'Todas as ordens já foram encaminhadas'", async () => {
    const ja = { dirId: "dir_x", encaminhadaEm: "2026-12-01T10:00:00.000Z" };
    await abrirPagina(ADMIN, servidor(compraTeste({ ordens: [ordemTeste(1, ja), ordemTeste(2, ja)] })));
    expect(q<HTMLButtonElement>("#btn-encaminhar-dir")!.disabled).toBe(true);
    expect(texto(q("#encaminhar-dir-aviso"))).toBe("Todas as ordens já foram encaminhadas");
  });
});

describe("o fluxo na página", () => {
  it("clicar abre o painel no lugar do resumo (a coluna do formulário continua), busca a prévia e mostra a conferência", async () => {
    const s = servidor();
    await abrirPagina(ADMIN, s);
    q<HTMLButtonElement>("#btn-encaminhar-dir")!.click();
    await esperar();
    expect(q("#compra-encaminhar")).not.toBeNull();
    expect(q("#compra-resumo")).toBeNull();
    expect(q("#compra-formulario")).not.toBeNull();
    expect(s.chamadas.filter((c) => c.url.endsWith("/encaminhar-previa"))).toHaveLength(1);
    expect(texto(q("#encaminhar-intro"))).toContain("Serão criadas 2 linhas");
    expect(texto(q("#btn-encaminhar-confirmar"))).toBe("Encaminhar 2 linhas");
    // abaixo de lg, a barra fixa vira "Voltar" + "Encaminhar N linhas"
    expect(texto(q("#btn-encaminhar-voltar-celular"))).toBe("Voltar");
    expect(texto(q("#btn-encaminhar-confirmar-celular"))).toBe("Encaminhar 2 linhas");
    expect(q("#btn-copiar-resumo")).toBeNull();
  });

  it("Encaminhar: POST só com { atualizadoEm }, resultado na tela, compra trocada pela devolvida, cache da DIR invalidado e toast", async () => {
    const s = servidor();
    await abrirPagina(ADMIN, s);
    // A DIR já foi lida há pouco (cache de 5 s): sem invalidar, a próxima leitura não iria ao servidor.
    await useDir().fetchDir();
    const leiturasDir = (): number => s.chamadas.filter((c) => c.url === "/api/dir").length;
    expect(leiturasDir()).toBe(1);

    q<HTMLButtonElement>("#btn-encaminhar-dir")!.click();
    await esperar();
    q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.click();
    await esperar();

    const posts = s.chamadas.filter((c) => c.metodo === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.corpo).toEqual({ atualizadoEm: "2026-12-01T12:00:00.000Z" });
    expect(texto(q("#encaminhar-resultado-titulo"))).toBe("Encaminhada: 2 linhas criadas na DIR");
    expect(texto(q("#compra-titulo"))).toBeTruthy();
    // a ordem do formulário passa a mostrar "Encaminhada em dd/mm" (compra substituída pela devolvida)
    expect(texto(q("#ordem-ord_teste_0001-encaminhada"))).toBe("Encaminhada em 01/12");

    await useDir().fetchDir();
    expect(leiturasDir()).toBe(2); // o cache foi invalidado
  });

  it("'Voltar ao resumo' fecha o painel e devolve o checklist e o resumo", async () => {
    await abrirPagina(ADMIN, servidor());
    q<HTMLButtonElement>("#btn-encaminhar-dir")!.click();
    await esperar();
    q<HTMLButtonElement>("#btn-encaminhar-voltar")!.click();
    await esperar();
    expect(q("#compra-encaminhar")).toBeNull();
    expect(q("#compra-resumo")).not.toBeNull();
    expect(q("#compra-checklist")).not.toBeNull();
  });

  it("409 de versão no POST: abre a faixa de conflito do formulário com 'Carregar a versão salva'", async () => {
    const s = servidor();
    s.respostaPost = async () => resposta(409, { statusMessage: "Esta compra foi alterada por outra pessoa. Recarregue para ver a versão atual.", data: { atual: s.compra } });
    await abrirPagina(ADMIN, s);
    q<HTMLButtonElement>("#btn-encaminhar-dir")!.click();
    await esperar();
    q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.click();
    await esperar();
    expect(q("#compra-faixa-conflito")).not.toBeNull();
    expect(q("#btn-conflito-carregar")).not.toBeNull();
    expect(texto(q("#encaminhar-erro-envio"))).toContain("alterada por outra pessoa");
    expect(q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.disabled).toBe(true);
  });

  it("PO que já existe na DIR: a prévia mostra o erro no painel E o 'N pendências' do cabeçalho do formulário o conta", async () => {
    const s = servidor();
    await abrirPagina(ADMIN, s);
    const pendenciasAntes = q("#compra-pendencias, #compra-pendencias-celular");
    expect(pendenciasAntes).toBeNull(); // compra pronta: sem pendências
    s.previa = previaTeste(s.compra, { conflitosPo: ["PO26-12-9999"] });
    q<HTMLButtonElement>("#btn-encaminhar-dir")!.click();
    await esperar();
    expect(texto(q("#compra-checklist-erros"))).toContain("PO26-12-9999 já existe na DIR");
    expect(q<HTMLButtonElement>("#btn-encaminhar-confirmar")!.disabled).toBe(true);
    expect(texto(q("#compra-pendencias"))).toBe("1 pendência");
  });
});

describe("travas na página: o 409 do autosave e o cancelar", () => {
  async function editarPaciente(): Promise<void> {
    const campo = q<HTMLInputElement>("#compra-paciente")!;
    campo.value = "TESTE PACIENTE EDITADO";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(900);
    await esperar();
  }

  it("409 po_travado no autosave: a faixa mostra a mensagem do servidor e SÓ 'Carregar a versão salva'", async () => {
    const ja = { dirId: "dir_ord_teste_0001", encaminhadaEm: "2026-12-01T10:00:00.000Z" };
    const s = servidor(compraTeste({ ordens: [ordemTeste(1, ja), ordemTeste(2)] }));
    s.respostaPatch = async () => resposta(409, { statusMessage: "PO travado: já encaminhado; altere na DIR", data: { code: "po_travado", ordemId: "ord_teste_0001", atual: s.compra } });
    await abrirPagina(ADMIN, s);
    await editarPaciente();
    expect(texto(q("#compra-faixa-conflito-texto"))).toBe("PO travado: já encaminhado; altere na DIR");
    expect(q("#btn-conflito-carregar")).not.toBeNull();
    expect(q("#btn-conflito-manter")).toBeNull();
  });

  it("409 comum no autosave: as duas saídas continuam", async () => {
    const s = servidor();
    s.respostaPatch = async () => resposta(409, { statusMessage: "Esta compra foi alterada por outra pessoa. Recarregue para ver a versão atual.", data: { atual: s.compra } });
    await abrirPagina(ADMIN, s);
    await editarPaciente();
    expect(texto(q("#compra-faixa-conflito-texto"))).toBe("Esta compra foi alterada por outra pessoa.");
    expect(q("#btn-conflito-carregar")).not.toBeNull();
    expect(q("#btn-conflito-manter")).not.toBeNull();
  });

  it("o PO da ordem encaminhada aparece desabilitado no formulário da página", async () => {
    const ja = { dirId: "dir_ord_teste_0001", encaminhadaEm: "2026-12-01T10:00:00.000Z" };
    await abrirPagina(ADMIN, servidor(compraTeste({ ordens: [ordemTeste(1, ja), ordemTeste(2)] })));
    expect(q<HTMLInputElement>("#ordem-ord_teste_0001-po")!.disabled).toBe(true);
    expect(q<HTMLInputElement>("#ordem-ord_teste_0002-po")!.disabled).toBe(false);
  });

  it("Cancelar compra com ordem encaminhada: o diálogo avisa que as linhas da DIR continuam; sem ordem encaminhada, não", async () => {
    const ja = { dirId: "dir_ord_teste_0001", encaminhadaEm: "2026-12-01T10:00:00.000Z" };
    await abrirPagina(ADMIN, servidor(compraTeste({ ordens: [ordemTeste(1, ja), ordemTeste(2)] })));
    q<HTMLButtonElement>("#btn-cancelar-compra")!.click();
    await esperar();
    expect(texto(document.body)).toContain("Há ordens já encaminhadas para a DIR. As linhas da DIR continuam existindo e não são alteradas.");
    document.body.innerHTML = "";
    montados.pop()!();
    await abrirPagina(ADMIN, servidor());
    q<HTMLButtonElement>("#btn-cancelar-compra")!.click();
    await esperar();
    expect(texto(document.body)).toContain("Ela continua na lista como cancelada");
    expect(texto(document.body)).not.toContain("Há ordens já encaminhadas para a DIR");
  });
});
