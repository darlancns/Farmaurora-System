// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { LISTAS_CADASTRO } from "../../shared/constants/cadastros";
import type { AuthUser } from "../../shared/types/auth";
import type { Cadastro } from "../../shared/types/Cadastro";
import CadastrosTab from "../../app/components/configuracoes/CadastrosTab.vue";
import { useState } from "./helpers/nuxtAppStub";

// A aba Cadastros inteira (componentes reais no happy-dom, servidor falso em memória): CINCO seções recolhíveis, todas
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
    consultores: [
      { ...BASE, id: "k1", nome: "Mateus Morais" },
      { ...BASE, id: "k2", nome: "Junior", ativo: false },
    ],
    // Sem a letra "a" nos nomes: a busca por "a" abaixo conta só as outras listas.
    temperaturas: [
      { ...BASE, id: "p1", nome: "2°C - 8°C" },
      { ...BASE, id: "p2", nome: "-20°C", ativo: false },
    ],
    // Sem a letra "a" nos nomes, pelo mesmo motivo.
    medicamentos: [
      { ...BASE, id: "m1", nome: "TIMOLOL 5 MG", temperatura: "2°C - 8°C" },
      { ...BASE, id: "m2", nome: "ZOLPIDEM 10 MG", temperatura: "-20°C", ativo: false },
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
  /** Consultores: o que o GET /impacto devolve, o resultado das contas no PATCH de renomear e no "tentar de novo". */
  impacto: Record<string, unknown>;
  contasNoPatch: { atualizadas: number; falhas: Array<{ id: string; email: string }> };
  contasNoRetry: { atualizadas: number; falhas: Array<{ id: string; email: string }> };
}

let servidor: Servidor;
let proximoId = 0;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

