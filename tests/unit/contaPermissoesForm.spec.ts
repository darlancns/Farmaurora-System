// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import type { AdminUserSummary, UpdateUserRoleDTO } from "../../shared/types/auth";
import type { NovaContaDTO } from "../../app/composables/useContas";
import { ROLES, type Role } from "../../shared/utils/rbac";
import { SECOES_COM_PERMISSAO, type Permissoes } from "../../shared/utils/permissoesPagina";
import {
  AVISO_TUDO_NENHUM,
  MENSAGEM_PERMISSAO_SALVA,
  ROTULO_SECAO_PERMISSAO,
  padraoDoCargo,
  permissoesParaEnvio,
  usaMapaDePermissoes,
  valoresDoMapa,
  valoresTudoNenhum,
} from "../../app/utils/contaPermissoesForm";
import { parseContaInput } from "../../server/utils/authUser";
import ContaFormModal from "../../app/components/configuracoes/ContaFormModal.vue";
import ContasTab from "../../app/components/configuracoes/ContasTab.vue";
import { useAuth } from "../../app/composables/useAuth";
import { useContas } from "../../app/composables/useContas";
import { useContasAdmin } from "../../app/composables/useContasAdmin";
import { useToast } from "../../app/composables/useToast";

// A tabela de permissões por página no formulário de Contas (componente real no happy-dom): o que aparece, o que é
// enviado em cada situação e, sobretudo, que NADA é enviado quando a pessoa não mexe na tabela.

const NENHUM = valoresTudoNenhum();
const MAPA: Permissoes = { processos: "ver", pagamentos: "editar", patients: "nenhum" };

// ── infraestrutura ───────────────────────────────────────────────────────────────────────────────────
const montados: Array<{ app: App; el: HTMLElement }> = [];

function montar(render: () => ReturnType<typeof h>): void {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render }));
  app.mount(el);
  montados.push({ app, el });
}

async function esperar(): Promise<void> {
  for (let i = 0; i < 6; i++) await nextTick();
}

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string): T[] => Array.from(document.querySelectorAll<T>(sel));
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function conta(extra: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    id: "c1",
    email: "bruno@farmaurora.com.br",
    role: "operacional",
    nome: "Bruno Alves",
    permissoes: null,
    createdAt: "2026-01-01T00:00:00Z",
    lastSignInAt: null,
    ...extra,
  };
}

interface Eventos {
  create: NovaContaDTO[];
  update: Array<{ id: string; payload: UpdateUserRoleDTO }>;
  invalid: string[];
}

function abrir(editingConta: AdminUserSummary | null): Eventos {
  const ev: Eventos = { create: [], update: [], invalid: [] };
  montar(() =>
    h(ContaFormModal, {
      editingConta,
      consultoresEmUso: {},
      busy: false,
      onCreate: (p: NovaContaDTO) => ev.create.push(p),
      onUpdate: (id: string, payload: UpdateUserRoleDTO) => ev.update.push({ id, payload }),
      onInvalid: (m: string) => ev.invalid.push(m),
      onClose: () => undefined,
    }),
  );
  return ev;
}

async function escolherCargo(rotulo: string): Promise<void> {
  $("#conta-role")!.click();
  await esperar();
  const opcao = $$("li[role='option']").find((li) => texto(li) === rotulo);
  expect(opcao, `cargo ${rotulo}`).toBeDefined();
  opcao!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await esperar();
}

async function escolherConsultor(nome: string): Promise<void> {
  $("#conta-consultor")!.click();
  await esperar();
  const opcao = $$("li[role='option']").find((li) => texto(li) === nome);
  opcao!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await esperar();
}

async function digitar(sel: string, valor: string): Promise<void> {
  const campo = $<HTMLInputElement>(sel)!;
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  await esperar();
}

async function preencherNova(): Promise<void> {
  await digitar("#conta-nome", "Maria Souza");
  await digitar("#conta-email", "maria@farmaurora.com.br");
  await digitar("#conta-senha", "senha-forte-123");
}

async function escolherNivel(secao: string, nivel: string): Promise<void> {
  const radio = $<HTMLInputElement>(`#perm-${secao}-${nivel}`)!;
  radio.click();
  await esperar();
}

