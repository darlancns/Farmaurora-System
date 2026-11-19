// @vitest-environment happy-dom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { AdminUserSummary } from "../../shared/types/auth";
import type { Patient } from "../../shared/types/Patient";
import type { Processo } from "../../shared/types/processo";
import ContaFormModal from "../../app/components/configuracoes/ContaFormModal.vue";
import PatientForm from "../../app/components/prestacao/PatientForm.vue";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import ProcessoGroupList from "../../app/components/processos/ProcessoGroupList.vue";
import { agruparProcessosPorConsultor, ROTULO_SEM_CONSULTOR } from "../../app/utils/agruparProcessosPorConsultor";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { CONSULTORES_FIXTURE, CONSULTORES_ATIVOS_FIXTURE, CONSULTOR_INATIVO_FIXTURE } from "./helpers/consultoresFixtures";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Consultor em TODAS as telas lê o Cadastro (uma lista só): Follow-Up (formulário e agrupamento da Lista), Prestação e Contas.
// Registro cujo consultor não está na lista ativa continua exibido como gravado e editável; "(inativo)" só quando existe no
// Cadastro como inativo. Fixtures sintéticas: só nomes de consultor e pacientes "TESTE".

const ATIVOS = [...CONSULTORES_ATIVOS_FIXTURE];
const INATIVO = CONSULTOR_INATIVO_FIXTURE; // existe no Cadastro como inativo
const DESCONHECIDOS = ["Flavinha", "A ser definido", "Braulio (3RB)"]; // o Cadastro não conhece

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montar(render: () => ReturnType<typeof h>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render }));
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

async function opcoesDe(id: string): Promise<string[]> {
  document.getElementById(id)!.click();
  await nextTick();
  return [...document.querySelectorAll(`#${id}-listbox [role='option']`)].map((li) => texto(li));
}

