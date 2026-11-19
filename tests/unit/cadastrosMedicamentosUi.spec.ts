// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Cadastro, ListaCadastro, MedicamentoCadastro, TemperaturaCadastro } from "../../shared/types/Cadastro";
import CadastroPainel from "../../app/components/configuracoes/CadastroPainel.vue";
import CadastroSecao from "../../app/components/configuracoes/CadastroSecao.vue";
import { colunasDaLista, linhaSecundaria } from "../../app/utils/cadastroColunas";
import {
  formDeItem,
  formVazio,
  listaTemEdicao,
  montarAlteracao,
  montarNovo,
  nomeComoGravado,
} from "../../app/utils/cadastroForm";
import { montarTemperaturaOptions } from "../../app/utils/cadastroTemperaturaOptions";

// Tela de MEDICAMENTOS (Configurações → Cadastros): colunas, formulário (funções puras) e o painel lateral com o select de
// temperatura (só as ATIVAS), nome em MAIÚSCULAS e renomear. Componentes reais no happy-dom. Só nomes de exemplo.

const BASE = { id: "x", ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };
const temp = (e: Partial<TemperaturaCadastro>): TemperaturaCadastro => ({ ...BASE, nome: "Ambiente", ...e });
const med = (e: Partial<MedicamentoCadastro> = {}): MedicamentoCadastro => ({
  ...BASE,
  id: "m1",
  nome: "DIPIRONA 500 MG",
  temperatura: "Ambiente",
  ...e,
});

const TEMPERATURAS: TemperaturaCadastro[] = [
  temp({ id: "t1", nome: "Ambiente" }),
  temp({ id: "t2", nome: "2°C a 8°C" }),
  temp({ id: "t3", nome: "TESTE TEMP INATIVA", ativo: false }),
];

// ── funções puras ─────────────────────────────────────────────────────────────────────────────────────────────

describe("medicamentos — colunas e segunda linha (ponto silencioso 3)", () => {
  it("a tabela ganha a coluna Temperatura (Nome e Ativo continuam sendo a primeira e a última)", () => {
    const colunas = colunasDaLista("medicamentos");
    expect(colunas.map((c) => c.titulo)).toEqual(["Temperatura"]);
    expect(colunas[0]!.texto(med())).toBe("Ambiente");
    expect(colunas[0]!.texto(med({ temperatura: "" }))).toBe("—");
    expect(colunasDaLista("medicamentos", true).map((c) => c.chave)).toEqual(["temperatura"]); // sem PIX, com ou sem permissão
  });

  it("no celular a segunda linha é a temperatura (e some quando vazia)", () => {
    expect(linhaSecundaria("medicamentos", med())).toBe("Ambiente");
    expect(linhaSecundaria("medicamentos", med({ temperatura: "  " }))).toBe("");
    expect(linhaSecundaria("temperaturas", temp({}))).toBe("");
  });
});