const marcado = (secao: string): string | undefined =>
  $$<HTMLInputElement>(`input[name='perm-${secao}']`).find((r) => r.checked)?.value;

const tabelaAtual = () => Object.fromEntries(SECOES_COM_PERMISSAO.map((s) => [s, marcado(s)]));

async function salvar(): Promise<void> {
  $("#conta-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await esperar();
}

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.app.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
});

// ── regras puras ─────────────────────────────────────────────────────────────────────────────────────
describe("contaPermissoesForm — regras puras", () => {
  it("padraoDoCargo reproduz o que cada cargo tem hoje, seção a seção", () => {
    expect(padraoDoCargo("operacional")).toEqual({ processos: "editar", pagamentos: "editar", patients: "nenhum" });
    expect(padraoDoCargo("socio")).toEqual({ processos: "editar", pagamentos: "editar", patients: "editar" });
  });

  it("só sócio e operacional usam o mapa", () => {
    expect(ROLES.filter(usaMapaDePermissoes)).toEqual(["socio", "operacional"]);
  });

  it("valoresDoMapa completa com 'nenhum' e aceita null", () => {
    expect(valoresDoMapa({ processos: "ver" })).toEqual({ processos: "ver", pagamentos: "nenhum", patients: "nenhum" });
    expect(valoresDoMapa(null)).toEqual(NENHUM);
  });

  it("os rótulos cobrem toda seção do mapa, com os nomes da interface", () => {
    expect(SECOES_COM_PERMISSAO.map((s) => ROTULO_SECAO_PERMISSAO[s])).toEqual(["Processos", "Pagamentos", "Prestação de Contas"]);
  });

  describe("permissoesParaEnvio", () => {
    const base = { valores: { ...NENHUM, processos: "ver" as const }, tocada: false, restaurar: false };
    it("consultor e administrador: nunca, nem com a tabela mexida ou 'restaurar'", () => {
      for (const role of ["consultor", "administrador"] as const) {
        for (const modo of ["criacao", "edicao"] as const) {
          expect(permissoesParaEnvio({ ...base, role, modo, tocada: true, restaurar: true })).toEqual({ incluir: false });
        }
      }
    });
    it("criação: sempre o mapa completo, mexido ou não", () => {
      for (const tocada of [false, true]) {
        expect(permissoesParaEnvio({ ...base, role: "socio", modo: "criacao", tocada })).toEqual({ incluir: true, valor: base.valores });
      }
    });
    it("edição: intacta = não envia; mexida = mapa completo; restaurar = null (restaurar vence)", () => {
      expect(permissoesParaEnvio({ ...base, role: "operacional", modo: "edicao" })).toEqual({ incluir: false });
      expect(permissoesParaEnvio({ ...base, role: "operacional", modo: "edicao", tocada: true })).toEqual({ incluir: true, valor: base.valores });
      expect(permissoesParaEnvio({ ...base, role: "operacional", modo: "edicao", restaurar: true })).toEqual({ incluir: true, valor: null });
    });
  });
});

