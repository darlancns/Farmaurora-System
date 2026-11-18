// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Cadastro } from "../../shared/types/Cadastro";
import CadastrosTab from "../../app/components/configuracoes/CadastrosTab.vue";
import { useState } from "./helpers/nuxtAppStub";

// A aba Cadastros inteira (componentes reais no happy-dom, servidor falso em memória): QUATRO seções recolhíveis, todas
// fechadas ao abrir; busca por nome em todas as listas; painel lateral de criar/editar com devolução do foco; chave
// "Ativo" aplicada na hora com "Desativado. Desfazer"; coluna e campo PIX só para quem a API entrega a chave.
// Valores de PIX fictícios: a chave nunca pode aparecer em texto da tela.

const BASE = { ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };
const PIX_D1 = "chave-ficticia-aba-despachante-0001";
const PIX_T1 = "chave-ficticia-aba-transportadora-0002";

function dadosIniciais(): Record<string, Array<Record<string, unknown>>> {
  return {
    fornecedores: [
      { ...BASE, id: "f1", nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false },
      { ...BASE, id: "f2", nome: "Matsun", pais: "", prazoAlertaDias: null, semAlerta: true, ativo: false },
    ],
    despachantes: [
      { ...BASE, id: "d1", nome: "STAR CUSTOMS", contatoNome: "Fulano", telefone: "", email: "", chavePix: PIX_D1 },
      { ...BASE, id: "d2", nome: "SOUTH AMERICA", contatoNome: "", telefone: "", email: "", chavePix: "" },
    ],
    transportadoras: [
      { ...BASE, id: "t1", nome: "DHL", chavePix: PIX_T1 },
      { ...BASE, id: "t2", nome: "FedEx", chavePix: "", ativo: false },
    ],
    "cias-aereas": [
      { ...BASE, id: "c1", nome: "Lufthansa" },
      { ...BASE, id: "c2", nome: "Emirates" },
    ],
  };
}

interface Chamada {
  metodo: string;
  url: string;
  corpo: Record<string, unknown> | null;
}
interface Servidor {
  dados: Record<string, Array<Record<string, unknown>>>;
  chamadas: Chamada[];
  /** Respostas de erro a devolver (uma por chamada que casar, na ordem). */
  falhas: Array<{ metodo: string; status: number; mensagem: string }>;
  /** Se definida, segura as respostas de PATCH até ser chamada (para provar a resposta otimista da chave). */
  segurar: { liberar: () => void } | null;
  comPix: boolean;
}

let servidor: Servidor;
let proximoId = 0;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

function instalarServidor(role: AuthUser["role"]): void {
  // Como o servidor real: a chave só vai para o administrador e para quem lê Pagamentos (sócio e operacional, sem mapa).
  servidor = { dados: dadosIniciais(), chamadas: [], falhas: [], segurar: null, comPix: role !== "consultor" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const metodo = (opts?.method ?? "GET").toUpperCase();
      const corpo = opts?.body ? (JSON.parse(String(opts.body)) as Record<string, unknown>) : null;
      servidor.chamadas.push({ metodo, url: String(url), corpo });
      const [, lista, id] = /^\/api\/cadastros\/([\w-]+)(?:\/([\w-]+))?$/.exec(String(url)) ?? [];
      const itens = servidor.dados[lista!] ?? [];
      const falha = servidor.falhas.findIndex((f) => f.metodo === metodo);
      if (falha >= 0) {
        const f = servidor.falhas.splice(falha, 1)[0]!;
        return json({ statusMessage: f.mensagem }, f.status);
      }
      const visivel = (i: Record<string, unknown>) => {
        if (servidor.comPix) return i;
        const { chavePix: _removida, ...resto } = i; // sem a chave: a propriedade nem existe
        return resto;
      };
      if (metodo === "GET") return json(itens.map(visivel));
      if (servidor.segurar && metodo === "PATCH") await new Promise<void>((liberar) => (servidor.segurar!.liberar = liberar));
      if (metodo === "POST") {
        const novo = { ...BASE, id: `novo_${(proximoId += 1)}`, atualizadoPor: "Cris", ...corpo };
        itens.push(novo);
        return json(visivel(novo));
      }
      const alvo = itens.find((i) => i.id === id);
      if (!alvo) return json({ statusMessage: "Item não encontrado." }, 404);
      Object.assign(alvo, corpo);
      return json(visivel(alvo));
    }),
  );
}