describe("medicamentos — formulário (ponto silencioso 4)", () => {
  it("formDeItem traz nome e temperatura; formVazio tem temperatura vazia", () => {
    expect(formDeItem("medicamentos", med())).toMatchObject({ nome: "DIPIRONA 500 MG", temperatura: "Ambiente" });
    expect(formVazio().temperatura).toBe("");
  });

  it("montarNovo: nome em MAIÚSCULAS e temperatura vão juntos; sem temperatura, o aviso é o da validação", () => {
    expect(montarNovo("medicamentos", { ...formVazio(), nome: " dipirona  1 g ", temperatura: "Ambiente" })).toEqual({
      ok: true,
      valor: { nome: "DIPIRONA 1 G", temperatura: "Ambiente" },
    });
    expect(montarNovo("medicamentos", { ...formVazio(), nome: "dipirona" })).toEqual({ ok: false, erro: "Informe a temperatura." });
    expect(montarNovo("medicamentos", { ...formVazio(), nome: "outro", temperatura: "Ambiente" }).ok).toBe(false);
  });

  it("montarAlteracao: só vai o que MUDOU (nome e/ou temperatura); nada mudou = 'Nenhuma alteração informada.'", () => {
    const original = med();
    const form = (e: object) => ({ ...formDeItem("medicamentos", original), ...e });
    expect(montarAlteracao("medicamentos", form({ nome: "dipirona 1 g" }), original)).toEqual({ ok: true, valor: { nome: "DIPIRONA 1 G" } });
    expect(montarAlteracao("medicamentos", form({ temperatura: "2°C a 8°C" }), original)).toEqual({
      ok: true,
      valor: { temperatura: "2°C a 8°C" },
    });
    expect(montarAlteracao("medicamentos", form({ nome: "dipirona 1 g", temperatura: "2°C a 8°C" }), original)).toEqual({
      ok: true,
      valor: { nome: "DIPIRONA 1 G", temperatura: "2°C a 8°C" },
    });
    expect(montarAlteracao("medicamentos", form({ nome: "  dipirona   500 mg " }), original)).toEqual({ ok: false, erro: "Nenhuma alteração informada." });
    expect(montarAlteracao("medicamentos", form({}), original)).toEqual({ ok: false, erro: "Nenhuma alteração informada." });
    expect(montarAlteracao("medicamentos", form({ nome: "Outro" }), original).ok).toBe(false);
    expect(montarAlteracao("medicamentos", form({ temperatura: "" }), original)).toEqual({ ok: false, erro: "Informe a temperatura." });
  });

  it("corrigir só o acento do nome conta como mudança (a chave é a mesma e o servidor aceita)", () => {
    const original = med({ nome: "ACIDO FOLICO 5 MG" });
    expect(montarAlteracao("medicamentos", { ...formDeItem("medicamentos", original), nome: "ácido fólico 5 mg" }, original)).toEqual({
      ok: true,
      valor: { nome: "ÁCIDO FÓLICO 5 MG" },
    });
  });

  it("listaTemEdicao: medicamento edita (consultor também); temperatura e cia aérea não", () => {
    expect(listaTemEdicao("medicamentos")).toBe(true);
    expect(listaTemEdicao("medicamentos", false)).toBe(true);
    expect(listaTemEdicao("consultores")).toBe(true);
    expect(listaTemEdicao("temperaturas")).toBe(false);
    expect(listaTemEdicao("cias-aereas")).toBe(false);
  });

  it("nomeComoGravado: medicamento em MAIÚSCULAS; as outras listas só aparam", () => {
    expect(nomeComoGravado("medicamentos", "  dipirona   1 g ")).toBe("DIPIRONA 1 G");
    expect(nomeComoGravado("consultores", "  Mateus   Teste ")).toBe("Mateus Teste");
  });
});

describe("opções do select de temperatura", () => {
  it("'Selecione' + só as ATIVAS, em ordem alfabética (a inativa não aparece)", () => {
    expect(montarTemperaturaOptions("", TEMPERATURAS).map((o) => o.label)).toEqual(["Selecione", "2°C a 8°C", "Ambiente"]);
  });

  it("o valor atual inativo continua selecionável, com '(inativo)'; o que não existe no Cadastro aparece sem sufixo", () => {
    const inativa = montarTemperaturaOptions("TESTE TEMP INATIVA", TEMPERATURAS);
    expect(inativa.at(-1)).toEqual({ value: "TESTE TEMP INATIVA", label: "TESTE TEMP INATIVA (inativo)" });
    const orfa = montarTemperaturaOptions("-196°C", TEMPERATURAS);
    expect(orfa.at(-1)).toEqual({ value: "-196°C", label: "-196°C" });
    expect(montarTemperaturaOptions("Ambiente", TEMPERATURAS)).toHaveLength(3); // ativo: não duplica
  });

  it("sem temperaturas carregadas só sobra 'Selecione'", () => {
    expect(montarTemperaturaOptions("", [])).toEqual([{ value: "", label: "Selecione" }]);
  });
});

// ── componentes ───────────────────────────────────────────────────────────────────────────────────────────────

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
function montar(componente: ReturnType<typeof defineComponent>): void {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(componente);
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
}
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);

interface Eventos {
  criar: unknown[];
  atualizar: unknown[][];
  reativar: Cadastro[];
  avisos: string[];
}

function abrirPainel(props: { editando?: Cadastro | null; existentes?: Cadastro[]; temperaturas?: TemperaturaCadastro[] }): Eventos {
  const ev: Eventos = { criar: [], atualizar: [], reativar: [], avisos: [] };
  montar(
    defineComponent({
      render: () =>
        h(CadastroPainel, {
          lista: "medicamentos" as ListaCadastro,
          editando: props.editando ?? null,
          existentes: props.existentes ?? [],
          temperaturas: props.temperaturas ?? TEMPERATURAS,
          onCriar: (p: unknown) => ev.criar.push(p),
          onAtualizar: (...a: unknown[]) => ev.atualizar.push(a),
          onReativar: (i: Cadastro) => ev.reativar.push(i),
          onAviso: (m: string) => ev.avisos.push(m),
        }),
    }),
  );
  return ev;
}

async function digitar(sel: string, valor: string): Promise<void> {
  const input = q<HTMLInputElement>(sel)!;
  input.value = valor;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}