let seq = 0;
function processo(consultor: string): Processo {
  seq += 1;
  return {
    id: `proc_${seq}`,
    paciente: `Paciente Teste ${seq}`,
    pasta: `2026 - ${seq}`,
    empresa: "FARMAURORA",
    consultor,
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

// ── Follow-Up: agrupamento da Lista ────────────────────────────────────────────────────────────────────

describe("agruparProcessosPorConsultor com o Cadastro — nenhum processo é descartado", () => {
  it("ativos primeiro (alfabética), depois inativos, depois valores desconhecidos; cada processo cai em UM grupo", () => {
    const processos = [
      processo("Paulo Braga"),
      processo("Flavinha"),
      processo(INATIVO),
      processo("André Vitório"),
      processo("Paulo Braga"),
      processo("A ser definido"),
      processo("Dani"),
    ];
    const grupos = agruparProcessosPorConsultor(processos, CONSULTORES_FIXTURE);
    expect(grupos.map((g) => [g.consultor, g.situacao])).toEqual([
      ["André Vitório", "ativo"],
      ["Dani", "ativo"],
      ["Paulo Braga", "ativo"],
      [INATIVO, "inativo"],
      ["A ser definido", "desconhecido"],
      ["Flavinha", "desconhecido"],
    ]);
    expect(grupos.reduce((n, g) => n + g.processos.length, 0)).toBe(processos.length);
    expect(grupos.find((g) => g.consultor === "Paulo Braga")!.processos).toHaveLength(2);
  });

  it("valor vazio ganha o grupo 'Sem consultor'; com espaços ou caixa diferente continua um grupo à parte (comparação exata)", () => {
    const grupos = agruparProcessosPorConsultor([processo(""), processo("dani"), processo("Dani")], CONSULTORES_FIXTURE);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Dani", "dani", ROTULO_SEM_CONSULTOR]);
    expect(grupos.find((g) => g.consultor === "")!.situacao).toBe("desconhecido");
  });

  it("sem a lista do Cadastro (ainda carregando): todos entram como desconhecidos, em ordem alfabética, e NENHUM some", () => {
    const processos = [processo("Vinícius"), processo("Bolívar"), processo("André")];
    const grupos = agruparProcessosPorConsultor(processos);
    expect(grupos.map((g) => g.consultor)).toEqual(["André", "Bolívar", "Vinícius"]);
    expect(grupos.every((g) => g.situacao === "desconhecido")).toBe(true);
  });

  it("consultor do Cadastro sem processo não gera grupo; lista vazia → nenhum grupo", () => {
    expect(agruparProcessosPorConsultor([processo("Dani")], CONSULTORES_FIXTURE).map((g) => g.consultor)).toEqual(["Dani"]);
    expect(agruparProcessosPorConsultor([], CONSULTORES_FIXTURE)).toEqual([]);
  });

  it("ProcessoGroupList mostra um cabeçalho por grupo, com '(inativo)' só no inativo do Cadastro e 'Sem consultor' no vazio", () => {
    const el = montar(() =>
      h(ProcessoGroupList, {
        processos: [processo("Dani"), processo(INATIVO), processo("Flavinha"), processo("")],
        consultores: CONSULTORES_FIXTURE,
      }),
    );
    const cabecalhos = [...el.querySelectorAll("#processo-group-list > div[id^='processo-group-']")].map((g) => ({
      titulo: texto(g.querySelector(".font-display")),
      inativo: texto(g).includes("(inativo)"),
    }));
    expect(cabecalhos).toEqual([
      { titulo: "Dani", inativo: false },
      { titulo: INATIVO, inativo: true },
      { titulo: "Flavinha", inativo: false },
      { titulo: "Sem consultor", inativo: false },
    ]);
  });
});

// ── Follow-Up: formulário ──────────────────────────────────────────────────────────────────────────────

const aberto = (consultor: string): Processo => montarProcesso(linhaCompleta({ consultor }) as unknown as FollowUpRow);

describe("ProcessoFormModal — select Consultor", () => {
  it('criação: "Selecione" + os consultores ativos do Cadastro (ordem alfabética), sem "Outro" e sem inativos', async () => {
    montar(() => h(ProcessoFormModal, { consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    expect(texto(document.getElementById("pf-consultor"))).toBe("Selecione");
    expect(await opcoesDe("pf-consultor")).toEqual(["Selecione", ...ATIVOS]);
  });

  it("os consultores que NÃO estavam na lista antiga de 7 (Dani, Bolívar, Flávia) aparecem — a lista é a do Cadastro", async () => {
    montar(() => h(ProcessoFormModal, { consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    const opcoes = await opcoesDe("pf-consultor");
    for (const nome of ["Dani", "Bolívar", "Flávia"]) expect(opcoes).toContain(nome);
  });

  it('edição de processo com consultor INATIVO do Cadastro: aparece "<valor> (inativo)", selecionado, nunca vazio', async () => {
    montar(() => h(ProcessoFormModal, { editingProcesso: aberto(INATIVO), consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    expect(texto(document.getElementById("pf-consultor"))).toBe(`${INATIVO} (inativo)`);
    expect(await opcoesDe("pf-consultor")).toEqual(["Selecione", ...ATIVOS, `${INATIVO} (inativo)`]);
  });

  it("edição com valor que o Cadastro NÃO conhece ('Flavinha', 'A ser definido'): aparece como está, SEM '(inativo)'", async () => {
    for (const antigo of DESCONHECIDOS) {
      montar(() => h(ProcessoFormModal, { editingProcesso: aberto(antigo), consultores: CONSULTORES_FIXTURE }));
      await nextTick();
      expect(texto(document.getElementById("pf-consultor")), antigo).toBe(antigo);
      expect(await opcoesDe("pf-consultor"), antigo).toEqual(["Selecione", ...ATIVOS, antigo]);
      montados.pop()!.unmount();
      document.body.innerHTML = "";
    }
  });

  it("edição com consultor ativo: sem opção extra", async () => {
    montar(() => h(ProcessoFormModal, { editingProcesso: aberto("Dani"), consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    expect(texto(document.getElementById("pf-consultor"))).toBe("Dani");
    expect(await opcoesDe("pf-consultor")).toEqual(["Selecione", ...ATIVOS]);
  });
});

// ── Prestação ──────────────────────────────────────────────────────────────────────────────────────────

const prestacao = (consultor: string): Patient => ({
  id: "pac_1",
  data: "01/11/2026",
  paciente: "PACIENTE TESTE",
  descricaoCompra: "1x Medicamento Teste",
  descricaoResumo: "Teste",
  medicamentos: [{ qtd: "1", medicamento: "Medicamento Teste" }],
  empresa: "FARMAURORA",
  consultor,
  alvara: 100,
  custoImportacao: 50,
  despesaTotal: 10,
  transporteTotal: 5,
  despachanteRemessas: 1,
  transporteRemessas: 1,
  despesasPorRemessa: ["10"],
  transportesPorRemessa: ["5"],
  remessas: 1,
  attachedSlots: [],
  status: "em_andamento",
  createdAt: "2026-11-01T00:00:00.000Z",
});

describe("PatientForm (Prestação) — select Consultor com os ativos do Cadastro (fim da lista de 7)", () => {
  it("nova prestação: 'Selecione' + todos os ativos do Cadastro, incluindo os que não eram dos 7 (Dani, Bolívar, Flávia)", async () => {
    montar(() => h(PatientForm, { editingPatient: null, consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    const opcoes = await opcoesDe("f-consultor");
    expect(opcoes).toEqual(["Selecione", ...ATIVOS]);
    for (const nome of ["Dani", "Bolívar", "Flávia"]) expect(opcoes).toContain(nome);
    expect(opcoes).not.toContain("Outro");
  });

  it('prestação com consultor INATIVO do Cadastro: "<valor> (inativo)"; com valor desconhecido ("Flavinha"): como está; sem consultor: "Selecione"', async () => {
    montar(() => h(PatientForm, { editingPatient: prestacao(INATIVO), consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    expect(texto(document.getElementById("f-consultor"))).toBe(`${INATIVO} (inativo)`);
    montados.pop()!.unmount();
    document.body.innerHTML = "";

    montar(() => h(PatientForm, { editingPatient: prestacao("Flavinha"), consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    expect(texto(document.getElementById("f-consultor"))).toBe("Flavinha");
    expect(await opcoesDe("f-consultor")).toEqual(["Selecione", ...ATIVOS, "Flavinha"]);
    montados.pop()!.unmount();
    document.body.innerHTML = "";

    montar(() => h(PatientForm, { editingPatient: prestacao(""), consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    expect(texto(document.getElementById("f-consultor"))).toBe("Selecione");
  });
});

// ── Contas ─────────────────────────────────────────────────────────────────────────────────────────────

const contaDe = (consultorNome?: string): AdminUserSummary => ({
  id: "c1",
  email: "conta.teste@x.com",
  role: "consultor",
  ...(consultorNome ? { consultorNome } : {}),
  nome: "Conta Teste",
  permissoes: null,
  createdAt: "",
  lastSignInAt: null,
});

describe("ContaFormModal — select de consultor da conta", () => {
  it("nova conta de consultor: só os ativos do Cadastro", async () => {
    montar(() => h(ContaFormModal, { editingConta: null, consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    expect(await opcoesDe("conta-consultor")).toEqual(["Selecione", ...ATIVOS]);
  });

  it("conta cujo consultor está INATIVO: o valor atual aparece mesmo assim, como '(inativo)', e continua selecionado", async () => {
    montar(() => h(ContaFormModal, { editingConta: contaDe(INATIVO), consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    expect(texto(document.getElementById("conta-consultor"))).toBe(`${INATIVO} (inativo)`);
    expect(await opcoesDe("conta-consultor")).toEqual(["Selecione", ...ATIVOS, `${INATIVO} (inativo)`]);
  });

  it("conta cujo consultor o Cadastro não conhece ('Flavinha'): o valor aparece como está", async () => {
    montar(() => h(ContaFormModal, { editingConta: contaDe("Flavinha"), consultores: CONSULTORES_FIXTURE }));
    await nextTick();
    expect(texto(document.getElementById("conta-consultor"))).toBe("Flavinha");
  });
});

// ── Estrutura: nenhuma lista própria de consultores nas telas nem no servidor ──────────────────────────

const RAIZ = process.cwd();
function arquivos(pasta: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (/\.(ts|vue)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}
const codigo = ["app", "server", "shared"]
  .flatMap((p) => arquivos(join(RAIZ, p)))
  .map((f) => ({ caminho: relative(RAIZ, f).split(sep).join("/"), texto: readFileSync(f, "utf-8") }));

describe("estrutura: o Cadastro é a ÚNICA fonte de consultores", () => {
  it("nenhum arquivo do app/server importa CONSULTORES_PROCESSO (só os scripts da carga usam) nem os tipos/constantes antigos", () => {
    const violacoes = codigo
      .filter((a) => a.caminho !== "shared/constants/processos.ts")
      .filter((a) => /CONSULTORES_PROCESSO|ConsultorProcesso|ConsultorNome|constants\/consultores|VENDEDORES_DIR|CONSULTOR_OPTIONS|VENDEDOR_DIR_OPTIONS/.test(a.texto))
      .map((a) => a.caminho);
    expect(violacoes).toEqual([]);
  });

  it("as telas carregam a lista pelo composable único e a entregam aos formulários", () => {
    const ler = (p: string) => readFileSync(join(RAIZ, p), "utf-8");
    for (const [arquivo, prop] of [
      ["app/pages/processos.vue", ':consultores="consultores"'],
      ["app/pages/prestacao.vue", ':consultores="consultores"'],
      ["app/pages/dir.vue", ':consultores="consultores"'],
      ["app/components/configuracoes/ContasTab.vue", ':consultores="consultores"'],
    ] as const) {
      const texto = ler(arquivo);
      expect(texto, arquivo).toContain("useConsultores()");
      expect(texto, arquivo).toContain("carregarConsultores");
      expect(texto, arquivo).toContain(prop);
    }
  });

  it("o servidor confere o consultor em TODA gravação: processos, prestação, DIR e contas", () => {
    const ler = (p: string) => readFileSync(join(RAIZ, p), "utf-8");
    for (const arquivo of [
      "server/api/processos/index.post.ts",
      "server/api/processos/[id].patch.ts",
      "server/api/patients/index.post.ts",
      "server/api/patients/[id].put.ts",
      "server/utils/dirStore.ts",
    ]) {
      expect(ler(arquivo), arquivo).toContain("erroDoConsultorEnviado");
    }
    for (const arquivo of ["server/api/admin/users.post.ts", "server/api/admin/users/[id].patch.ts"]) {
      expect(ler(arquivo), arquivo).toContain("exigirConsultorDaContaNoCadastro");
    }
    expect(ler("server/middleware/auth.ts")).toContain("conferirConsultorDaSessao");
  });

  it("o escopo do cargo consultor continua por comparação EXATA do nome (processoEscopo)", () => {
    const escopo = readFileSync(join(RAIZ, "server/utils/processoEscopo.ts"), "utf-8");
    expect(escopo).toContain("processo.consultor === user.consultorNome");
  });
});