const conta = (role: AuthUser["role"]): AuthUser => ({ id: "u1", email: "u@x.com", role, isAdmin: role === "administrador" });

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
async function assentar(): Promise<void> {
  for (let i = 0; i < 10; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}
async function montar(role: AuthUser["role"] = "administrador"): Promise<void> {
  instalarServidor(role);
  useState<AuthUser | null>("auth-user").value = conta(role);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render: () => h(CadastrosTab) }));
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  await assentar();
}

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const toast = () => useState<string | null>("toast-message").value;
const aberta = (lista: string) => q(`#btn-secao-${lista}`)!.getAttribute("aria-expanded") === "true";
const SECOES = ["fornecedores", "despachantes", "transportadoras", "cias-aereas"] as const;

async function clicar(sel: string): Promise<void> {
  q<HTMLElement>(sel)!.click();
  await assentar();
}
async function digitar(sel: string, valor: string): Promise<void> {
  const input = q<HTMLInputElement>(sel)!;
  input.value = valor;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await assentar();
}
async function marcar(sel: string): Promise<void> {
  const radio = q<HTMLInputElement>(sel)!;
  radio.checked = true;
  radio.dispatchEvent(new Event("change", { bubbles: true }));
  await nextTick();
}
async function salvar(): Promise<void> {
  q<HTMLFormElement>("#cadastro-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  await assentar();
}
const gravacoes = () => servidor.chamadas.filter((c) => c.metodo !== "GET");

beforeEach(() => {
  useState<Record<string, Cadastro[]>>("cadastros").value = { fornecedores: [], despachantes: [], transportadoras: [], "cias-aereas": [] };
  useState<string | null>("toast-message").value = null;
});
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CadastrosTab — seções recolhíveis", () => {
  it("administrador: 4 seções, nesta ordem, cada uma com título, contagem e '+ Adicionar'", async () => {
    await montar();
    expect([...document.querySelectorAll("#cadastros-tab > section")].map((s) => s.id)).toEqual(SECOES.map((l) => `cadastro-secao-${l}`));
    expect(SECOES.map((l) => texto(q(`#cadastro-titulo-${l}`)))).toEqual(["Fornecedores", "Despachantes", "Transportadoras", "Cias aéreas"]);
    expect(SECOES.map((l) => texto(q(`#cadastro-contagem-${l}`)))).toEqual(["2 · 1 ativo", "2 · 2 ativos", "2 · 1 ativo", "2 · 2 ativos"]);
    for (const l of SECOES) expect(texto(q(`#btn-adicionar-cadastro-${l}`)), l).toBe("+ Adicionar");
    expect(servidor.chamadas.filter((c) => c.metodo === "GET").map((c) => c.url).sort()).toEqual(
      SECOES.map((l) => `/api/cadastros/${l}`).sort(),
    );
  });

  it("TODAS as seções começam FECHADAS (aria-expanded false e corpo escondido); não há abas internas", async () => {
    await montar();
    for (const l of SECOES) {
      expect(aberta(l), l).toBe(false);
      expect(q<HTMLElement>(`#cadastro-corpo-${l}`)!.hasAttribute("hidden"), l).toBe(true);
      expect(q(`#btn-secao-${l}`)!.getAttribute("aria-controls")).toBe(`cadastro-corpo-${l}`);
    }
    expect(q('[role="radiogroup"]')).toBeNull();
    expect(q("#cadastro-lista-escolha")).toBeNull();
  });

  it("clicar no título abre; clicar de novo fecha; várias podem ficar abertas ao mesmo tempo", async () => {
    await montar();
    await clicar("#btn-secao-fornecedores");
    expect(aberta("fornecedores")).toBe(true);
    expect(q<HTMLElement>("#cadastro-corpo-fornecedores")!.hasAttribute("hidden")).toBe(false);
    await clicar("#btn-secao-cias-aereas");
    expect(aberta("fornecedores") && aberta("cias-aereas")).toBe(true);
    expect(aberta("despachantes")).toBe(false);
    await clicar("#btn-secao-fornecedores");
    expect(aberta("fornecedores")).toBe(false);
    expect(aberta("cias-aereas")).toBe(true);
  });

  it("aberta, a seção mostra a tabela com os itens e os inativos ao final", async () => {
    await montar();
    await clicar("#btn-secao-fornecedores");
    const ordem = [...document.querySelectorAll("#cadastro-lista-fornecedores tbody tr")].map((tr) => tr.id);
    expect(ordem).toEqual(["cadastro-row-fornecedores-f1", "cadastro-row-fornecedores-f2"]);
    expect(texto(q("#cadastro-row-fornecedores-f1"))).toContain("3 dias");
    expect(texto(q("#cadastro-row-fornecedores-f2"))).toContain("(inativo)");
  });

  it("quem não escreve não vê '+ Adicionar', a chave Ativo nem abre o painel (só leitura)", async () => {
    await montar("socio");
    expect(document.querySelectorAll("#cadastros-tab > section")).toHaveLength(4);
    expect(document.querySelectorAll("[id^='btn-adicionar-cadastro-']")).toHaveLength(0);
    await clicar("#btn-secao-fornecedores");
    expect(document.querySelectorAll("[role='switch']")).toHaveLength(0);
    await clicar("#cadastro-row-fornecedores-f1");
    expect(q("#cadastro-painel")).toBeNull();
  });
});

