import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Processo } from "#shared/types/processo";
import { CAMPOS_PROCESSO_LIMPAVEIS } from "../../shared/constants/processos";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import { montarPatchDiferencial, validarProcessoForm } from "../../app/utils/processoFormPayload";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { FakeSupabase } from "./helpers/fakeSupabase";
import {
  MEDICAMENTOS,
  VERSAO,
  ATUALIZACOES,
  editado,
  estadoCompleto,
  formCompleto,
  linhaCompleta,
} from "./helpers/processoEdicaoFixtures";

// Item 5 do lote Follow-Up — "Rastreio" saiu do sistema: fica só "Nº AWB". A coluna codigo_rastreio
// ainda existe no banco até ser apagada, mas o app não a lê nem a grava. Abas antigas (JavaScript
// velho até recarregar) podem mandar `codigoRastreio`: o servidor IGNORA o campo, sem erro 400.
// Handlers e store são os REAIS; só h3 e o Supabase (em memória) são simulados.

const h = vi.hoisted(() => ({ body: {} as unknown }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => "proc_1") };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: patchHandler } = await import("../../server/api/processos/[id].patch");
const { default: postHandler } = await import("../../server/api/processos/index.post");
const { isValidProcessoPatch, isValidProcessoPayload } = await import("../../server/utils/processoValidation");

const T = "follow_up";
const row = () => fake.linhas(T).find((r) => r.id === "proc_1")!;
const evento = { context: { user: null } } as unknown as Parameters<typeof patchHandler>[0];

async function patch(corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo)); // como na rede
  return patchHandler(evento);
}

beforeEach(() => {
  // A linha do banco AINDA tem a coluna (até ser apagada), com um valor legado.
  fake.tabelas[T] = [linhaCompleta({ codigo_rastreio: "LEGADO-123" })];
  fake.chamadas.length = 0;
});

describe("PATCH de aba antiga com codigoRastreio", () => {
  it("é aceito (sem erro 400), não grava na coluna e não altera o AWB", async () => {
    const corpo = { parcial: true, codigoRastreio: "NOVO-999", localEntrega: "Clínica nova" };
    expect(isValidProcessoPatch(JSON.parse(JSON.stringify(corpo)))).toBe(true);

    const res = await patch(corpo);

    expect(row().codigo_rastreio).toBe("LEGADO-123");
    expect(row().numero_awb).toBe("957-12345678");
    expect(row().local_entrega).toBe("Clínica nova"); // o resto do patch vale
    expect((res as unknown as Record<string, unknown>).codigoRastreio).toBeUndefined();
    expect(res.numeroAwb).toBe("957-12345678");
  });

  it("codigoRastreio: null (aba antiga esvaziando o campo) também é ignorado: a coluna não é zerada", async () => {
    await patch({ parcial: true, codigoRastreio: null, companhiaAerea: "Emirates" });

    expect(row().codigo_rastreio).toBe("LEGADO-123");
    expect(row().companhia_aerea).toBe("Emirates");
  });

  it("patch SÓ com codigoRastreio é aceito e não grava nada além do updated_at", async () => {
    const antes = { ...row() };
    await patch({ parcial: true, codigoRastreio: "X" });

    const { updated_at: _a, ...depois } = row();
    const { updated_at: _b, ...antesSemData } = antes;
    expect(depois).toEqual(antesSemData);
  });

  it("formato antigo (sem parcial, com versão e atualizações) também ignora o campo", async () => {
    const res = await patch({ codigoRastreio: "NOVO-999", atualizacoes: ATUALIZACOES, versao: VERSAO });

    expect(res.id).toBe("proc_1");
    expect(row().codigo_rastreio).toBe("LEGADO-123");
  });

  it("esvaziar o AWB persiste: numero_awb vira NULL (e o rastreio legado não é tocado)", async () => {
    const p = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroAwb = "")));
    expect(p).toEqual({ numeroAwb: null, parcial: true });

    await patch(p);

    expect(row().numero_awb).toBeNull();
    expect(row().codigo_rastreio).toBe("LEGADO-123");
  });
});

describe("POST de aba antiga com codigoRastreio", () => {
  it("é aceito, não grava codigo_rastreio e não devolve o campo", async () => {
    const r = validarProcessoForm(formCompleto(), MEDICAMENTOS, [], "Poros - Turquia");
    if (!r.valido) throw new Error(r.erro);
    const corpo = { ...JSON.parse(JSON.stringify(r.payload)), atualizacoes: [], codigoRastreio: "ABA-ANTIGA" };
    expect(isValidProcessoPayload(corpo)).toBe(true);
    h.body = corpo;
    fake.tabelas[T] = [];

    const criado = await postHandler(evento);

    const gravada = fake.linhas(T)[0]!;
    expect("codigo_rastreio" in gravada).toBe(false);
    expect(gravada.numero_awb).toBe("957-12345678");
    expect("codigoRastreio" in criado).toBe(false);
    expect(criado.numeroAwb).toBe("957-12345678");
  });
});

describe("formulário sem Rastreio", () => {
  const processoDe = (extra: Record<string, unknown> = {}): Processo =>
    montarProcesso(linhaCompleta(extra) as unknown as FollowUpRow);

  it("processo carregado que ainda tem rastreio no banco: o formulário não tem o campo e salvar sem alterar não envia nada", () => {
    const { form, validarEdicao } = useProcessoForm(() => processoDe({ codigo_rastreio: "LEGADO-123" }));

    expect("codigoRastreio" in form).toBe(false);
    const r = validarEdicao();
    if (!r.valido) throw new Error(r.erro);
    expect(r.patch).toBeNull();
  });

  it("alterar outro campo não leva nenhuma chave de rastreio no corpo", () => {
    const { form, validarEdicao } = useProcessoForm(() => processoDe({ codigo_rastreio: "LEGADO-123" }));
    form.localEntrega = "Outro";

    const r = validarEdicao();
    if (!r.valido || !r.patch) throw new Error("esperava um patch");
    expect(JSON.stringify(r.patch)).not.toMatch(/rastreio/i);
  });

  it("o payload de criação e a lista de campos limpáveis não citam rastreio", () => {
    const r = validarProcessoForm(formCompleto(), MEDICAMENTOS, [], "Poros - Turquia");
    if (!r.valido) throw new Error(r.erro);
    expect(JSON.stringify(r.payload)).not.toMatch(/rastreio/i);
    expect(CAMPOS_PROCESSO_LIMPAVEIS).not.toContain("codigoRastreio");
    expect(CAMPOS_PROCESSO_LIMPAVEIS).toContain("numeroAwb");
  });
});
