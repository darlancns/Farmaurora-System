// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import * as constantesDir from "#shared/constants/dir";
import { MODAIS_ENVIO } from "#shared/constants/processos";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import DirList from "../../app/components/dir/DirList.vue";
import { useDirForm } from "../../app/composables/useDirForm";
import { montarCamposFiltroDir, montarEnvioDirOptions } from "../../app/utils/dirOptions";
import { ENVIO_DIR_ERRO, ciaContradizEnvio, converterEnvioDaPlanilha, envioDirValido, erroEnvioDir } from "../../shared/utils/dirEnvio";
import { parseDirCsv } from "../../shared/utils/dirParser";
import { CASCA, EM_ABERTO, csv, linhaCsv } from "./helpers/dirCsv";
import { novoDir, novoDirDTO } from "./helpers/dirFixtures";
import { FakeSupabase } from "./helpers/fakeSupabase";

// DIR: (1) o rótulo "Vendedor" virou "Consultor" na interface (a coluna e os nomes internos continuam `vendedor`) e (2) o Envio
// usa as opções do Follow-Up (MODAIS_ENVIO, fonte única): validação no cliente e no servidor, tolerância a valor antigo
// igual ao gravado e conversão do Envio da planilha no parser da carga (sem sobrescrever a cia, com aviso de contradição).
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));
const { createDir, patchDir } = await import("../../server/utils/dirStore");
const { DirRegraError } = await import("../../server/utils/dirValidation");

// ── Consultor (rótulo) ─────────────────────────────────────────────────────────────────────────────────

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
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const formulario = (dir: ReturnType<typeof novoDir> | null = null) =>
  montar(() => h(DirFormModal, { editingDir: dir, contagemPorPo: new Map<string, number>() }));

describe("Consultor no lugar de Vendedor", () => {
  it("formulário: o campo (id df-vendedor) tem o rótulo 'Consultor'", async () => {
    formulario();
    await nextTick();
    expect(texto(document.querySelector("label[for='df-vendedor']"))).toBe("Consultor");
    expect(texto(document.getElementById("dir-form"))).not.toMatch(/vendedor/i);
  });

  it("tabela: o cabeçalho da coluna é 'Consultor'", async () => {
    montar(() => h(DirList, { registros: [novoDir({ id: "a" })], contagemPorPo: new Map<string, number>() }));
    await nextTick();
    const lista = texto(document.getElementById("dir-list"));
    expect(lista).toContain("Consultor");
    expect(lista).not.toMatch(/vendedor/i);
  });

  it("filtro: 'Todos os consultores' (a chave interna continua vendedor)", () => {
    const campo = montarCamposFiltroDir([novoDir({ vendedor: "Mateus Morais" })]).find((c) => c.chave === "vendedor")!;
    expect(campo.id).toBe("filtro-dir-vendedor");
    expect(campo.opcoes[0]!.label).toBe("Todos os consultores");
    expect(campo.opcoes.map((o) => o.label).join("|")).not.toMatch(/vendedor/i);
  });

  it("mensagem de erro do formulário: 'Informe o consultor.'", () => {
    const f = useDirForm(() => null);
    f.form.po = "PO26-10-0471";
    f.form.paciente = "Fulano";
    expect(f.validar()).toEqual({ valido: false, erro: "Informe o consultor." });
  });

  it("o dado não mudou: o payload continua levando `vendedor`", () => {
    const f = useDirForm(() => null);
    f.form.po = "PO26-10-0471";
    f.form.paciente = "Fulano";
    f.outros.vendedor.state.select = "Mateus Morais";
    const r = f.validar();
    expect(r.valido && r.payload.vendedor).toBe("Mateus Morais");
  });
});

// ── Envio: regras puras ────────────────────────────────────────────────────────────────────────────────