async function enviar(): Promise<void> {
  q<HTMLFormElement>("#cadastro-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  await nextTick();
}
async function escolherTemperatura(nome: string): Promise<void> {
  q<HTMLButtonElement>("#cadastro-form-temperatura")!.click();
  await nextTick();
  const opcao = [...document.querySelectorAll<HTMLElement>("#cadastro-form-temperatura-listbox [role='option']")].find((li) => texto(li) === nome);
  expect(opcao, `opção ${nome}`).toBeDefined();
  opcao!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}
const opcoesAbertas = async (): Promise<string[]> => {
  q<HTMLButtonElement>("#cadastro-form-temperatura")!.click();
  await nextTick();
  return [...document.querySelectorAll("#cadastro-form-temperatura-listbox [role='option']")].map((li) => texto(li));
};

describe("CadastroPainel — novo medicamento (ponto silencioso 5)", () => {
  it("título, nome editável com a dica de MAIÚSCULAS e o select de Temperatura (obrigatório, começa em 'Selecione')", () => {
    abrirPainel({});
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Novo medicamento");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.disabled).toBe(false);
    expect(q("#cadastro-form-nome")!.getAttribute("autocapitalize")).toBe("characters");
    expect(texto(q("#cadastro-form-nome-dica-maiusculo"))).toBe("O nome é gravado em MAIÚSCULAS.");
    expect(texto(q("#cadastro-form-temperatura-bloco label"))).toBe("Temperatura");
    expect(texto(q("#cadastro-form-temperatura"))).toBe("Selecione");
    expect(texto(q("#btn-cadastro-salvar"))).toBe("Criar");
    for (const id of ["#cadastro-form-pais", "#cadastro-form-contato", "#cadastro-form-alerta", "#cadastro-form-pix-bloco"]) expect(q(id), id).toBeNull();
  });

  it("o select oferece SÓ as temperaturas ativas", async () => {
    abrirPainel({});
    expect(await opcoesAbertas()).toEqual(["Selecione", "2°C a 8°C", "Ambiente"]);
  });

  it("digitar em minúsculas vira MAIÚSCULAS no campo; criar envia nome em maiúsculas e a temperatura escolhida", async () => {
    const ev = abrirPainel({});
    await digitar("#cadastro-form-nome", "dipirona 500 mg");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.value).toBe("DIPIRONA 500 MG");
    await escolherTemperatura("2°C a 8°C");
    await enviar();
    expect(ev.avisos).toEqual([]);
    expect(ev.criar).toEqual([{ nome: "DIPIRONA 500 MG", temperatura: "2°C a 8°C" }]);
  });

  it("sem escolher a temperatura: aviso 'Informe a temperatura.' e nada é criado", async () => {
    const ev = abrirPainel({});
    await digitar("#cadastro-form-nome", "dipirona");
    await enviar();
    expect(ev.avisos).toEqual(["Informe a temperatura."]);
    expect(ev.criar).toEqual([]);
  });

  it("'Outro' é reservado: aviso na tela e o botão Criar fica desabilitado", async () => {
    const ev = abrirPainel({});
    await digitar("#cadastro-form-nome", "outro");
    expect(texto(q("#cadastro-form-aviso-reservado"))).toMatch(/reservado/);
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    await enviar();
    expect(ev.criar).toEqual([]);
  });

  it("nome repetido (sem acento nem caixa): ativo bloqueia; INATIVO oferece 'Reativar'", async () => {
    const ev = abrirPainel({
      existentes: [med({ id: "a", nome: "ÁCIDO FÓLICO" }), med({ id: "b", nome: "ZOLPIDEM", ativo: false })],
    });
    await digitar("#cadastro-form-nome", "acido folico");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toBe('Já existe "ÁCIDO FÓLICO" nesta lista.');
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    expect(q("#btn-cadastro-reativar-duplicado")).toBeNull();

    await digitar("#cadastro-form-nome", "zolpidem");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/\(inativo\)\. Reative-o em vez de criar outro\./);
    q<HTMLButtonElement>("#btn-cadastro-reativar-duplicado")!.click();
    expect(ev.reativar.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("CadastroPainel — editar medicamento (renomear)", () => {
  it("título, nome EDITÁVEL com a dica de que só muda este cadastro, temperatura atual selecionada; Salvar desabilitado até mudar algo", async () => {
    abrirPainel({ editando: med() });
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Editar medicamento");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.disabled).toBe(false);
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.value).toBe("DIPIRONA 500 MG");
    expect(texto(q("#cadastro-form-nome-dica"))).toMatch(/gravado em MAIÚSCULAS.*muda só este cadastro.*não mudam/);
    expect(texto(q("#cadastro-form-nome-dica"))).not.toMatch(/consultor|Follow-Up|contas de login/);
    expect(texto(q("#cadastro-form-temperatura"))).toBe("Ambiente");
    expect(texto(q("#btn-cadastro-salvar"))).toBe("Salvar");
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    expect(texto(q("#cadastro-form-so-nome"))).toMatch(/Medicamento só tem o nome.*temperatura.*chave Ativo/);
  });

  it("renomear: envia SÓ o nome (em MAIÚSCULAS), sem confirmação de consultor", async () => {
    const ev = abrirPainel({ editando: med() });
    await digitar("#cadastro-form-nome", "dipirona 1 g");
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(false);
    await enviar();
    expect(ev.atualizar).toEqual([["m1", { nome: "DIPIRONA 1 G" }]]);
  });

  it("trocar só a temperatura envia só a temperatura; as duas mudanças vão juntas", async () => {
    const ev = abrirPainel({ editando: med() });
    await escolherTemperatura("2°C a 8°C");
    await enviar();
    expect(ev.atualizar).toEqual([["m1", { temperatura: "2°C a 8°C" }]]);

    await digitar("#cadastro-form-nome", "dipirona 1 g");
    await enviar();
    expect(ev.atualizar[1]).toEqual(["m1", { nome: "DIPIRONA 1 G", temperatura: "2°C a 8°C" }]);
  });

  it("o nome de OUTRO medicamento bloqueia (ativo e inativo); o do próprio, só com outra grafia, vale", async () => {
    const outros = [med({ id: "m2", nome: "ZOLPIDEM 10 MG" }), med({ id: "m3", nome: "OMEPRAZOL", ativo: false })];
    abrirPainel({ editando: med(), existentes: [med(), ...outros] });
    await digitar("#cadastro-form-nome", "zolpidem 10 mg");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toBe('Já existe "ZOLPIDEM 10 MG" nesta lista.');
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    await digitar("#cadastro-form-nome", "omeprazol");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toBe('Já existe "OMEPRAZOL" (inativo) nesta lista. Escolha outro nome.');
    expect(q("#btn-cadastro-reativar-duplicado")).toBeNull();
    await digitar("#cadastro-form-nome", "dipirona 500 mg");
    expect(q("#cadastro-form-aviso-duplicado")).toBeNull(); // o próprio, igual: nada a salvar
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
  });

  it("'Outro' ao renomear é reservado", async () => {
    abrirPainel({ editando: med() });
    await digitar("#cadastro-form-nome", "Outro");
    expect(texto(q("#cadastro-form-aviso-reservado"))).toMatch(/reservado/);
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
  });

  it("temperatura que ficou INATIVA depois: aparece com '(inativo)', não está entre as opções novas e dá para renomear só o nome", async () => {
    const ev = abrirPainel({ editando: med({ temperatura: "TESTE TEMP INATIVA" }) });
    expect(texto(q("#cadastro-form-temperatura"))).toBe("TESTE TEMP INATIVA (inativo)");
    await digitar("#cadastro-form-nome", "dipirona 1 g");
    await enviar();
    expect(ev.atualizar).toEqual([["m1", { nome: "DIPIRONA 1 G" }]]); // a temperatura não foi reenviada
  });
});

describe("CadastroSecao — tabela de medicamentos", () => {
  it("coluna Temperatura na tabela; no celular a segunda linha é a temperatura; inativo vai ao final com o rótulo", () => {
    const itens = [med({ id: "a", nome: "DIPIRONA", temperatura: "Ambiente" }), med({ id: "b", nome: "ZOLPIDEM", temperatura: "2°C a 8°C", ativo: false })];
    montar(
      defineComponent({
        render: () =>
          h(CadastroSecao, {
            lista: "medicamentos",
            itens,
            visiveis: itens,
            aberta: true,
            buscaAtiva: false,
            carregando: false,
            podeEditar: true,
            podeVerPix: false,
            pendentes: {},
          }),
      }),
    );
    expect([...document.querySelectorAll("#cadastro-lista-medicamentos thead th")].map((th) => texto(th))).toEqual(["Nome", "Temperatura", "Ativo"]);
    expect(texto(q("#cadastro-row-medicamentos-a"))).toContain("Ambiente");
    expect(texto(q("#cadastro-row-medicamentos-b"))).toMatch(/ZOLPIDEM.*\(inativo\).*2°C a 8°C/);
    expect(texto(q("#cadastro-card-medicamentos-a"))).toContain("Ambiente");
    expect(texto(q("#cadastro-titulo-medicamentos"))).toBe("Medicamentos");
    expect(texto(q("#cadastro-contagem-medicamentos"))).toBe("2 · 1 ativo");
  });
});
