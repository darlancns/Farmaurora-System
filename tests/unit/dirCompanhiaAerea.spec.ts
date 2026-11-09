// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { CIAS_AEREAS_POR_MODAL, CIAS_AEREAS_TODAS } from "#shared/constants/processos";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import { useDirForm } from "../../app/composables/useDirForm";
import { FILTROS_DIR_VAZIOS, aplicarFiltrosDir } from "../../app/utils/dirFiltros";
import { montarCiaAereaDirOptions } from "../../app/utils/dirOptions";
import { colunasDeDir, montarDir, type DirRow } from "../../server/utils/dirMappers";
import { isValidDirPatch, isValidDirPayload } from "../../server/utils/dirValidation";
import { parseDirCsv } from "../../shared/utils/dirParser";
import { CASCA, EM_ABERTO, csv, linhaCsv } from "./helpers/dirCsv";
import { novoDir, novoDirDTO } from "./helpers/dirFixtures";
import { FakeSupabase } from "./helpers/fakeSupabase";

// Cia aérea na DIR: coluna companhia_aerea (migration nova, NÃO aplicada), campo opcional no tipo, mapper, validação,
// formulário (select com a lista do Follow-Up + "(inativo)"), busca e o AWB intacto (conteúdo não validado).
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));
const { createDir, patchDir } = await import("../../server/utils/dirStore");

const lerFonte = (caminho: string): string => readFileSync(resolve(process.cwd(), caminho), "utf-8");

describe("migration 20261109100000_dir_companhia_aerea.sql", () => {
  const sql = lerFonte("supabase/migrations/20261109100000_dir_companhia_aerea.sql");
  const comandos = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);

  it("é UM comando: acrescenta companhia_aerea (text), idempotente e aditivo", () => {
    expect(comandos).toEqual(["alter table public.dir add column if not exists companhia_aerea text"]);
  });

  it("sem CHECK, default, índice, NOT NULL nem comando que mexa em dados", () => {
    const corpo = comandos.join(" ").toLowerCase();
    for (const proibido of ["check", "default", "index", "not null", "update ", "insert ", "delete ", "drop ", "truncate"]) {
      expect(corpo, proibido).not.toContain(proibido);
    }
  });

  it("a migration da DIR original continua como estava (sem a coluna: ela é aditiva à parte)", () => {
    expect(lerFonte("supabase/migrations/20261026000000_dir.sql")).not.toContain("companhia_aerea");
  });

  it("o nome da coluna é o mesmo do Follow-Up", () => {
    expect(lerFonte("server/utils/processoMappers.ts")).toContain("companhia_aerea");
  });
});

describe("lista de cias: fonte única (Follow-Up)", () => {
  it("o select da DIR usa EXATAMENTE a lista de shared/constants/processos.ts (Qatar já existe nela)", () => {
    const rotulos = montarCiaAereaDirOptions("").map((o) => o.value);
    expect(rotulos).toEqual(["", ...CIAS_AEREAS_TODAS]);
    expect(rotulos).toContain("Qatar");
    expect(montarCiaAereaDirOptions("").map((o) => o.label)[0]).toBe("Selecione");
  });

  it("a lista é a união das cias de todos os modais do Follow-Up, sem repetir e em ordem alfabética", () => {
    const uniao = new Set(Object.values(CIAS_AEREAS_POR_MODAL).flat());
    expect([...CIAS_AEREAS_TODAS].sort()).toEqual([...uniao].sort());
    expect(new Set(CIAS_AEREAS_TODAS).size).toBe(CIAS_AEREAS_TODAS.length);
  });

  it("a DIR não duplica a lista: importa de processos.ts e não tem nome de cia próprio", () => {
    const fonte = lerFonte("app/utils/dirOptions.ts");
    expect(fonte).toMatch(/CIAS_AEREAS_TODAS[\s\S]*from "#shared\/constants\/processos"/);
    for (const nome of ["Lufthansa", "Emirates", "Qatar", "Swiss", "Turkish", "FedEx", "DHL"]) {
      expect(fonte, nome).not.toContain(`"${nome}"`);
    }
    expect(lerFonte("shared/constants/dir.ts")).not.toMatch(/Lufthansa|Emirates/);
  });

  it("sem 'Outro' (o select de cia do Follow-Up também não tem)", () => {
    expect(montarCiaAereaDirOptions("").map((o) => o.value)).not.toContain("Outro");
  });
});