describe("Envio da DIR = opções do Follow-Up (fonte única)", () => {
  it("shared/constants/dir.ts NÃO tem mais lista própria de envios", () => {
    expect("ENVIOS_DIR" in constantesDir).toBe(false);
  });

  it("o select usa EXATAMENTE MODAIS_ENVIO (Air Cargo, Courier Formal, Courier Simples), sem 'Outro'", () => {
    const valores = montarEnvioDirOptions("").map((o) => o.value);
    expect(valores).toEqual(["", ...MODAIS_ENVIO]);
    expect(valores.sort()).toEqual(["", "Air Cargo", "Courier Formal", "Courier Simples"].sort());
    expect(montarEnvioDirOptions("").map((o) => o.label)[0]).toBe("Selecione");
    expect(valores).not.toContain("Outro");
  });

  it("valor antigo fora da lista entra como '<valor> (inativo)' (nunca vazio)", () => {
    const o = montarEnvioDirOptions("FEDEX FORMAL");
    expect(o.at(-1)).toEqual({ value: "FEDEX FORMAL", label: "FEDEX FORMAL (inativo)" });
    expect(montarEnvioDirOptions("Air Cargo")).toHaveLength(MODAIS_ENVIO.length + 1);
  });

  it("envioDirValido: vazio ou exatamente uma das opções", () => {
    for (const v of ["", "  ", "Air Cargo", "Courier Formal", "Courier Simples"]) expect(envioDirValido(v), v).toBe(true);
    for (const v of ["Courier", "FEDEX FORMAL", "air cargo", "Outro", "x"]) expect(envioDirValido(v), v).toBe(false);
  });

  it("erroEnvioDir: sem a chave não confere; valor igual ao gravado é tolerado; outro inválido é erro", () => {
    expect(erroEnvioDir({})).toBeNull();
    expect(erroEnvioDir({ envio: "Air Cargo" })).toBeNull();
    expect(erroEnvioDir({ envio: "Courier" })).toBe(ENVIO_DIR_ERRO);
    expect(erroEnvioDir({ envio: "FEDEX FORMAL" }, { envio: "FEDEX FORMAL" })).toBeNull();
    expect(erroEnvioDir({ envio: "FEDEX FORMAL" }, { envio: "Air Cargo" })).toBe(ENVIO_DIR_ERRO);
    expect(erroEnvioDir({ envio: "Courier" }, { envio: null })).toBe(ENVIO_DIR_ERRO);
  });
});

describe("converterEnvioDaPlanilha", () => {
  it.each([
    ["Air Cargo", "Air Cargo"],
    ["FEDEX FORMAL", "Courier Formal"],
    ["DHL FORMAL", "Courier Formal"],
    ["FEDEX COURIER", "Courier Simples"],
    ["Courier", "Courier Simples"],
    ["  fedex   formal ", "Courier Formal"],
    ["COURIER", "Courier Simples"],
  ])("%s → %s", (entrada, saida) => {
    expect(converterEnvioDaPlanilha(entrada).envio).toBe(saida);
  });

  it("vazio → vazio; o nome novo já certo fica; desconhecido volta literal", () => {
    expect(converterEnvioDaPlanilha("")).toEqual({ envio: "", situacao: "vazio" });
    expect(converterEnvioDaPlanilha("   ")).toEqual({ envio: "", situacao: "vazio" });
    expect(converterEnvioDaPlanilha("Courier Formal")).toEqual({ envio: "Courier Formal", situacao: "igual" });
    expect(converterEnvioDaPlanilha("Rodoviário")).toEqual({ envio: "Rodoviário", situacao: "desconhecido" });
    expect(converterEnvioDaPlanilha("Air Cargo").situacao).toBe("igual");
    expect(converterEnvioDaPlanilha("FEDEX FORMAL").situacao).toBe("convertido");
  });
});

describe("ciaContradizEnvio", () => {
  it("contradiz: Courier com cia de Air Cargo e Air Cargo com FedEx/DHL", () => {
    expect(ciaContradizEnvio("Courier Formal", "Lufthansa")).toBe(true);
    expect(ciaContradizEnvio("Courier Simples", "Turkish")).toBe(true);
    expect(ciaContradizEnvio("Air Cargo", "FedEx")).toBe(true);
    expect(ciaContradizEnvio("Air Cargo", "DHL")).toBe(true);
  });

  it("não contradiz: cia do mesmo grupo, vazia, desconhecida ou envio vazio/desconhecido", () => {
    expect(ciaContradizEnvio("Air Cargo", "Lufthansa")).toBe(false);
    expect(ciaContradizEnvio("Courier Formal", "FedEx")).toBe(false);
    expect(ciaContradizEnvio("Courier Formal", "DHL")).toBe(false);
    expect(ciaContradizEnvio("Air Cargo", "")).toBe(false);
    expect(ciaContradizEnvio("", "Lufthansa")).toBe(false);
    expect(ciaContradizEnvio("Courier Formal", "Companhia Inventada")).toBe(false);
    expect(ciaContradizEnvio("Rodoviário", "Lufthansa")).toBe(false);
  });
});

// ── Parser da carga ────────────────────────────────────────────────────────────────────────────────────

const PACIENTE_SECRETO = "ZZ PACIENTE SECRETO DA SILVA";

function linha(envio: string, awb: string) {
  const r = parseDirCsv(csv(CASCA, linhaCsv({ ...EM_ABERTO, paciente: PACIENTE_SECRETO, envio, awb })));
  return r.linhas.find((l) => l.registro?.po)!;
}
const codigos = (l: ReturnType<typeof linha>) => l.avisos.map((a) => a.codigo);