describe("CadastrosTab — busca por nome", () => {
  it("o campo tem rótulo, não é capitalizado e começa vazio, sem resumo", async () => {
    await montar();
    const campo = q<HTMLInputElement>("#cadastros-busca")!;
    expect(campo.value).toBe("");
    expect(campo.hasAttribute("data-sem-maiuscula")).toBe(true);
    expect(texto(q("label[for='cadastros-busca']"))).toBe("Buscar por nome em todas as listas");
    expect(texto(q("#cadastros-busca-resumo"))).toBe("");
    expect(q("#btn-cadastros-busca-limpar")).toBeNull();
  });

  it("filtra em TODAS as listas, abre só as seções com resultado e destaca a contagem encontrada", async () => {
    await montar();
    await digitar("#cadastros-busca", "dhl");
    expect(aberta("transportadoras")).toBe(true);
    for (const l of ["fornecedores", "despachantes", "cias-aereas"]) expect(aberta(l), l).toBe(false);
    const contagem = q<HTMLElement>("#cadastro-contagem-transportadoras")!;
    expect(texto(contagem)).toBe("1 encontrado");
    expect(contagem.className).toContain("font-semibold");
    expect(contagem.className).toContain("bg-farm-blue-soft");
    expect(texto(q("#cadastro-contagem-fornecedores"))).toBe("0 encontrados");
    expect([...document.querySelectorAll("#cadastro-lista-transportadoras tbody tr")].map((tr) => tr.id)).toEqual(["cadastro-row-transportadoras-t1"]);
    expect(texto(q("#cadastros-busca-resumo"))).toBe("1 encontrado em 1 lista.");
  });

  it("um termo que casa em várias listas abre todas elas", async () => {
    await montar();
    await digitar("#cadastros-busca", "a"); // Matsun, STAR CUSTOMS, SOUTH AMERICA, Lufthansa, Emirates (DHL e FedEx não têm "a")
    expect(texto(q("#cadastros-busca-resumo"))).toBe("5 encontrados em 3 listas.");
    for (const l of ["fornecedores", "despachantes", "cias-aereas"]) expect(aberta(l), l).toBe(true);
    expect(aberta("transportadoras")).toBe(false);
  });

  it("sem acento, sem diferença de caixa e com espaços sobrando", async () => {
    await montar();
    await digitar("#cadastros-busca", "  LUFTHANSA ");
    expect(aberta("cias-aereas")).toBe(true);
    expect(texto(q("#cadastro-contagem-cias-aereas"))).toBe("1 encontrado");
    await digitar("#cadastros-busca", "star   customs");
    expect(aberta("despachantes")).toBe(true);
  });

  it("sem resultado: nenhuma seção abre, todas mostram '0 encontrados' e o resumo avisa", async () => {
    await montar();
    await digitar("#cadastros-busca", "inexistente");
    for (const l of SECOES) {
      expect(aberta(l), l).toBe(false);
      expect(texto(q(`#cadastro-contagem-${l}`)), l).toBe("0 encontrados");
    }
    expect(texto(q("#cadastros-busca-resumo"))).toBe("Nenhum item encontrado.");
  });

  it("a busca é só pelo NOME: não acha por país, contato nem chave PIX", async () => {
    await montar();
    await digitar("#cadastros-busca", "turquia");
    expect(texto(q("#cadastros-busca-resumo"))).toBe("Nenhum item encontrado.");
    await digitar("#cadastros-busca", "fulano");
    expect(texto(q("#cadastros-busca-resumo"))).toBe("Nenhum item encontrado.");
    await digitar("#cadastros-busca", "chave-ficticia");
    expect(texto(q("#cadastros-busca-resumo"))).toBe("Nenhum item encontrado.");
  });

  it("limpar a busca (botão) devolve a abertura que a pessoa tinha escolhido e foca o campo", async () => {
    await montar();
    await clicar("#btn-secao-fornecedores"); // aberta à mão
    await digitar("#cadastros-busca", "dhl");
    expect(aberta("transportadoras")).toBe(true);
    expect(aberta("fornecedores")).toBe(false); // sem resultado durante a busca
    await clicar("#btn-cadastros-busca-limpar");
    expect(q<HTMLInputElement>("#cadastros-busca")!.value).toBe("");
    expect(aberta("fornecedores")).toBe(true); // a escolha manual voltou
    expect(aberta("transportadoras")).toBe(false);
    expect(texto(q("#cadastro-contagem-transportadoras"))).toBe("2 · 1 ativo");
    expect(texto(q("#cadastros-busca-resumo"))).toBe("");
    expect(document.activeElement?.id).toBe("cadastros-busca");
  });

  it("durante a busca dá para fechar uma seção à mão; digitar de novo a reabre", async () => {
    await montar();
    await digitar("#cadastros-busca", "dhl");
    await clicar("#btn-secao-transportadoras");
    expect(aberta("transportadoras")).toBe(false);
    await digitar("#cadastros-busca", "dh");
    expect(aberta("transportadoras")).toBe(true);
  });

  it("uma seção sem resultado não abre ao clicar durante a busca", async () => {
    await montar();
    await digitar("#cadastros-busca", "dhl");
    await clicar("#btn-secao-fornecedores");
    expect(aberta("fornecedores")).toBe(false);
  });
});