function instalarServidor(role: AuthUser["role"]): void {
  // Como o servidor real: a chave só vai para o administrador e para quem lê Pagamentos (sócio e operacional, sem mapa).
  servidor = {
    dados: dadosIniciais(),
    chamadas: [],
    falhas: [],
    segurar: null,
    comPix: role !== "consultor",
    impacto: { nome: "Mateus Morais", processos: 25, pacientes: 4, dir: 106, compras: 7, contas: 1 },
    contasNoPatch: { atualizadas: 1, falhas: [] },
    contasNoRetry: { atualizadas: 1, falhas: [] },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const metodo = (opts?.method ?? "GET").toUpperCase();
      const corpo = opts?.body ? (JSON.parse(String(opts.body)) as Record<string, unknown>) : null;
      servidor.chamadas.push({ metodo, url: String(url), corpo });
      // Pré-cadastros pendentes (sem nenhum nesta aba; a seção de pendentes tem o spec próprio).
      if (String(url).startsWith("/api/cadastros/pre-medicamentos")) return json({ status: "pendente", total: 0, itens: [] });
      // Consultores: impacto (só leitura) e "tentar de novo" das contas de login.
      if (/^\/api\/cadastros\/consultores\/[\w-]+\/impacto$/.test(String(url))) return json(servidor.impacto);
      if (/^\/api\/cadastros\/consultores\/[\w-]+\/renomear-contas$/.test(String(url))) return json(servidor.contasNoRetry);
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
      const nomeAntigo = String(alvo.nome);
      Object.assign(alvo, corpo);
      // Renomear consultor: o servidor devolve também o que mudou e o resultado das contas de login.
      if (lista === "consultores" && corpo && "nome" in corpo && corpo.nome !== nomeAntigo) {
        return json({ ...visivel(alvo), renomeacao: { nomeAntigo, processos: 25, pacientes: 4, dir: 106, compras: 7, contas: servidor.contasNoPatch } });
      }
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
const SECOES = ["fornecedores", "despachantes", "transportadoras", "cias-aereas", "consultores", "temperaturas", "medicamentos"] as const;

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
  useState<Record<string, Cadastro[]>>("cadastros").value = Object.fromEntries(LISTAS_CADASTRO.map((lista) => [lista, []]));
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
  it("administrador: 7 seções, nesta ordem, cada uma com título, contagem e '+ Adicionar'", async () => {
    await montar();
    expect([...document.querySelectorAll("#cadastros-tab > section")].map((s) => s.id)).toEqual(SECOES.map((l) => `cadastro-secao-${l}`));
    expect(SECOES.map((l) => texto(q(`#cadastro-titulo-${l}`)))).toEqual(["Fornecedores", "Despachantes", "Transportadoras", "Cias aéreas", "Consultores", "Temperaturas", "Medicamentos"]);
    expect(SECOES.map((l) => texto(q(`#cadastro-contagem-${l}`)))).toEqual(["2 · 1 ativo", "2 · 2 ativos", "2 · 1 ativo", "2 · 2 ativos", "2 · 1 ativo", "2 · 1 ativo", "2 · 1 ativo"]);
    for (const l of SECOES) expect(texto(q(`#btn-adicionar-cadastro-${l}`)), l).toBe("+ Adicionar");
    // As sete listas e, só para o administrador, os pré-cadastros pendentes (a seção "Pendentes de aprovação" some quando não há nenhum).
    expect(servidor.chamadas.filter((c) => c.metodo === "GET").map((c) => c.url).sort()).toEqual(
      [...SECOES.map((l) => `/api/cadastros/${l}`), "/api/cadastros/pre-medicamentos?status=pendente"].sort(),
    );
    expect(q("#cadastro-pendentes")).toBeNull();
    expect(q("#cadastro-pendentes-etiqueta-medicamentos")).toBeNull();
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
    expect(document.querySelectorAll("#cadastros-tab > section")).toHaveLength(SECOES.length);
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
    for (const l of ["fornecedores", "despachantes", "cias-aereas", "consultores", "temperaturas", "medicamentos"]) expect(aberta(l), l).toBe(false);
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
    await digitar("#cadastros-busca", "a"); // Matsun, STAR CUSTOMS, SOUTH AMERICA, Lufthansa, Emirates, Mateus Morais (DHL, FedEx e Junior não têm "a")
    expect(texto(q("#cadastros-busca-resumo"))).toBe("6 encontrados em 4 listas.");
    for (const l of ["fornecedores", "despachantes", "cias-aereas", "consultores"]) expect(aberta(l), l).toBe(true);
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


describe("CadastrosTab — Consultores (5ª lista; a ÚNICA fonte de consultores do sistema)", () => {
  it("a seção Consultores é a quinta (antes de Temperaturas), recolhível e SEM o aviso antigo (só valia para a DIR); tabela compacta Nome + Ativo, ativo antes do inativo", async () => {
    await montar();
    expect([...document.querySelectorAll("#cadastros-tab > section")].map((s) => s.id)[4]).toBe("cadastro-secao-consultores");
    expect(aberta("consultores")).toBe(false);
    await clicar("#btn-secao-consultores");
    expect(aberta("consultores")).toBe(true);
    expect(q("[id^='cadastro-aviso-']")).toBeNull();
    expect(document.body.textContent).not.toContain("Por enquanto esta lista vale só para a DIR");
    expect([...document.querySelectorAll("#cadastro-lista-consultores thead th")].map((th) => texto(th))).toEqual(["Nome", "Ativo"]);
    expect([...document.querySelectorAll("#cadastro-lista-consultores tbody tr")].map((tr) => tr.id)).toEqual([
      "cadastro-row-consultores-k1",
      "cadastro-row-consultores-k2",
    ]);
    expect(texto(q("#cadastro-row-consultores-k2"))).toContain("(inativo)");
  });

  it("+ Adicionar cria só com o nome (POST /api/cadastros/consultores), aviso 'Consultor criado.' e a contagem sobe", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-consultores");
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Novo consultor");
    await digitar("#cadastro-form-nome", "  Consultor   Teste ");
    await salvar();
    expect(gravacoes()).toEqual([{ metodo: "POST", url: "/api/cadastros/consultores", corpo: { nome: "Consultor Teste" } }]);
    expect(toast()).toBe("Consultor criado.");
    expect(q("#cadastro-painel")).toBeNull();
    expect(texto(q("#cadastro-contagem-consultores"))).toBe("3 · 2 ativos");
  });

  it("nome repetido de consultor ATIVO: aviso e botão Criar desabilitado; de INATIVO: o painel oferece Reativar", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-consultores");
    await digitar("#cadastro-form-nome", "mateus morais");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/Já existe "Mateus Morais"/);
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    await digitar("#cadastro-form-nome", "junior");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/Reative-o/);
    await clicar("#btn-cadastro-reativar-duplicado");
    expect(gravacoes()).toEqual([{ metodo: "PATCH", url: "/api/cadastros/consultores/k2", corpo: { ativo: true } }]);
    expect(toast()).toBe('"Junior" reativado.');
  });

  it("Outro é reservado: aviso e nenhuma gravação", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-consultores");
    await digitar("#cadastro-form-nome", "outro");
    expect(q("#cadastro-form-aviso-reservado")).not.toBeNull();
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
  });

  it("remover = desativar pela chave Ativo (PATCH { ativo:false }); nunca DELETE", async () => {
    await montar();
    await clicar("#btn-secao-consultores");
    await clicar("#cadastro-switch-consultores-k1");
    expect(gravacoes()).toEqual([{ metodo: "PATCH", url: "/api/cadastros/consultores/k1", corpo: { ativo: false } }]);
    expect(texto(q("#cadastro-contagem-consultores"))).toBe("2 · 0 ativos");
    expect(gravacoes().some((c) => c.metodo === "DELETE")).toBe(false);
  });

  it("quem não é administrador vê a lista, mas sem + Adicionar, sem chave Ativo e sem abrir o painel", async () => {
    await montar("operacional");
    expect(q("#btn-adicionar-cadastro-consultores")).toBeNull();
    await clicar("#btn-secao-consultores");
    expect(texto(q("#cadastro-corpo-consultores"))).toContain("Mateus Morais");
    expect(q("#cadastro-switch-consultores-k1")).toBeNull();
    expect(q("#cadastro-abrir-consultores-k1")).toBeNull();
  });
});