// ── nova conta ───────────────────────────────────────────────────────────────────────────────────────
describe("ContaFormModal — nova conta", () => {
  it("a tabela só aparece para Sócio e Operacional", async () => {
    abrir(null);
    await esperar();
    expect($("#permissoes-conta")).toBeNull(); // cargo inicial: Consultor
    for (const [cargo, aparece] of [["Sócio", true], ["Operacional", true], ["Administrador", false], ["Consultor", false]] as const) {
      await escolherCargo(cargo);
      expect($("#permissoes-conta") !== null, cargo).toBe(aparece);
    }
  });

  it("operacional: 3 linhas na ordem do mapa, todas 'Nenhum', com o aviso; o POST leva o mapa completo", async () => {
    const ev = abrir(null);
    await escolherCargo("Operacional");
    await preencherNova();

    expect($$("[id^='perm-grupo-']").map((g) => g.id)).toEqual(SECOES_COM_PERMISSAO.map((s) => `perm-grupo-${s}`));
    expect($$("[id^='perm-grupo-'] legend").map(texto)).toEqual(["Processos", "Pagamentos", "Prestação de Contas"]);
    expect(tabelaAtual()).toEqual({ processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" });
    expect(texto($("#permissoes-aviso-nenhum"))).toBe(AVISO_TUDO_NENHUM);
    expect($("#permissoes-padrao-rotulo")).toBeNull(); // conta nova não tem "padrão do cargo"
    expect($("#btn-permissoes-restaurar")).toBeNull();

    await salvar();
    expect(ev.invalid).toEqual([]);
    expect(ev.create).toHaveLength(1);
    expect(ev.create[0]).toMatchObject({ email: "maria@farmaurora.com.br", role: "operacional", nome: "Maria Souza" });
    expect(ev.create[0]!.permissoes).toEqual({ processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" });
  });

  it("trocar um nível: o POST leva o nível e o aviso some", async () => {
    const ev = abrir(null);
    await escolherCargo("Sócio");
    await preencherNova();
    await escolherNivel("pagamentos", "ver");
    await escolherNivel("patients", "editar");
    expect(tabelaAtual()).toEqual({ processos: "nenhum", pagamentos: "ver", patients: "editar" });
    expect($("#permissoes-aviso-nenhum")).toBeNull();

    await salvar();
    expect(ev.create[0]!.permissoes).toEqual({ processos: "nenhum", pagamentos: "ver", patients: "editar" });
    expect(Object.keys(ev.create[0]!.permissoes!).sort()).toEqual([...SECOES_COM_PERMISSAO].sort());
  });

  it("voltar tudo para 'Nenhum' traz o aviso de volta (e continua podendo salvar)", async () => {
    const ev = abrir(null);
    await escolherCargo("Operacional");
    await preencherNova();
    await escolherNivel("processos", "editar");
    expect($("#permissoes-aviso-nenhum")).toBeNull();
    await escolherNivel("processos", "nenhum");
    expect($("#permissoes-aviso-nenhum")).not.toBeNull();
    await salvar();
    expect(ev.create).toHaveLength(1);
  });

  it("administrador e consultor: o POST NÃO tem permissoes, mesmo depois de mexer na tabela e trocar o cargo", async () => {
    const ev = abrir(null);
    await escolherCargo("Operacional");
    await escolherNivel("processos", "editar");
    await escolherCargo("Administrador");
    expect($("#permissoes-conta")).toBeNull();
    await preencherNova();
    await salvar();
    expect(ev.create[0]).toMatchObject({ role: "administrador" });
    expect(ev.create[0]).not.toHaveProperty("permissoes");

    await escolherCargo("Consultor");
    await escolherConsultor("André Vitório");
    await salvar();
    expect(ev.create[1]).toMatchObject({ role: "consultor" });
    expect(ev.create[1]).not.toHaveProperty("permissoes");
  });

  it("trocar entre sócio e operacional mantém a tabela", async () => {
    const ev = abrir(null);
    await escolherCargo("Sócio");
    await preencherNova();
    await escolherNivel("processos", "ver");
    await escolherNivel("patients", "editar");
    await escolherCargo("Operacional");
    expect(tabelaAtual()).toEqual({ processos: "ver", pagamentos: "nenhum", patients: "editar" });
    await salvar();
    expect(ev.create[0]).toMatchObject({ role: "operacional" });
    expect(ev.create[0]!.permissoes).toEqual({ processos: "ver", pagamentos: "nenhum", patients: "editar" });
  });
});

// ── editar conta ─────────────────────────────────────────────────────────────────────────────────────
describe("ContaFormModal — editar conta SEM mapa gravado (o Bruno de hoje)", () => {
  it("mostra o padrão do cargo, rotulado, sem 'Restaurar'; salvar sem mexer NÃO envia permissoes", async () => {
    const ev = abrir(conta());
    await esperar();
    expect(tabelaAtual()).toEqual({ processos: "editar", pagamentos: "editar", patients: "nenhum" });
    expect(texto($("#permissoes-padrao-rotulo"))).toBe("Padrão do cargo");
    expect($("#btn-permissoes-restaurar")).toBeNull();
    expect($("#permissoes-aviso-nenhum")).toBeNull();

    await salvar();
    expect(ev.update).toHaveLength(1);
    expect(ev.update[0]!.id).toBe("c1");
    expect(ev.update[0]!.payload).toMatchObject({ role: "operacional", nome: "Bruno Alves" });
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });

  it("sócio sem mapa: padrão do sócio, também sem enviar nada", async () => {
    const ev = abrir(conta({ role: "socio", nome: "Sócia" }));
    await esperar();
    expect(tabelaAtual()).toEqual({ processos: "editar", pagamentos: "editar", patients: "editar" });
    await salvar();
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });

  it("mexer em UMA linha: o PATCH leva o mapa completo (padrão do cargo nas linhas não mexidas)", async () => {
    const ev = abrir(conta());
    await esperar();
    await escolherNivel("pagamentos", "ver");
    expect($("#permissoes-padrao-rotulo")).toBeNull(); // deixou de ser o padrão
    expect($("#btn-permissoes-restaurar")).not.toBeNull();
    await salvar();
    expect(ev.update[0]!.payload.permissoes).toEqual({ processos: "editar", pagamentos: "ver", patients: "nenhum" });
    expect(Object.keys(ev.update[0]!.payload.permissoes!)).toHaveLength(3);
  });

  it("mexer e voltar ao mesmo valor ainda conta como mexida (a pessoa decidiu)", async () => {
    const ev = abrir(conta());
    await esperar();
    await escolherNivel("processos", "ver");
    await escolherNivel("processos", "editar");
    await salvar();
    expect(ev.update[0]!.payload.permissoes).toEqual({ processos: "editar", pagamentos: "editar", patients: "nenhum" });
  });

  it("'Restaurar padrão do cargo' depois de mexer volta ao padrão, rotulado, e sem mapa não envia nada", async () => {
    const ev = abrir(conta());
    await esperar();
    await escolherNivel("patients", "editar");
    $("#btn-permissoes-restaurar")!.click();
    await esperar();
    expect(tabelaAtual()).toEqual({ processos: "editar", pagamentos: "editar", patients: "nenhum" });
    expect($("#permissoes-padrao-rotulo")).not.toBeNull();
    expect($("#btn-permissoes-restaurar")).toBeNull();
    await salvar();
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });
});

describe("ContaFormModal — editar conta COM mapa gravado", () => {
  it("mostra o mapa (sem rótulo de padrão) e 'Restaurar'; salvar sem mexer NÃO reenvia o mapa", async () => {
    const ev = abrir(conta({ permissoes: valoresDoMapa(MAPA) }));
    await esperar();
    expect(tabelaAtual()).toEqual({ processos: "ver", pagamentos: "editar", patients: "nenhum" });
    expect($("#permissoes-padrao-rotulo")).toBeNull();
    expect($("#btn-permissoes-restaurar")).not.toBeNull();
    await salvar();
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });

  it("'Restaurar padrão do cargo' mostra o padrão e o PATCH envia permissoes: null", async () => {
    const ev = abrir(conta({ permissoes: valoresDoMapa(MAPA) }));
    await esperar();
    $("#btn-permissoes-restaurar")!.click();
    await esperar();
    expect(tabelaAtual()).toEqual({ processos: "editar", pagamentos: "editar", patients: "nenhum" });
    expect($("#permissoes-padrao-rotulo")).not.toBeNull();
    await salvar();
    expect(ev.update[0]!.payload).toHaveProperty("permissoes", null);
  });

  it("restaurar e depois mexer numa linha: envia o mapa completo (não null)", async () => {
    const ev = abrir(conta({ permissoes: valoresDoMapa(MAPA) }));
    await esperar();
    $("#btn-permissoes-restaurar")!.click();
    await esperar();
    await escolherNivel("patients", "ver");
    await salvar();
    expect(ev.update[0]!.payload.permissoes).toEqual({ processos: "editar", pagamentos: "editar", patients: "ver" });
  });

  it("mapa tudo 'Nenhum' gravado: mostra o aviso e salva sem reenviar", async () => {
    const ev = abrir(conta({ permissoes: NENHUM }));
    await esperar();
    expect(texto($("#permissoes-aviso-nenhum"))).toBe(AVISO_TUDO_NENHUM);
    await salvar();
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });
});

describe("ContaFormModal — trocar o cargo numa edição", () => {
  it("para administrador depois de mexer na tabela: o PATCH NÃO tem permissoes (o servidor limpa o mapa sozinho)", async () => {
    const ev = abrir(conta({ permissoes: valoresDoMapa(MAPA) }));
    await esperar();
    await escolherNivel("processos", "editar");
    await escolherCargo("Administrador");
    expect($("#permissoes-conta")).toBeNull();
    await salvar();
    expect(ev.update[0]!.payload).toMatchObject({ role: "administrador" });
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });

  it("para consultor (com a tabela mexida): idem", async () => {
    const ev = abrir(conta());
    await esperar();
    await escolherNivel("patients", "editar");
    await escolherCargo("Consultor");
    await escolherConsultor("André Vitório");
    await salvar();
    expect(ev.update[0]!.payload).toMatchObject({ role: "consultor", consultorNome: "André Vitório" });
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });

  it("de consultor/administrador para sócio/operacional: abre com o padrão do cargo NOVO, não mexida, e não envia", async () => {
    const ev = abrir(conta({ role: "administrador", nome: "Adm" }));
    await esperar();
    expect($("#permissoes-conta")).toBeNull();
    await escolherCargo("Operacional");
    expect(tabelaAtual()).toEqual({ processos: "editar", pagamentos: "editar", patients: "nenhum" });
    expect($("#permissoes-padrao-rotulo")).not.toBeNull();
    await salvar();
    expect(ev.update[0]!.payload).toMatchObject({ role: "operacional" });
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });

  it("de consultor/administrador para sócio depois de passar por outro cargo: padrão do SÓCIO", async () => {
    abrir(conta({ role: "administrador", nome: "Adm" }));
    await esperar();
    await escolherCargo("Sócio");
    expect(tabelaAtual()).toEqual({ processos: "editar", pagamentos: "editar", patients: "editar" });
  });

  it("entre sócio e operacional: mexida = mantém a tabela; intacta e sem mapa = mostra o padrão do cargo novo", async () => {
    const ev = abrir(conta());
    await esperar();
    await escolherCargo("Sócio"); // intacta e sem mapa: o padrão acompanha o cargo
    expect(tabelaAtual()).toEqual({ processos: "editar", pagamentos: "editar", patients: "editar" });
    await salvar();
    expect("permissoes" in ev.update[0]!.payload).toBe(false);

    await escolherNivel("processos", "ver"); // mexeu: agora a tabela é da pessoa
    await escolherCargo("Operacional");
    expect(tabelaAtual()).toEqual({ processos: "ver", pagamentos: "editar", patients: "editar" });
    await salvar();
    expect(ev.update[1]!.payload.permissoes).toEqual({ processos: "ver", pagamentos: "editar", patients: "editar" });
  });

  it("conta COM mapa trocando entre sócio e operacional mantém o mapa; voltando de consultor mostra o mapa gravado", async () => {
    const ev = abrir(conta({ permissoes: valoresDoMapa(MAPA) }));
    await esperar();
    await escolherCargo("Sócio");
    expect(tabelaAtual()).toEqual({ processos: "ver", pagamentos: "editar", patients: "nenhum" });
    await escolherNivel("patients", "editar");
    await escolherCargo("Consultor");
    expect($("#permissoes-conta")).toBeNull();
    await escolherCargo("Operacional");
    // o que o servidor guarda é o mapa gravado (nada foi salvo no meio): é ele que a tabela volta a mostrar
    expect(tabelaAtual()).toEqual({ processos: "ver", pagamentos: "editar", patients: "nenhum" });
    await salvar();
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });
});

// ── contrato com o servidor ──────────────────────────────────────────────────────────────────────────
describe("o que o formulário envia é aceito pelo servidor estrito (nunca 400 por causa do formulário)", () => {
  it("POST: sócio com mapa completo; administrador sem o campo", async () => {
    const ev = abrir(null);
    await escolherCargo("Sócio");
    await preencherNova();
    await escolherNivel("processos", "ver");
    await salvar();
    await escolherCargo("Administrador");
    await salvar();
    expect(parseContaInput(ev.create[0]!, "criacao")).toMatchObject({ role: "socio", permissoes: { acao: "gravar" } });
    expect(parseContaInput(ev.create[1]!, "criacao")).toMatchObject({ role: "administrador", permissoes: { acao: "manter" } });
  });

  it("PATCH: intacto = manter", async () => {
    const intacto = abrir(conta());
    await esperar();
    await salvar();
    expect(parseContaInput(intacto.update[0]!.payload, "edicao").permissoes).toEqual({ acao: "manter" });
  });

  it("PATCH: mexido = gravar", async () => {
    const mexido = abrir(conta());
    await esperar();
    await escolherNivel("patients", "ver");
    await salvar();
    expect(parseContaInput(mexido.update[0]!.payload, "edicao").permissoes.acao).toBe("gravar");
  });

  it("PATCH: restaurar = apagar; cargo sem mapa depois de mexer = apagar (o servidor limpa)", async () => {
    const restaurado = abrir(conta({ permissoes: valoresDoMapa(MAPA) }));
    await esperar();
    $("#btn-permissoes-restaurar")!.click();
    await esperar();
    await salvar();
    expect(parseContaInput(restaurado.update[0]!.payload, "edicao").permissoes).toEqual({ acao: "apagar" });
  });

  it("PATCH: trocar para administrador depois de mexer na tabela é aceito (sem o campo)", async () => {
    const trocado = abrir(conta({ permissoes: valoresDoMapa(MAPA) }));
    await esperar();
    await escolherNivel("processos", "editar");
    await escolherCargo("Administrador");
    await salvar();
    expect(parseContaInput(trocado.update[0]!.payload, "edicao").permissoes).toEqual({ acao: "apagar" });
  });
});

// ── acessibilidade e layout ──────────────────────────────────────────────────────────────────────────
describe("tabela de permissões — acessibilidade e layout estreito", () => {
  it("cada grupo é um radiogroup com legenda, 3 radios nativos do mesmo nome e UMA opção marcada", async () => {
    abrir(conta({ permissoes: valoresDoMapa(MAPA) }));
    await esperar();
    const grupos = $$("[id^='perm-grupo-']");
    expect(grupos).toHaveLength(SECOES_COM_PERMISSAO.length);
    for (const grupo of grupos) {
      expect(grupo.tagName).toBe("FIELDSET");
      expect(grupo.getAttribute("role")).toBe("radiogroup");
      const legenda = grupo.querySelector("legend");
      expect(texto(legenda)).not.toBe("");
      const radios = Array.from(grupo.querySelectorAll<HTMLInputElement>("input[type='radio']"));
      expect(radios.map((r) => r.value)).toEqual(["nenhum", "ver", "editar"]);
      expect(new Set(radios.map((r) => r.name)).size).toBe(1);
      expect(radios.filter((r) => r.checked)).toHaveLength(1);
      // cada opção tem texto visível (rótulo acessível do radio via <label>)
      expect(radios.map((r) => texto(r.closest("label")))).toEqual(["Nenhum", "Ver", "Editar"]);
    }
    expect(marcado("processos")).toBe("ver");
  });

  it("os radios não têm display:none (continuam focáveis); só ficam visualmente ocultos (sr-only)", async () => {
    abrir(null);
    await escolherCargo("Operacional");
    for (const radio of $$<HTMLInputElement>("#permissoes-conta input[type='radio']")) {
      expect(radio.className).toContain("sr-only");
      expect(radio.className).not.toMatch(/\bhidden\b/);
      expect(radio.disabled).toBe(false);
    }
  });

  it("sem rolagem horizontal a 360px: grade de 3 colunas que encolhe, sem larguras fixas nem nowrap", async () => {
    abrir(null);
    await escolherCargo("Operacional");
    const tabela = $("#permissoes-conta")!;
    expect(tabela.className).toContain("min-w-0");
    for (const grade of Array.from(tabela.querySelectorAll("fieldset > div"))) {
      expect(grade.className).toContain("grid-cols-3");
      expect(grade.className).toContain("min-w-0");
    }
    const todos = [tabela, ...Array.from(tabela.querySelectorAll("*"))];
    for (const el of todos) {
      const classes = el.getAttribute("class") ?? "";
      expect(classes, `${el.tagName}`).not.toMatch(/(^|\s)(w|min-w|max-w)-\[|(^|\s)w-\d|whitespace-nowrap|overflow-x-|(^|\s)shrink-0/);
      expect(el.getAttribute("style") ?? "", `${el.tagName}`).not.toMatch(/width/);
    }
    // alvo de toque de 44px abaixo de lg
    for (const rotulo of Array.from(tabela.querySelectorAll("label > span"))) {
      expect(rotulo.className).toContain("min-h-11");
    }
  });

  it("o modal rola na vertical quando a tabela passa da altura da tela (sem rolar para o lado)", async () => {
    abrir(null);
    await esperar();
    const modal = $("#conta-form-modal")!;
    expect(modal.className).toMatch(/max-h-\[calc\(100dvh-3rem\)\]/);
    expect(modal.className).toContain("overflow-y-auto");
    expect(modal.className).not.toMatch(/overflow-x-(auto|scroll)/);
  });

  it("o texto de ajuda aparece uma vez, abaixo da tabela", async () => {
    abrir(null);
    await escolherCargo("Sócio");
    const ajuda = texto($("#permissoes-ajuda"));
    expect(ajuda).toBe("Recados e Minha conta ficam sempre abertos. Configurações e Contas são só do administrador.");
    expect($$("#permissoes-ajuda")).toHaveLength(1);
  });
});

// ── mensagem pós-salvar e etiqueta na lista ──────────────────────────────────────────────────────────
describe("mensagem depois de salvar permissões", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    useContas().contas.value = [conta()];
  });
  afterEach(() => {
    vi.advanceTimersByTime(20_000);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useContas().contas.value = [];
  });

  function stubPatch(resposta: AdminUserSummary): void {
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => resposta }) as Response);
  }

  it("mudou permissões (mapa ou null): avisa que vale em instantes e que a pessoa precisa recarregar", async () => {
    stubPatch(conta({ permissoes: valoresDoMapa(MAPA) }));
    await useContasAdmin().handleUpdate("c1", { role: "operacional", permissoes: valoresDoMapa(MAPA) });
    expect(useToast().message.value).toBe(`Conta atualizada. ${MENSAGEM_PERMISSAO_SALVA}`);
    expect(MENSAGEM_PERMISSAO_SALVA).toBe(
      "A mudança vale no servidor em instantes. A pessoa precisa recarregar a página para ver o menu atualizado.",
    );
    vi.advanceTimersByTime(20_000);
    stubPatch(conta());
    await useContasAdmin().handleUpdate("c1", { role: "operacional", permissoes: null });
    expect(useToast().message.value).toBe(`Conta atualizada. ${MENSAGEM_PERMISSAO_SALVA}`);
  });

  it("sem mexer em permissões: só 'Conta atualizada' (sem o aviso)", async () => {
    stubPatch(conta());
    await useContasAdmin().handleUpdate("c1", { role: "operacional", nome: "Bruno Alves" });
    expect(useToast().message.value).toBe("Conta atualizada");
  });
});