describe("parser: Envio da planilha → opções do Follow-Up", () => {
  it("converte e mantém a cia do AWB (nunca sobrescrita pelo envio)", () => {
    const a = linha("FEDEX FORMAL", "FedEx: 123-45678901");
    expect(a.registro).toMatchObject({ envio: "Courier Formal", companhiaAerea: "FedEx", awb: "123-45678901" });
    expect(codigos(a)).not.toContain("ENVIO_CIA_CONTRADIZ");

    const b = linha("DHL FORMAL", "DHL: 555-00000001");
    expect(b.registro).toMatchObject({ envio: "Courier Formal", companhiaAerea: "DHL" });

    const c = linha("FEDEX COURIER", "FedEx: 777-00000002");
    expect(c.registro).toMatchObject({ envio: "Courier Simples", companhiaAerea: "FedEx" });

    const d = linha("Courier", "DHL: 888-00000003");
    expect(d.registro).toMatchObject({ envio: "Courier Simples", companhiaAerea: "DHL" });

    const e = linha("Air Cargo", "Lufthansa: 020-01045494");
    expect(e.registro).toMatchObject({ envio: "Air Cargo", companhiaAerea: "Lufthansa", awb: "020-01045494" });
    expect(codigos(e)).not.toContain("ENVIO_CIA_CONTRADIZ");
  });

  it("envio vazio continua vazio (e a cia do AWB fica)", () => {
    const a = linha("", "Lufthansa: 020-01045494");
    expect(a.registro).toMatchObject({ envio: "", companhiaAerea: "Lufthansa" });
    expect(codigos(a)).not.toContain("ENVIO_CIA_CONTRADIZ");
  });

  it("aviso quando cia e envio se contradizem — a cia NÃO é trocada", () => {
    const formalLufthansa = linha("FEDEX FORMAL", "Lufthansa: 020-01045494");
    expect(codigos(formalLufthansa)).toContain("ENVIO_CIA_CONTRADIZ");
    expect(formalLufthansa.registro).toMatchObject({ envio: "Courier Formal", companhiaAerea: "Lufthansa" });

    const arFedex = linha("Air Cargo", "FedEx: 123-45678901");
    expect(codigos(arFedex)).toContain("ENVIO_CIA_CONTRADIZ");
    expect(arFedex.registro).toMatchObject({ envio: "Air Cargo", companhiaAerea: "FedEx" });

    expect(codigos(linha("Air Cargo", "DHL: 555-00000001"))).toContain("ENVIO_CIA_CONTRADIZ");
    expect(codigos(linha("FEDEX COURIER", "Emirates: 176-00000004"))).toContain("ENVIO_CIA_CONTRADIZ");
  });

  it("a mensagem do aviso não leva nome de paciente", () => {
    const l = linha("FEDEX FORMAL", "Lufthansa: 020-01045494");
    const aviso = l.avisos.find((a) => a.codigo === "ENVIO_CIA_CONTRADIZ")!;
    expect(aviso.mensagem).not.toContain("SECRETO");
    expect(aviso.mensagem).toContain("FEDEX FORMAL");
    expect(aviso.mensagem).toContain("Lufthansa");
  });

  it("envio sem equivalente fica literal e gera ENVIO_DESCONHECIDO", () => {
    const l = linha("Rodoviário", "");
    expect(l.registro?.envio).toBe("Rodoviário");
    expect(codigos(l)).toContain("ENVIO_DESCONHECIDO");
    expect(codigos(l)).not.toContain("ENVIO_CIA_CONTRADIZ");
  });
});

// ── Servidor ───────────────────────────────────────────────────────────────────────────────────────────