describe("CadastrosTab — painel lateral", () => {
  it("'+ Adicionar' abre o painel vazio da SUA lista", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-transportadoras");
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Nova transportadora");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.value).toBe("");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.disabled).toBe(false);
    await clicar("#btn-cadastro-cancelar");
    expect(q("#cadastro-painel")).toBeNull();
    await clicar("#btn-adicionar-cadastro-fornecedores");
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Novo fornecedor");
    expect(q("#cadastro-form-alerta")).not.toBeNull();
  });

  it("clicar na linha abre o painel de edição daquele item, com o nome desabilitado", async () => {
    await montar();
    await clicar("#btn-secao-fornecedores");
    await clicar("#cadastro-row-fornecedores-f1");
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Editar fornecedor");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.value).toBe("Poros");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.disabled).toBe(true);
    expect(q<HTMLInputElement>("#cadastro-form-pais")!.value).toBe("Turquia");
  });

  it("ao fechar o painel o foco volta para a linha (o botão do nome) ou para o '+ Adicionar'", async () => {
    await montar();
    await clicar("#btn-secao-fornecedores");
    await clicar("#cadastro-row-fornecedores-f1");
    await clicar("#btn-painel-cadastro-fechar");
    expect(q("#cadastro-painel")).toBeNull();
    expect(document.activeElement?.id).toBe("cadastro-abrir-fornecedores-f1");

    await clicar("#btn-adicionar-cadastro-fornecedores");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await assentar();
    expect(q("#cadastro-painel")).toBeNull();
    expect(document.activeElement?.id).toBe("btn-adicionar-cadastro-fornecedores");
  });

  it("criar: grava (POST), avisa, fecha o painel, abre a seção e o item aparece", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-cias-aereas");
    await digitar("#cadastro-form-nome", "Qatar");
    await salvar();
    expect(gravacoes()).toEqual([{ metodo: "POST", url: "/api/cadastros/cias-aereas", corpo: { nome: "Qatar" } }]);
    expect(toast()).toBe("Cia aérea criada.");
    expect(q("#cadastro-painel")).toBeNull();
    expect(aberta("cias-aereas")).toBe(true);
    expect(texto(q("#cadastro-contagem-cias-aereas"))).toBe("3 · 3 ativos");
    expect(texto(q("#cadastro-corpo-cias-aereas"))).toContain("Qatar");
  });

  it("criar fornecedor sem decidir o alerta: avisa e o painel continua aberto", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-fornecedores");
    await digitar("#cadastro-form-nome", "Speciality");
    await salvar();
    expect(gravacoes()).toEqual([]);
    expect(toast()).toMatch(/Defina o alerta/);
    expect(q("#cadastro-painel")).not.toBeNull();
    await marcar("#cadastro-form-alerta-sem");
    await salvar();
    expect(gravacoes()).toHaveLength(1);
    expect(q("#cadastro-painel")).toBeNull();
  });

  it("409 do servidor (nome repetido numa corrida): avisa com a mensagem da API e o painel continua aberto", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-cias-aereas");
    await digitar("#cadastro-form-nome", "Swiss");
    servidor.falhas.push({ metodo: "POST", status: 409, mensagem: "Já existe um item com esse nome." });
    await salvar();
    expect(toast()).toBe("Já existe um item com esse nome.");
    expect(q("#cadastro-painel")).not.toBeNull();
  });

  it("editar: PATCH sem o nome, aviso 'Alterações salvas.' e o painel fecha", async () => {
    await montar();
    await clicar("#btn-secao-fornecedores");
    await clicar("#cadastro-row-fornecedores-f1");
    await digitar("#cadastro-form-prazo", "10");
    await salvar();
    expect(gravacoes()).toEqual([
      { metodo: "PATCH", url: "/api/cadastros/fornecedores/f1", corpo: { pais: "Turquia", semAlerta: false, prazoAlertaDias: 10 } },
    ]);
    expect(toast()).toBe("Alterações salvas.");
    expect(q("#cadastro-painel")).toBeNull();
    expect(texto(q("#cadastro-row-fornecedores-f1"))).toContain("10 dias");
  });

  it("nome repetido de item INATIVO: o painel oferece Reativar, que reativa e fecha", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-fornecedores");
    await digitar("#cadastro-form-nome", "matsun");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/Reative-o/);
    await clicar("#btn-cadastro-reativar-duplicado");
    expect(gravacoes()).toEqual([{ metodo: "PATCH", url: "/api/cadastros/fornecedores/f2", corpo: { ativo: true } }]);
    expect(toast()).toBe('"Matsun" reativado.');
    expect(q("#cadastro-painel")).toBeNull();
    expect(texto(q("#cadastro-contagem-fornecedores"))).toBe("2 · 2 ativos");
  });

  it("o painel substitui o modal: não existe mais o modal de cadastro", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-cias-aereas");
    expect(q("#cadastro-form-overlay")).toBeNull();
    expect(q("[data-overlay='modal']")).toBeNull();
    expect(q("#cadastro-painel-overlay")).not.toBeNull();
  });
});