describe("CadastrosTab — renomear consultor (só consultores; com confirmação e contagens)", () => {
  async function abrirEdicaoDoMateus(): Promise<void> {
    await montar();
    await clicar("#btn-secao-consultores");
    await clicar("#cadastro-row-consultores-k1");
  }

  it("o painel do consultor deixa o NOME editável (e só o nome); nas outras listas o nome continua travado", async () => {
    await abrirEdicaoDoMateus();
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Editar consultor");
    const nome = q<HTMLInputElement>("#cadastro-form-nome")!;
    expect(nome.value).toBe("Mateus Morais");
    expect(nome.disabled).toBe(false);
    expect(texto(q("#cadastro-form-nome-dica"))).toMatch(/Renomear atualiza o consultor em todo o sistema/);
    expect(q("#cadastro-form-pix-bloco")).toBeNull();
    await clicar("#btn-cadastro-cancelar");
    await clicar("#btn-secao-fornecedores");
    await clicar("#cadastro-row-fornecedores-f1");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.disabled).toBe(true);
  });

  it("sem mudar o nome o Salvar fica desabilitado e nada é enviado; mudar só acento/caixa vale", async () => {
    await abrirEdicaoDoMateus();
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    await salvar();
    expect(servidor.chamadas.filter((c) => c.url.includes("impacto"))).toEqual([]);
    expect(gravacoes()).toEqual([]);
    await digitar("#cadastro-form-nome", "MATEUS MORAIS");
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(false);
  });

  it("nome de OUTRO consultor (ativo ou inativo) bloqueia o salvar com aviso; Outro também; o próprio nome com outra caixa não conta como repetido", async () => {
    await abrirEdicaoDoMateus();
    await digitar("#cadastro-form-nome", "junior");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/Já existe "Junior"/);
    expect(q("#btn-cadastro-reativar-duplicado")).toBeNull();
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    await digitar("#cadastro-form-nome", "outro");
    expect(q("#cadastro-form-aviso-reservado")).not.toBeNull();
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    await digitar("#cadastro-form-nome", "mateus morais");
    expect(q("#cadastro-form-aviso-duplicado")).toBeNull();
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(false);
  });

  it("Salvar com nome novo NÃO grava: pede as contagens (GET, só leitura) e abre a confirmação com os números", async () => {
    await abrirEdicaoDoMateus();
    await digitar("#cadastro-form-nome", "Mateus Teste");
    await salvar();
    expect(servidor.chamadas.filter((c) => c.url.endsWith("/impacto")).map((c) => c.metodo)).toEqual(["GET"]);
    expect(gravacoes()).toEqual([]);
    expect(texto(q("#confirm-dialog-title"))).toBe("Renomear consultor");
    expect(texto(q("#confirm-dialog-message"))).toBe(
      'Renomear "Mateus Morais" para "Mateus Teste"? O novo nome passa a valer em 25 processos do Follow-Up, 4 prestações, 106 POs da DIR, 7 compras e 1 conta de login. Vale para todo o sistema e não é desfeito automaticamente.',
    );
    expect(q("#cadastro-painel")).not.toBeNull(); // o painel continua aberto até confirmar
  });

  it("Cancelar na confirmação: nada é gravado e o painel segue aberto", async () => {
    await abrirEdicaoDoMateus();
    await digitar("#cadastro-form-nome", "Mateus Teste");
    await salvar();
    await clicar("#btn-confirm-dialog-cancel");
    expect(q("#confirm-dialog-message")).toBeNull();
    expect(gravacoes()).toEqual([]);
    expect(q("#cadastro-painel")).not.toBeNull();
    expect(texto(q("#cadastro-row-consultores-k1"))).toContain("Mateus Morais");
  });

  it("Confirmar: PATCH só com o nome, aviso 'Consultor renomeado.', o painel fecha e a lista mostra o nome novo", async () => {
    await abrirEdicaoDoMateus();
    await digitar("#cadastro-form-nome", "Mateus Teste");
    await salvar();
    await clicar("#btn-confirm-dialog-confirm");
    expect(gravacoes()).toEqual([{ metodo: "PATCH", url: "/api/cadastros/consultores/k1", corpo: { nome: "Mateus Teste" } }]);
    expect(toast()).toBe("Consultor renomeado.");
    expect(q("#cadastro-painel")).toBeNull();
    expect(q("#cadastros-contas-falha")).toBeNull();
    expect(texto(q("#cadastro-row-consultores-k1"))).toContain("Mateus Teste");
    // A resposta traz `renomeacao`, mas ela não vai parar no item da lista.
    const item = useState<Record<string, Cadastro[]>>("cadastros").value.consultores!.find((i) => i.id === "k1")!;
    expect(item).not.toHaveProperty("renomeacao");
  });

  it("se alguma conta de login não foi atualizada, a tela LISTA quais e oferece 'Tentar de novo' (que some quando tudo certo)", async () => {
    await abrirEdicaoDoMateus();
    servidor.contasNoPatch = { atualizadas: 0, falhas: [{ id: "c1", email: "conta.teste@x.com" }] };
    servidor.contasNoRetry = { atualizadas: 1, falhas: [] };
    await digitar("#cadastro-form-nome", "Mateus Teste");
    await salvar();
    await clicar("#btn-confirm-dialog-confirm");

    expect(texto(q("#cadastros-contas-falha-texto"))).toBe("Consultor renomeado, mas 1 conta de login não foi atualizada. Tente de novo:");
    expect(texto(q("#cadastros-contas-falha"))).toContain("conta.teste@x.com");
    await clicar("#btn-cadastros-contas-tentar-de-novo");
    expect(servidor.chamadas.at(-1)).toEqual({
      metodo: "POST",
      url: "/api/cadastros/consultores/k1/renomear-contas",
      corpo: { nomeAntigo: "Mateus Morais" },
    });
    expect(q("#cadastros-contas-falha")).toBeNull();
    expect(toast()).toBe("Contas de login atualizadas.");
  });

  it("tentar de novo e ainda falhar: a lista de pendentes é atualizada e o aviso continua", async () => {
    await abrirEdicaoDoMateus();
    servidor.contasNoPatch = {
      atualizadas: 0,
      falhas: [
        { id: "c1", email: "um@x.com" },
        { id: "c2", email: "dois@x.com" },
      ],
    };
    servidor.contasNoRetry = { atualizadas: 1, falhas: [{ id: "c2", email: "dois@x.com" }] };
    await digitar("#cadastro-form-nome", "Mateus Teste");
    await salvar();
    await clicar("#btn-confirm-dialog-confirm");
    expect(texto(q("#cadastros-contas-falha-texto"))).toBe("Consultor renomeado, mas 2 contas de login não foram atualizadas. Tente de novo:");
    await clicar("#btn-cadastros-contas-tentar-de-novo");
    expect(texto(q("#cadastros-contas-falha-texto"))).toBe("Consultor renomeado, mas 1 conta de login não foi atualizada. Tente de novo:");
    expect(texto(q("#cadastros-contas-falha"))).toContain("dois@x.com");
    expect(texto(q("#cadastros-contas-falha"))).not.toContain("um@x.com");
    await clicar("#btn-cadastros-contas-falha-fechar");
    expect(q("#cadastros-contas-falha")).toBeNull();
  });

  it("409 do servidor (nome tomado numa corrida): avisa com a mensagem da API e o painel continua aberto", async () => {
    await abrirEdicaoDoMateus();
    await digitar("#cadastro-form-nome", "Mateus Teste");
    await salvar();
    servidor.falhas.push({ metodo: "PATCH", status: 409, mensagem: "Já existe outro consultor com esse nome." });
    await clicar("#btn-confirm-dialog-confirm");
    expect(toast()).toBe("Já existe outro consultor com esse nome.");
    expect(q("#cadastro-painel")).not.toBeNull();
    expect(q("#cadastros-contas-falha")).toBeNull();
  });
});