describe("ContasTab — etiqueta 'Permissões personalizadas'", () => {
  beforeEach(() => {
    useAuth().user.value = { id: "adm", email: "adm@x.com", role: "administrador", nome: "Adm", isAdmin: true };
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => [
        conta({ id: "bruno", email: "bruno@x.com", nome: "Bruno", permissoes: null }),
        conta({ id: "rebeca", email: "rebeca@x.com", nome: "Rebeca", permissoes: valoresDoMapa(MAPA) }),
        conta({ id: "cons", email: "cons@x.com", role: "consultor" as Role, nome: "Cons", permissoes: null }),
      ],
    }) as Response);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuth().user.value = null;
    useContas().contas.value = [];
  });

  it("só as contas com mapa gravado ganham a etiqueta (tabela e cards); nenhuma coluna nova", async () => {
    montar(() => h(ContasTab));
    await esperar();
    expect($$("[id^='conta-perm-']").map((e) => e.id)).toEqual(["conta-perm-rebeca"]);
    expect($$("[id^='conta-card-perm-']").map((e) => e.id)).toEqual(["conta-card-perm-rebeca"]);
    expect(texto($("#conta-perm-rebeca"))).toBe("Permissões personalizadas");
    expect(texto($("#conta-card-perm-rebeca"))).toBe("Permissões personalizadas");
    expect($("#conta-perm-bruno")).toBeNull();
    expect($$("thead th").map(texto)).toEqual(["Nome", "E-mail", "Cargo", "Consultor", "Ações"]);
  });
});