describe("dirStore: Envio só pelas opções do Follow-Up", () => {
  const T = "dir";
  beforeEach(() => {
    fake.tabelas[T] = [];
    fake.chamadas.length = 0;
  });

  async function erro(p: Promise<unknown>): Promise<{ status: number; msg: string }> {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(DirRegraError);
      return { status: (e as InstanceType<typeof DirRegraError>).statusCode, msg: (e as Error).message };
    }
    throw new Error("esperava DirRegraError");
  }

  it("create: aceita as 3 opções e vazio; recusa o valor antigo (400, nada gravado)", async () => {
    for (const envio of ["Air Cargo", "Courier Formal", "Courier Simples", ""]) {
      await expect(createDir(novoDirDTO({ envio }), "Rebeca")).resolves.toBeDefined();
    }
    fake.tabelas[T] = [];
    const e = await erro(createDir(novoDirDTO({ envio: "FEDEX FORMAL" }), "Rebeca"));
    expect(e).toEqual({ status: 400, msg: ENVIO_DIR_ERRO });
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("patch: opção válida grava; valor inválido novo é 400 e nada é gravado", async () => {
    fake.tabelas[T] = [{ id: "a", po: "PO26-10-0001", paciente: "P", vendedor: "V", envio: "Air Cargo", updated_at: "x" }];
    await patchDir("a", { envio: "Courier Simples" }, "Rebeca");
    expect(fake.linhas(T)[0]!.envio).toBe("Courier Simples");
    const e = await erro(patchDir("a", { envio: "Courier" }, "Rebeca"));
    expect(e.status).toBe(400);
    expect(fake.linhas(T)[0]!.envio).toBe("Courier Simples");
  });

  it("patch: valor antigo IGUAL ao gravado continua tolerado ao editar outro campo", async () => {
    fake.tabelas[T] = [{ id: "a", po: "PO26-10-0001", paciente: "P", vendedor: "V", envio: "FEDEX FORMAL", updated_at: "x" }];
    await patchDir("a", { envio: "FEDEX FORMAL", observacao: "TUDO OK" }, "Rebeca");
    expect(fake.linhas(T)[0]).toMatchObject({ envio: "FEDEX FORMAL", observacao: "TUDO OK" });
    // ...mas trocar por OUTRO valor antigo/inválido, não.
    const e = await erro(patchDir("a", { envio: "DHL FORMAL" }, "Rebeca"));
    expect(e.status).toBe(400);
  });

  it("patch sem envio não consulta o gravado por causa do envio (e PO inexistente com envio inválido dá null)", async () => {
    fake.tabelas[T] = [{ id: "a", po: "PO26-10-0001", paciente: "P", vendedor: "V", envio: "FEDEX FORMAL", updated_at: "x" }];
    await patchDir("a", { observacao: "TUDO OK" }, "Rebeca");
    expect(fake.chamadas.filter((c) => c.op === "select")).toHaveLength(0);
    expect(await patchDir("nao-existe", { envio: "Courier" }, "Rebeca")).toBeNull();
  });
});

// ── Formulário ─────────────────────────────────────────────────────────────────────────────────────────

describe("formulário: Envio", () => {
  function pronto(dir: ReturnType<typeof novoDir> | null = null) {
    const f = useDirForm(() => dir);
    f.form.po = "PO26-10-0471";
    f.form.paciente = "Fulano";
    f.outros.vendedor.state.select = "Mateus Morais";
    return f;
  }

  it("escolhe uma das opções: vai no payload e na atualização; vazio vai ''", () => {
    const f = pronto();
    expect(f.form.envio).toBe("");
    let r = f.validar();
    expect(r.valido && r.payload.envio).toBe("");
    f.form.envio = "Courier Formal";
    r = f.validar();
    expect(r.valido && r.payload.envio).toBe("Courier Formal");
    expect(r.valido && r.atualizacao.envio).toBe("Courier Formal");
  });

  it("edição: valor antigo igual ao gravado passa ao salvar outro campo; outro valor fora da lista é recusado", () => {
    const f = pronto(novoDir({ envio: "FEDEX FORMAL" }));
    expect(f.form.envio).toBe("FEDEX FORMAL");
    f.form.paciente = "Outro nome";
    const ok = f.validar();
    expect(ok.valido && ok.atualizacao.envio).toBe("FEDEX FORMAL");
    f.form.envio = "DHL FORMAL";
    expect(f.validar()).toEqual({ valido: false, erro: ENVIO_DIR_ERRO });
  });

  it("DirFormModal: select Envio (df-envio) sem campo 'Outro', entre Fornecedor e Despachante", async () => {
    formulario(novoDir({ envio: "Courier Formal" }));
    await nextTick();
    const secao = document.getElementById("dir-secao-logistica")!;
    const fornecedor = document.getElementById("df-fornecedor")!;
    const envio = document.getElementById("df-envio")!;
    const despachante = document.getElementById("df-despachante")!;
    expect(texto(envio)).toContain("Courier Formal");
    expect(document.getElementById("df-envio-outro")).toBeNull();
    expect(texto(secao.querySelector("label[for='df-envio']"))).toBe("Envio");
    expect(fornecedor.compareDocumentPosition(envio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(envio.compareDocumentPosition(despachante) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("DirFormModal: valor antigo aparece '(inativo)' e não vazio", async () => {
    formulario(novoDir({ envio: "FEDEX FORMAL" }));
    await nextTick();
    expect(texto(document.getElementById("df-envio"))).toContain("FEDEX FORMAL (inativo)");
  });
});