describe("CadastrosTab — Temperaturas e Medicamentos (6ª e 7ª listas)", () => {
  async function escolherTemperatura(nome: string): Promise<void> {
    q<HTMLButtonElement>("#cadastro-form-temperatura")!.click();
    await assentar();
    const opcao = [...document.querySelectorAll<HTMLElement>("#cadastro-form-temperatura-listbox [role='option']")].find((li) => texto(li) === nome);
    expect(opcao, `opção ${nome}`).toBeDefined();
    opcao!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await assentar();
  }

  it("as duas seções são as últimas, nesta ordem; Medicamentos mostra a coluna Temperatura", async () => {
    await montar();
    expect([...document.querySelectorAll("#cadastros-tab > section")].map((s) => s.id).slice(-2)).toEqual([
      "cadastro-secao-temperaturas",
      "cadastro-secao-medicamentos",
    ]);
    await clicar("#btn-secao-medicamentos");
    expect([...document.querySelectorAll("#cadastro-lista-medicamentos thead th")].map((th) => texto(th))).toEqual(["Nome", "Temperatura", "Ativo"]);
    expect([...document.querySelectorAll("#cadastro-lista-medicamentos tbody tr")].map((tr) => tr.id)).toEqual([
      "cadastro-row-medicamentos-m1",
      "cadastro-row-medicamentos-m2",
    ]);
    expect(texto(q("#cadastro-row-medicamentos-m1"))).toContain("2°C - 8°C");
  });

  it("criar medicamento: o painel é o dele (nome + temperatura) e o POST leva nome em MAIÚSCULAS e a temperatura ATIVA escolhida", async () => {
    await montar();
    await clicar("#btn-adicionar-cadastro-medicamentos");
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Novo medicamento");
    q<HTMLButtonElement>("#cadastro-form-temperatura")!.click();
    await assentar();
    // As temperaturas vêm do estado compartilhado: só a ativa ("2°C - 8°C"); a inativa ("-20°C") não é oferecida.
    expect([...document.querySelectorAll("#cadastro-form-temperatura-listbox [role='option']")].map((li) => texto(li))).toEqual(["Selecione", "2°C - 8°C"]);
    q<HTMLButtonElement>("#cadastro-form-temperatura")!.click(); // fecha a lista
    await assentar();

    await digitar("#cadastro-form-nome", "teste medicamento");
    await salvar();
    expect(gravacoes()).toEqual([]);
    expect(toast()).toBe("Informe a temperatura.");
    expect(q("#cadastro-painel")).not.toBeNull();

    await escolherTemperatura("2°C - 8°C");
    await salvar();
    expect(gravacoes()).toEqual([
      { metodo: "POST", url: "/api/cadastros/medicamentos", corpo: { nome: "TESTE MEDICAMENTO", temperatura: "2°C - 8°C" } },
    ]);
    expect(toast()).toBe("Medicamento criado.");
    expect(q("#cadastro-painel")).toBeNull();
    expect(aberta("medicamentos")).toBe(true);
    expect(texto(q("#cadastro-contagem-medicamentos"))).toBe("3 · 2 ativos");
    expect(texto(q("#cadastro-corpo-medicamentos"))).toContain("TESTE MEDICAMENTO");
  });

  it("renomear medicamento: PATCH só com o nome, sem a janela de confirmação do consultor", async () => {
    await montar();
    await clicar("#btn-secao-medicamentos");
    await clicar("#cadastro-row-medicamentos-m1");
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Editar medicamento");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.disabled).toBe(false);
    await digitar("#cadastro-form-nome", "timolol 10 mg");
    await salvar();
    expect(q("#confirm-dialog-overlay")).toBeNull();
    expect(gravacoes()).toEqual([{ metodo: "PATCH", url: "/api/cadastros/medicamentos/m1", corpo: { nome: "TIMOLOL 10 MG" } }]);
    expect(servidor.chamadas.some((c) => c.url.includes("/impacto"))).toBe(false);
    expect(toast()).toBe("Alterações salvas.");
    expect(q("#cadastro-painel")).toBeNull();
    expect(texto(q("#cadastro-row-medicamentos-m1"))).toContain("TIMOLOL 10 MG");
  });

  it("422 do servidor (temperatura inativa numa corrida): mostra a mensagem da API e o painel continua aberto", async () => {
    await montar();
    await clicar("#btn-secao-medicamentos");
    await clicar("#cadastro-row-medicamentos-m1");
    servidor.falhas.push({ metodo: "PATCH", status: 422, mensagem: "Essa temperatura está inativa. Escolha uma temperatura ativa." });
    await digitar("#cadastro-form-nome", "timolol 10 mg");
    await salvar();
    expect(toast()).toBe("Essa temperatura está inativa. Escolha uma temperatura ativa.");
    expect(q("#cadastro-painel")).not.toBeNull();
  });

  it("temperatura: o painel de edição é só leitura (o nome não muda) e a chave Ativo grava na hora", async () => {
    await montar();
    await clicar("#btn-secao-temperaturas");
    await clicar("#cadastro-row-temperaturas-p1");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.disabled).toBe(true);
    expect(q("#btn-cadastro-salvar")).toBeNull();
    await clicar("#btn-cadastro-cancelar");
    await clicar("#cadastro-switch-temperaturas-p1");
    expect(gravacoes()).toEqual([{ metodo: "PATCH", url: "/api/cadastros/temperaturas/p1", corpo: { ativo: false } }]);
  });
});