describe("montarCiaAereaDirOptions: valor antigo fora da lista", () => {
  it("aparece como '<valor> (inativo)', selecionável e nunca vazio", () => {
    const o = montarCiaAereaDirOptions("Lufthansa Cargo");
    expect(o.at(-1)).toEqual({ value: "Lufthansa Cargo", label: "Lufthansa Cargo (inativo)" });
    expect(o).toHaveLength(CIAS_AEREAS_TODAS.length + 2);
  });

  it("valor da lista, vazio e só espaços não criam opção extra", () => {
    for (const atual of ["Lufthansa", "Qatar", "", "   "]) {
      expect(montarCiaAereaDirOptions(atual), atual).toHaveLength(CIAS_AEREAS_TODAS.length + 1);
    }
  });
});

describe("tipo e mapper", () => {
  const row = (extra: Partial<DirRow> = {}): DirRow =>
    ({
      id: "x",
      po: "PO26-10-0001",
      paciente: "P",
      vendedor: "V",
      conferido: false,
      exigencia: false,
      operacao_encerrada: false,
      fechamento_restante: false,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      ...extra,
    }) as DirRow;

  it("leitura: companhia_aerea → companhiaAerea; NULL e coluna ausente (antes da migration) viram ''", () => {
    expect(montarDir(row({ companhia_aerea: "Qatar" })).companhiaAerea).toBe("Qatar");
    expect(montarDir(row({ companhia_aerea: null })).companhiaAerea).toBe("");
    expect(montarDir(row()).companhiaAerea).toBe("");
  });

  it("escrita: companhiaAerea → companhia_aerea; '' e só espaços viram NULL; sem a chave, a coluna não é escrita", () => {
    expect(colunasDeDir({ companhiaAerea: "Qatar" })).toEqual({ companhia_aerea: "Qatar" });
    expect(colunasDeDir({ companhiaAerea: "  " })).toEqual({ companhia_aerea: null });
    expect(colunasDeDir({ banco: "XP" })).toEqual({ banco: "XP" });
    expect("companhia_aerea" in colunasDeDir(novoDirDTO())).toBe(true); // o create do formulário sempre leva
  });

  it("o AWB não muda de forma: segue texto cru, sem separar a cia", () => {
    expect(montarDir(row({ awb: "Lufthansa: 020-01045494", companhia_aerea: null }))).toMatchObject({
      awb: "Lufthansa: 020-01045494",
      companhiaAerea: "",
    });
    expect(colunasDeDir({ awb: "Lufthansa: 020-01045494" })).toEqual({ awb: "Lufthansa: 020-01045494" });
  });
});

describe("validação do servidor", () => {
  it("create: aceita com companhiaAerea (vazia, da lista ou antiga fora da lista)", () => {
    for (const companhiaAerea of ["", "Qatar", "Lufthansa Cargo", "Turkish Airlines"]) {
      expect(isValidDirPayload(novoDirDTO({ companhiaAerea })), companhiaAerea).toBe(true);
    }
  });

  it("create: aba antiga, SEM a chave companhiaAerea, continua funcionando; as outras chaves seguem obrigatórias", () => {
    const { companhiaAerea: _c, ...semCia } = novoDirDTO();
    expect(isValidDirPayload(semCia)).toBe(true);
    const { swift: _s, ...semSwift } = novoDirDTO();
    expect(isValidDirPayload(semSwift)).toBe(false);
  });

  it("recusa companhiaAerea que não é texto ou é longa demais; chave desconhecida continua recusada", () => {
    expect(isValidDirPayload({ ...novoDirDTO(), companhiaAerea: 7 })).toBe(false);
    expect(isValidDirPayload({ ...novoDirDTO(), companhiaAerea: null })).toBe(false);
    expect(isValidDirPayload(novoDirDTO({ companhiaAerea: "x".repeat(301) }))).toBe(false);
    expect(isValidDirPayload({ ...novoDirDTO(), cia: "Qatar" })).toBe(false);
  });

  it("patch aceita companhiaAerea sozinha ou junto de outros campos", () => {
    expect(isValidDirPatch({ companhiaAerea: "Qatar" })).toBe(true);
    expect(isValidDirPatch({ companhiaAerea: "", banco: "XP" })).toBe(true);
    expect(isValidDirPatch({ companhiaAerea: 7 })).toBe(false);
  });

  it("o conteúdo do AWB NÃO é validado (linhas antigas têm 'Lufthansa: 020-01045494')", () => {
    for (const awb of ["Lufthansa: 020-01045494", "020-01045494", "23/out.", "FALECIMENTO", "", "qualquer texto 123"]) {
      expect(isValidDirPayload(novoDirDTO({ awb })), awb).toBe(true);
      expect(isValidDirPatch({ awb }), awb).toBe(true);
    }
  });

  it("RBAC: a seção da DIR segue a mesma (a regra é por rota, não por campo)", () => {
    const rbac = lerFonte("shared/utils/rbac.ts");
    expect(rbac).not.toMatch(/companhia|awb/i);
  });
});

