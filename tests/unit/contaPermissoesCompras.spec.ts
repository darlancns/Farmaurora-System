// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import type { AdminUserSummary, UpdateUserRoleDTO } from "../../shared/types/auth";
import type { NovaContaDTO } from "../../app/composables/useContas";
import { SECOES_COM_PERMISSAO } from "../../shared/utils/permissoesPagina";
import { valoresDoMapa } from "../../app/utils/contaPermissoesForm";
import ContaFormModal from "../../app/components/configuracoes/ContaFormModal.vue";
import { CONSULTORES_FIXTURE } from "./helpers/consultoresFixtures";

// A linha "Compras" na tabela de permissões por página do formulário de Contas (componente real no happy-dom): é mais uma linha,
// a última, com o mesmo comportamento das outras (3 opções, nada enviado sem mexer, restaurar padrão do cargo). Contas fictícias.

const montados: Array<{ app: App; el: HTMLElement }> = [];

function abrir(editingConta: AdminUserSummary | null) {
  const ev = { create: [] as NovaContaDTO[], update: [] as Array<{ id: string; payload: UpdateUserRoleDTO }>, invalid: [] as string[] };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(ContaFormModal, {
          editingConta,
          consultoresEmUso: {},
          consultores: CONSULTORES_FIXTURE,
          busy: false,
          onCreate: (p: NovaContaDTO) => ev.create.push(p),
          onUpdate: (id: string, payload: UpdateUserRoleDTO) => ev.update.push({ id, payload }),
          onInvalid: (m: string) => ev.invalid.push(m),
          onClose: () => undefined,
        }),
    }),
  );
  app.mount(el);
  montados.push({ app, el });
  return ev;
}

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.app.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
});

const esperar = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await nextTick();
};
const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string): T[] => Array.from(document.querySelectorAll<T>(sel));
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

const conta = (extra: Partial<AdminUserSummary> = {}): AdminUserSummary => ({
  id: "c1",
  email: "teste@farmaurora.com.br",
  role: "operacional",
  nome: "TESTE Operacional",
  permissoes: null,
  createdAt: "2026-01-01T00:00:00Z",
  lastSignInAt: null,
  ...extra,
});

async function escolherCargo(rotulo: string): Promise<void> {
  $("#conta-role")!.click();
  await esperar();
  const opcao = $$("li[role='option']").find((li) => texto(li) === rotulo);
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
  await digitar("#conta-nome", "TESTE Maria");
  await digitar("#conta-email", "teste.maria@farmaurora.com.br");
  await digitar("#conta-senha", "senha-forte-123");
}

async function escolherNivel(secao: string, nivel: string): Promise<void> {
  $<HTMLInputElement>(`#perm-${secao}-${nivel}`)!.click();
  await esperar();
}

const marcado = (secao: string): string | undefined => $$<HTMLInputElement>(`input[name='perm-${secao}']`).find((r) => r.checked)?.value;
const tabela = () => Object.fromEntries(SECOES_COM_PERMISSAO.map((s) => [s, marcado(s)]));