describe("CadastrosTab — 414 medicamentos: linhas só com a seção aberta e 'Mostrar mais' de 50 em 50", () => {
  const nomeMed = (n: number) => `MED ${String(n).padStart(3, "0")}`;
  const quatrocentosEQuatorze = (): Cadastro[] =>
    Array.from({ length: 414 }, (_, i) => ({ ...BASE, id: `med_${i + 1}`, nome: nomeMed(i + 1), temperatura: "2°C - 8°C" }) as unknown as Cadastro);

  async function montarComMedicamentos(): Promise<void> {
    await montar();
    const estado = useState<Record<string, Cadastro[]>>("cadastros");
    estado.value = { ...estado.value, medicamentos: quatrocentosEQuatorze() };
    await assentar();
  }
  const linhasTabela = () => document.querySelectorAll("#cadastro-lista-medicamentos tbody tr").length;
  const itensCelular = () => document.querySelectorAll("#cadastro-corpo-medicamentos ul > li").length;
  const botaoMais = () => q<HTMLButtonElement>("#btn-mostrar-mais-medicamentos");

  it("fechada: NENHUMA linha de nenhuma lista no DOM (nem escondida), mas o corpo do aria-controls existe e a contagem é a da lista inteira", async () => {
    await montarComMedicamentos();
    expect(texto(q("#cadastro-contagem-medicamentos"))).toBe("414 · 414 ativos");
    expect(q("#btn-secao-medicamentos")!.getAttribute("aria-controls")).toBe("cadastro-corpo-medicamentos");
    expect(q<HTMLElement>("#cadastro-corpo-medicamentos")!.hasAttribute("hidden")).toBe(true);
    expect(document.querySelectorAll("[id^='cadastro-row-'], [id^='cadastro-card-']")).toHaveLength(0);
    expect(q("#cadastro-lista-medicamentos")).toBeNull();
    expect(botaoMais()).toBeNull();
  });

  it("aberta: só 50 linhas na tabela e 50 itens do celular, e o botão 'Mostrar mais (50 de 364)'", async () => {
    await montarComMedicamentos();
    await clicar("#btn-secao-medicamentos");
    expect(linhasTabela()).toBe(50);
    expect(itensCelular()).toBe(50);
    expect(texto(botaoMais())).toBe("Mostrar mais (50 de 364)");
    expect(q("#cadastro-row-medicamentos-med_1")).not.toBeNull();
    expect(q("#cadastro-row-medicamentos-med_51")).toBeNull();
    expect(texto(q("#cadastro-contagem-medicamentos"))).toBe("414 · 414 ativos");
  });

  it("'Mostrar mais' soma 50 por vez até o fim (a última página diz '14 de 14') e some quando acaba", async () => {
    await montarComMedicamentos();
    await clicar("#btn-secao-medicamentos");
    await clicar("#btn-mostrar-mais-medicamentos");
    expect(linhasTabela()).toBe(100);
    expect(texto(botaoMais())).toBe("Mostrar mais (50 de 314)");
    for (let i = 0; i < 6; i++) await clicar("#btn-mostrar-mais-medicamentos"); // 150, 200, 250, 300, 350, 400
    expect(linhasTabela()).toBe(400);
    expect(texto(botaoMais())).toBe("Mostrar mais (14 de 14)");
    await clicar("#btn-mostrar-mais-medicamentos");
    expect(linhasTabela()).toBe(414);
    expect(itensCelular()).toBe(414);
    expect(botaoMais()).toBeNull();
  });

  it("fechar e abrir de novo volta aos 50 primeiros", async () => {
    await montarComMedicamentos();
    await clicar("#btn-secao-medicamentos");
    await clicar("#btn-mostrar-mais-medicamentos");
    expect(linhasTabela()).toBe(100);
    await clicar("#btn-secao-medicamentos");
    expect(linhasTabela()).toBe(0);
    await clicar("#btn-secao-medicamentos");
    expect(linhasTabela()).toBe(50);
  });

  it("a busca filtra os 414 pelo nome, mostra só os 50 primeiros do resultado e voltar a digitar reinicia a página", async () => {
    await montarComMedicamentos();
    await digitar("#cadastros-busca", "med 1"); // casa MED 100 a MED 199 (100 itens)
    expect(aberta("medicamentos")).toBe(true);
    const total = quatrocentosEQuatorze().filter((m) => m.nome.toLowerCase().includes("med 1")).length;
    expect(texto(q("#cadastro-contagem-medicamentos"))).toBe(`${total} encontrados`);
    expect(linhasTabela()).toBe(50);
    expect(texto(botaoMais())).toBe(`Mostrar mais (50 de ${total - 50})`);

    await clicar("#btn-mostrar-mais-medicamentos");
    expect(linhasTabela()).toBe(100);
    await digitar("#cadastros-busca", "med 10"); // 10 itens: MED 100-109
    expect(texto(q("#cadastro-contagem-medicamentos"))).toBe("10 encontrados");
    expect(linhasTabela()).toBe(10);
    expect(botaoMais()).toBeNull();

    await digitar("#cadastros-busca", "med 1");
    expect(linhasTabela()).toBe(50); // a página voltou a 50 (não ficou nos 100 de antes)
  });

  it("criar um medicamento que cai DEPOIS da primeira página: a lista cresce até ele aparecer", async () => {
    await montarComMedicamentos();
    await clicar("#btn-adicionar-cadastro-medicamentos");
    await digitar("#cadastro-form-nome", "zzz teste");
    // As temperaturas vêm do estado compartilhado; a do estado inicial é "2°C - 8°C".
    q<HTMLButtonElement>("#cadastro-form-temperatura")!.click();
    await assentar();
    [...document.querySelectorAll<HTMLElement>("#cadastro-form-temperatura-listbox [role='option']")]
      .find((li) => texto(li) === "2°C - 8°C")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await assentar();
    await salvar();
    expect(gravacoes()).toHaveLength(1);
    const novo = document.querySelector("[id^='cadastro-row-medicamentos-novo_']");
    expect(novo, "o item novo está entre as linhas desenhadas").not.toBeNull();
    expect(texto(novo)).toContain("ZZZ TESTE");
    expect(linhasTabela()).toBe(415);
    expect(botaoMais()).toBeNull();
  });
});