describe("dirStore com o banco em memória", () => {
  const T = "dir";
  beforeEach(() => {
    fake.tabelas[T] = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("create grava companhia_aerea; sem a chave (aba antiga) a coluna fica fora do insert", async () => {
    await createDir(novoDirDTO({ companhiaAerea: "  Qatar " }), "Rebeca");
    expect(fake.linhas(T)[0]!.companhia_aerea).toBe("Qatar");

    fake.tabelas[T] = [];
    const { companhiaAerea: _c, ...semCia } = novoDirDTO();
    await createDir(semCia, "Rebeca");
    expect("companhia_aerea" in fake.linhas(T)[0]!).toBe(false);
  });

  it("patch grava e limpa; o AWB não é tocado", async () => {
    fake.tabelas[T] = [
      { id: "a", po: "PO26-10-0001", paciente: "P", vendedor: "V", awb: "Lufthansa: 020-01045494", updated_at: "x" },
    ];
    await patchDir("a", { companhiaAerea: "Emirates" }, "Rebeca");
    expect(fake.linhas(T)[0]).toMatchObject({ companhia_aerea: "Emirates", awb: "Lufthansa: 020-01045494" });
    await patchDir("a", { companhiaAerea: "" }, "Rebeca");
    expect(fake.linhas(T)[0]!.companhia_aerea).toBeNull();
  });
});

describe("formulário (useDirForm)", () => {
  function pronto(dir: ReturnType<typeof novoDir> | null = null) {
    const f = useDirForm(() => dir);
    f.form.po = "PO26-10-0471";
    f.form.paciente = "Fulano";
    f.outros.vendedor.state.select = "Mateus Morais";
    return f;
  }

  it("criação: a cia escolhida vai no payload e na atualização; vazia vai ''", () => {
    const f = pronto();
    expect(f.form.companhiaAerea).toBe("");
    let r = f.validar();
    expect(r.valido && r.payload.companhiaAerea).toBe("");
    f.form.companhiaAerea = "Qatar";
    r = f.validar();
    expect(r.valido && r.payload.companhiaAerea).toBe("Qatar");
    expect(r.valido && r.atualizacao.companhiaAerea).toBe("Qatar");
  });

  it("edição: carrega a cia gravada; cia antiga fora da lista fica como está ao salvar outros campos", () => {
    const dir = novoDir({ companhiaAerea: "Lufthansa Cargo", awb: "020-01045494" });
    const f = pronto(dir);
    expect(f.form.companhiaAerea).toBe("Lufthansa Cargo");
    f.form.paciente = "Outro nome";
    const r = f.validar();
    expect(r.valido && r.atualizacao.companhiaAerea).toBe("Lufthansa Cargo");
    expect(r.valido && r.atualizacao.awb).toBe("020-01045494");
  });

  it("edição de linha antiga (cia vazia, AWB com a cia dentro): nada é separado nem alterado", () => {
    const dir = novoDir({ companhiaAerea: "", awb: "Lufthansa: 020-01045494" });
    const f = pronto(dir);
    const r = f.validar();
    expect(r.valido && r.atualizacao.companhiaAerea).toBe("");
    expect(r.valido && r.atualizacao.awb).toBe("Lufthansa: 020-01045494");
  });
});

// ── Formulário montado ─────────────────────────────────────────────────────────────────────────────

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montar(editingDir: ReturnType<typeof novoDir> | null = null): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({ render: () => h(DirFormModal, { editingDir, contagemPorPo: new Map<string, number>() }) }),
  );
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
});