async function salvar(): Promise<void> {
  $("#conta-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await esperar();
}

describe("a linha Compras na tabela de permissões", () => {
  it("é a última linha, chama-se 'Compras' e tem as 3 opções Nenhum, Ver e Editar", async () => {
    abrir(null);
    await escolherCargo("Operacional");
    const grupos = $$("[id^='perm-grupo-']");
    expect(grupos.at(-1)!.id).toBe("perm-grupo-compras");
    expect(grupos.map((g) => texto(g.querySelector("legend")))).toEqual(["Processos", "Pagamentos", "DIR", "Prestação de Contas", "Compras"]);

    const grupo = $("#perm-grupo-compras")!;
    expect(grupo.getAttribute("role")).toBe("radiogroup");
    expect([...grupo.querySelectorAll("label")].map(texto)).toEqual(["Nenhum", "Ver", "Editar"]);
    expect([...grupo.querySelectorAll<HTMLInputElement>("input[type='radio']")].map((r) => r.value)).toEqual(["nenhum", "ver", "editar"]);
  });

  it("aparece para Sócio e Operacional e não para Administrador nem Consultor (como todas as linhas)", async () => {
    abrir(null);
    for (const [cargo, aparece] of [["Sócio", true], ["Operacional", true], ["Administrador", false], ["Consultor", false]] as const) {
      await escolherCargo(cargo);
      expect($("#perm-grupo-compras") !== null, cargo).toBe(aparece);
    }
  });

  it("conta NOVA nasce com Compras em 'Nenhum' e o POST leva compras: 'nenhum'", async () => {
    const ev = abrir(null);
    await escolherCargo("Sócio");
    await preencherNova();
    expect(marcado("compras")).toBe("nenhum");
    await salvar();
    expect(ev.invalid).toEqual([]);
    expect(ev.create[0]!.permissoes).toEqual({ processos: "nenhum", pagamentos: "nenhum", dir: "nenhum", patients: "nenhum", compras: "nenhum" });
  });

  it("escolher Ver ou Editar em Compras: o POST leva o nível e o aviso de 'só Recados e Minha conta' some", async () => {
    for (const nivel of ["ver", "editar"] as const) {
      const ev = abrir(null);
      await escolherCargo("Operacional");
      await preencherNova();
      expect($("#permissoes-aviso-nenhum")).not.toBeNull();
      await escolherNivel("compras", nivel);
      expect(tabela()).toEqual({ processos: "nenhum", pagamentos: "nenhum", dir: "nenhum", patients: "nenhum", compras: nivel });
      expect($("#permissoes-aviso-nenhum"), nivel).toBeNull();
      await salvar();
      expect(ev.create[0]!.permissoes).toEqual({ processos: "nenhum", pagamentos: "nenhum", dir: "nenhum", patients: "nenhum", compras: nivel });
      montados.pop()!.app.unmount();
      document.body.innerHTML = "";
    }
  });

  it("mexer só em Compras não liga nenhuma outra linha", async () => {
    const ev = abrir(null);
    await escolherCargo("Sócio");
    await preencherNova();
    await escolherNivel("compras", "editar");
    await salvar();
    const enviado = ev.create[0]!.permissoes!;
    for (const secao of SECOES_COM_PERMISSAO) expect(enviado[secao], secao).toBe(secao === "compras" ? "editar" : "nenhum");
  });
});

describe("editar conta SEM mapa gravado: a tabela mostra o padrão do cargo para Compras", () => {
  it("operacional: Compras 'Editar'; salvar sem mexer NÃO envia permissoes (nenhuma conta existente muda)", async () => {
    const ev = abrir(conta());
    await esperar();
    expect($("#permissoes-padrao-rotulo")).not.toBeNull();
    expect(marcado("compras")).toBe("editar");
    await salvar();
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });

  it("sócio: Compras 'Ver' (o sócio só vê), também sem enviar nada", async () => {
    const ev = abrir(conta({ role: "socio", nome: "TESTE Sócio" }));
    await esperar();
    expect(marcado("compras")).toBe("ver");
    await salvar();
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });

  it("mexer só em Compras: o PATCH leva o mapa completo (padrão do cargo nas outras linhas)", async () => {
    const ev = abrir(conta());
    await esperar();
    await escolherNivel("compras", "ver");
    await salvar();
    expect(ev.update[0]!.payload.permissoes).toEqual({ processos: "editar", pagamentos: "editar", dir: "editar", patients: "nenhum", compras: "ver" });
  });

  it("trocar o cargo para Sócio sem mexer na tabela: o padrão acompanha (Compras 'Ver')", async () => {
    abrir(conta());
    await esperar();
    expect(marcado("compras")).toBe("editar");
    await escolherCargo("Sócio");
    expect(marcado("compras")).toBe("ver");
  });
});

describe("editar conta COM mapa gravado", () => {
  it("mapa de antes de Compras (4 chaves): Compras aparece 'Nenhum' e salvar sem mexer NÃO reenvia o mapa", async () => {
    const antigo = valoresDoMapa({ processos: "editar", pagamentos: "editar", dir: "editar", patients: "editar" });
    const ev = abrir(conta({ permissoes: antigo }));
    await esperar();
    expect($("#permissoes-padrao-rotulo")).toBeNull(); // é um mapa gravado, não o padrão do cargo
    expect(marcado("compras")).toBe("nenhum");
    await salvar();
    expect("permissoes" in ev.update[0]!.payload).toBe(false);
  });

  it("o administrador libera Compras nessa conta: o PATCH leva o mapa completo com o nível escolhido e o resto como estava", async () => {
    const antigo = valoresDoMapa({ processos: "ver", pagamentos: "nenhum", dir: "nenhum", patients: "ver" });
    const ev = abrir(conta({ permissoes: antigo }));
    await esperar();
    await escolherNivel("compras", "ver");
    await salvar();
    expect(ev.update[0]!.payload.permissoes).toEqual({ processos: "ver", pagamentos: "nenhum", dir: "nenhum", patients: "ver", compras: "ver" });
  });

  it("'Restaurar padrão do cargo' mostra Compras 'Editar' no operacional e envia permissoes: null", async () => {
    const ev = abrir(conta({ permissoes: valoresDoMapa({ processos: "ver" }) }));
    await esperar();
    expect(marcado("compras")).toBe("nenhum");
    $("#btn-permissoes-restaurar")!.click();
    await esperar();
    expect(marcado("compras")).toBe("editar");
    await salvar();
    expect(ev.update[0]!.payload.permissoes).toBeNull();
  });
});