describe("CadastrosTab — chave Ativo (na hora, com 'Desfazer')", () => {
  it("desativar: PATCH na hora, SEM janela de confirmação; avisa 'Desativado.' com Desfazer; o item vira inativo", async () => {
    await montar();
    await clicar("#btn-secao-cias-aereas");
    await clicar("#cadastro-switch-cias-aereas-c1");
    expect(gravacoes()).toEqual([{ metodo: "PATCH", url: "/api/cadastros/cias-aereas/c1", corpo: { ativo: false } }]);
    expect(q("#confirm-dialog-overlay")).toBeNull();
    expect(q("[data-overlay='modal']")).toBeNull();
    expect(texto(q("#cadastro-desfazer"))).toBe("Desativado. Desfazer");
    expect(q("#btn-cadastro-desfazer")!.getAttribute("aria-label")).toBe("Desfazer: reativar Lufthansa");
    expect(texto(q("#cadastro-row-cias-aereas-c1"))).toContain("(inativo)");
    expect(q("#cadastro-switch-cias-aereas-c1")!.getAttribute("aria-checked")).toBe("false");
    expect(texto(q("#cadastro-contagem-cias-aereas"))).toBe("2 · 1 ativo");
    // O item inativo vai para o fim da lista.
    expect([...document.querySelectorAll("#cadastro-lista-cias-aereas tbody tr")].map((tr) => tr.id)).toEqual([
      "cadastro-row-cias-aereas-c2",
      "cadastro-row-cias-aereas-c1",
    ]);
  });

  it("clicar na chave NÃO abre o painel", async () => {
    await montar();
    await clicar("#btn-secao-cias-aereas");
    await clicar("#cadastro-switch-cias-aereas-c1");
    expect(q("#cadastro-painel")).toBeNull();
  });

  it("a chave responde na hora, antes de o servidor responder; um segundo clique no mesmo item é ignorado", async () => {
    await montar();
    await clicar("#btn-secao-cias-aereas");
    servidor.segurar = { liberar: () => undefined };
    q<HTMLElement>("#cadastro-switch-cias-aereas-c1")!.click();
    await assentar();
    expect(q("#cadastro-switch-cias-aereas-c1")!.getAttribute("aria-checked")).toBe("false"); // já desligada
    q<HTMLElement>("#cadastro-switch-cias-aereas-c1")!.click();
    await assentar();
    expect(gravacoes()).toHaveLength(1);
    servidor.segurar.liberar();
    await assentar();
    expect(q("#cadastro-desfazer")).not.toBeNull();
  });

  it("Desfazer reativa (PATCH ativo true), some o aviso e confirma com 'Reativado.'", async () => {
    await montar();
    await clicar("#btn-secao-cias-aereas");
    await clicar("#cadastro-switch-cias-aereas-c1");
    servidor.segurar = null;
    await clicar("#btn-cadastro-desfazer");
    expect(gravacoes().at(-1)).toEqual({ metodo: "PATCH", url: "/api/cadastros/cias-aereas/c1", corpo: { ativo: true } });
    expect(q("#cadastro-desfazer")).toBeNull();
    expect(toast()).toBe("Reativado.");
    expect(q("#cadastro-switch-cias-aereas-c1")!.getAttribute("aria-checked")).toBe("true");
    expect(texto(q("#cadastro-contagem-cias-aereas"))).toBe("2 · 2 ativos");
  });

  it("reativar pela chave: aviso 'Reativado.' e sem 'Desfazer'", async () => {
    await montar();
    await clicar("#btn-secao-fornecedores");
    await clicar("#cadastro-switch-fornecedores-f2");
    expect(gravacoes()).toEqual([{ metodo: "PATCH", url: "/api/cadastros/fornecedores/f2", corpo: { ativo: true } }]);
    expect(toast()).toBe("Reativado.");
    expect(q("#cadastro-desfazer")).toBeNull();
    expect(texto(q("#cadastro-row-fornecedores-f2"))).not.toContain("(inativo)");
  });

  it("falha ao gravar: mostra a mensagem, a chave volta ao valor real e não há 'Desfazer'", async () => {
    await montar();
    await clicar("#btn-secao-cias-aereas");
    servidor.falhas.push({ metodo: "PATCH", status: 500, mensagem: "Falha temporária. Tente novamente." });
    await clicar("#cadastro-switch-cias-aereas-c1");
    expect(toast()).toBe("Falha temporária. Tente novamente.");
    expect(q("#cadastro-switch-cias-aereas-c1")!.getAttribute("aria-checked")).toBe("true");
    expect(q("#cadastro-desfazer")).toBeNull();
    expect(texto(q("#cadastro-contagem-cias-aereas"))).toBe("2 · 2 ativos");
  });

  it("o aviso 'Desativado. Desfazer' some sozinho depois de alguns segundos", async () => {
    await montar();
    await clicar("#btn-secao-cias-aereas");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    q<HTMLElement>("#cadastro-switch-cias-aereas-c1")!.click();
    await vi.advanceTimersByTimeAsync(0); // o servidor falso responde em microtarefas; o relógio falso não trava
    for (let i = 0; i < 10; i++) await nextTick();
    expect(q("#cadastro-desfazer")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(6000);
    expect(q("#cadastro-desfazer")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1500);
    await nextTick();
    expect(q("#cadastro-desfazer")).toBeNull();
  });

  it("desativar outro item troca o aviso para o último; os dois ficam desativados", async () => {
    await montar();
    await clicar("#btn-secao-cias-aereas");
    await clicar("#cadastro-switch-cias-aereas-c1");
    await clicar("#cadastro-switch-cias-aereas-c2");
    expect(q("#btn-cadastro-desfazer")!.getAttribute("aria-label")).toBe("Desfazer: reativar Emirates");
    expect(texto(q("#cadastro-contagem-cias-aereas"))).toBe("2 · 0 ativos");
  });

  it("cada chave tem aria-label com o nome do item (tabela e celular)", async () => {
    await montar();
    await clicar("#btn-secao-transportadoras");
    expect(q("#cadastro-switch-transportadoras-t1")!.getAttribute("aria-label")).toBe("Ativo: DHL");
    expect(q("#cadastro-switch-card-transportadoras-t2")!.getAttribute("aria-label")).toBe("Ativo: FedEx");
  });
});

describe("CadastrosTab — chave PIX (dado financeiro)", () => {
  it("administrador: coluna PIX só diz 'Cadastrada' ou '—', e a chave NUNCA aparece na tela", async () => {
    await montar("administrador");
    await clicar("#btn-secao-despachantes");
    await clicar("#btn-secao-transportadoras");
    expect(texto(q("#cadastro-row-despachantes-d1"))).toContain("Cadastrada");
    expect(texto(q("#cadastro-row-despachantes-d2"))).not.toContain("Cadastrada");
    expect(texto(q("#cadastro-row-transportadoras-t1"))).toContain("Cadastrada");
    expect(texto(q("#cadastro-card-despachantes-d1"))).toContain("PIX cadastrada");
    expect(document.body.innerHTML).not.toContain(PIX_D1);
    expect(document.body.innerHTML).not.toContain(PIX_T1);
  });

  it("no painel de edição o campo PIX vem preenchido e oculto (password); Mostrar revela só no campo", async () => {
    await montar("administrador");
    await clicar("#btn-secao-despachantes");
    await clicar("#cadastro-row-despachantes-d1");
    const campo = q<HTMLInputElement>("#cadastro-form-pix")!;
    expect(campo.type).toBe("password");
    expect(campo.value).toBe(PIX_D1);
    expect(texto(q("#cadastro-painel"))).not.toContain(PIX_D1);
    await clicar("#btn-cadastro-pix-mostrar");
    expect(q<HTMLInputElement>("#cadastro-form-pix")!.type).toBe("text");
    expect(texto(q("#cadastro-painel"))).not.toContain(PIX_D1); // o valor continua só no input
  });

  it("salvar sem mexer na chave não a envia; mudar a chave envia só o necessário; '' limpa", async () => {
    await montar("administrador");
    await clicar("#btn-secao-transportadoras");
    await clicar("#cadastro-row-transportadoras-t1");
    await salvar();
    expect(gravacoes()).toEqual([]);
    expect(toast()).toMatch(/Nenhuma alteração/);

    await digitar("#cadastro-form-pix", "chave-ficticia-aba-nova-0003");
    await salvar();
    expect(gravacoes()).toEqual([{ metodo: "PATCH", url: "/api/cadastros/transportadoras/t1", corpo: { chavePix: "chave-ficticia-aba-nova-0003" } }]);
    expect(toast()).toBe("Alterações salvas.");
    expect(document.body.innerHTML).not.toContain("chave-ficticia-aba-nova-0003");

    await clicar("#cadastro-row-transportadoras-t1");
    await digitar("#cadastro-form-pix", "");
    await salvar();
    expect(gravacoes().at(-1)!.corpo).toEqual({ chavePix: "" });
  });

  it("criar transportadora com chave: o POST leva a chave e a tela só mostra 'Cadastrada'", async () => {
    await montar("administrador");
    await clicar("#btn-adicionar-cadastro-transportadoras");
    await digitar("#cadastro-form-nome", "Fast Log");
    await digitar("#cadastro-form-pix", "chave-ficticia-aba-nova-0004");
    await salvar();
    expect(gravacoes()).toEqual([
      { metodo: "POST", url: "/api/cadastros/transportadoras", corpo: { nome: "Fast Log", chavePix: "chave-ficticia-aba-nova-0004" } },
    ]);
    expect(texto(q("#cadastro-corpo-transportadoras"))).toContain("Fast Log");
    expect(document.body.innerHTML).not.toContain("chave-ficticia-aba-nova-0004");
  });

  it("consultor (a API não entrega a chave): sem coluna PIX, sem 'PIX cadastrada' e sem campo PIX", async () => {
    await montar("consultor");
    await clicar("#btn-secao-despachantes");
    await clicar("#btn-secao-transportadoras");
    const titulos = [...document.querySelectorAll("#cadastro-lista-despachantes thead th")].map((th) => texto(th));
    expect(titulos).not.toContain("PIX");
    expect(texto(q("#cadastro-corpo-transportadoras"))).not.toContain("Cadastrada");
    expect(texto(q("#cadastro-corpo-despachantes"))).not.toContain("PIX cadastrada");
    expect(q("#cadastro-form-pix")).toBeNull();
    expect(document.body.innerHTML).not.toContain(PIX_D1);
  });

  it("sócio e operacional sem mapa recebem a chave (leem Pagamentos): veem a coluna PIX", async () => {
    await montar("operacional");
    await clicar("#btn-secao-despachantes");
    const titulos = [...document.querySelectorAll("#cadastro-lista-despachantes thead th")].map((th) => texto(th));
    expect(titulos).toContain("PIX");
    expect(document.body.innerHTML).not.toContain(PIX_D1);
  });
});