describe("DirFormModal montado: Cia aérea", () => {
  it("fica na seção Logística, logo antes do AWB, com o rótulo 'Cia aérea'", async () => {
    montar();
    await nextTick();
    const secao = document.getElementById("dir-secao-logistica")!;
    const cia = document.getElementById("df-companhia-aerea")!;
    const awb = document.getElementById("df-awb")!;
    expect(secao.contains(cia)).toBe(true);
    expect(cia.compareDocumentPosition(awb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(secao.querySelector("label[for='df-companhia-aerea']")?.textContent).toBe("Cia aérea");
    // nada entre a cia e o AWB: o bloco da cia (filho da grade) vem imediatamente antes do bloco do AWB
    const grade = secao.querySelector(".grid")!;
    const bloco = (el: Element) => [...grade.children].find((c) => c.contains(el))!;
    expect(bloco(cia).nextElementSibling).toBe(bloco(awb));
  });

  it("mostra a cia gravada; sem cia mostra 'Selecione'", async () => {
    montar(novoDir({ companhiaAerea: "Qatar" }));
    await nextTick();
    expect(document.getElementById("df-companhia-aerea")!.textContent).toContain("Qatar");
  });

  it("valor antigo fora da lista aparece '(inativo)' e não vazio", async () => {
    montar(novoDir({ companhiaAerea: "Lufthansa Cargo" }));
    await nextTick();
    expect(document.getElementById("df-companhia-aerea")!.textContent).toContain("Lufthansa Cargo (inativo)");
  });

  it("o AWB mostra só o número no placeholder e o campo continua com data-sem-maiuscula", async () => {
    montar();
    await nextTick();
    const awb = document.getElementById("df-awb") as HTMLInputElement;
    expect(awb.getAttribute("placeholder")).toBe("020-00000000");
    expect(awb.hasAttribute("data-sem-maiuscula")).toBe(true);
  });

  it("a Origem continua no formulário (não foi removida)", async () => {
    montar();
    await nextTick();
    expect(document.getElementById("df-origem")).not.toBeNull();
  });
});

describe("busca da DIR pela cia (e AWB sem mudança)", () => {
  const lista = [
    novoDir({ id: "nova", po: "PO26-10-0001", companhiaAerea: "Lufthansa", awb: "020-46388355" }),
    novoDir({ id: "antiga", po: "PO26-10-0002", companhiaAerea: "", awb: "Lufthansa: 020-11122233" }),
    novoDir({ id: "qatar", po: "PO26-10-0003", companhiaAerea: "Qatar", awb: "157-54815751" }),
    novoDir({ id: "fedex", po: "PO26-10-0004", companhiaAerea: "FedEx", awb: "8701 0946 525" }),
  ];
  const ids = (busca: string) => aplicarFiltrosDir(lista, { ...FILTROS_DIR_VAZIOS, busca }).map((d) => d.id);

  it("'lufthansa' acha pela cia (linha nova) e pelo AWB antigo (linha sem cia)", () => {
    expect(ids("lufthansa")).toEqual(["nova", "antiga"]);
    expect(ids("LUFTHANSA")).toEqual(["nova", "antiga"]);
    expect(ids("Lufthansa 020-4638")).toEqual(["nova"]); // cia e número vizinhos no texto de busca
  });

  it("outras cias", () => {
    expect(ids("qatar")).toEqual(["qatar"]);
    expect(ids("fedex")).toEqual(["fedex"]);
    expect(ids("dhl")).toEqual([]);
  });

  it("o AWB continua ignorando pontuação", () => {
    expect(ids("02046388355")).toEqual(["nova"]);
    expect(ids("020-4638-8355")).toEqual(["nova"]);
    expect(ids("157 54815751")).toEqual(["qatar"]);
    expect(ids("8701")).toEqual(["fedex"]);
  });
});

describe("carga (parser) não muda", () => {
  it("o registro do parser NÃO traz companhiaAerea: a carga não escreve a coluna e o AWB sai cru", () => {
    const r = parseDirCsv(csv(CASCA, linhaCsv({ ...EM_ABERTO, awb: "Lufthansa: 020-01045494" })));
    const registro = r.linhas.find((l) => l.registro?.po)?.registro;
    expect(registro?.awb).toBe("Lufthansa: 020-01045494");
    expect(registro && "companhiaAerea" in registro).toBe(false);
    expect("companhia_aerea" in colunasDeDir(registro!)).toBe(false);
  });
});
