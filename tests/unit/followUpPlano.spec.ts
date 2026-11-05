import { describe, expect, it } from "vitest";
// @ts-expect-error — script de migração em .mjs (sem tipos); só usado por este teste e pelos scripts one-time.
import { PASTAS_DEMO, chaveDe, montarPlano, regraMandadoNovo } from "../../scripts/migration/followUpPlano.mjs";

// Fixtures SINTÉTICOS (nenhum dado real de paciente).
const DOC = [
  "André",
  "1. Fulano Um (2026 - 100) - FARMAURORA",
  "Status: desembaraço",
  "Registro LPCO pelo despachante: 20/10",
  "Obs.: liberação prevista via Mandado de Segurança",
  "2. Fulano Dois - Ordem 2 (2026 - 11) - MAINZFARMA",
  "Status: desembaraço",
  "3. Fulano Tres - Ordem 1 (2026 - 409) - FARMAURORA",
  "Status: desembaraço",
  "4. Fulano Tres - Ordem 2 (2026 - 409) - FARMAURORA",
  "Status: desembaraço",
].join("\n");

const linhaBanco = (pasta: string, ordem: string | null, extra: Record<string, unknown> = {}) => ({
  id: `id-${pasta}-${ordem ?? ""}`,
  pasta,
  ordem,
  paciente: "Paciente Banco",
  alerta_fornecedor_resolvido: false,
  alerta_mandado_resolvido: false,
  ...extra,
});

const BACKUP = [
  linhaBanco("2026 - 100", null, { alerta_fornecedor_resolvido: true }), // permanece, com marca
  linhaBanco("2026 - 11", "Ordem 1"), // o Doc só traz a Ordem 2 → apagado
  linhaBanco("2026 - 11", "Ordem 2", { alerta_mandado_resolvido: true }), // permanece, com marca
  linhaBanco("2026 - 200", null, { alerta_mandado_resolvido: true }), // fora do Doc → apagado
  linhaBanco("2026 - 901", null), // demo
  linhaBanco("2026 - 904", null, { alerta_fornecedor_resolvido: true }), // demo
];

describe("plano da recarga do Follow-Up", () => {
  const plano = montarPlano({ texto: DOC, backup: BACKUP, ms: 1, agora: "2026-11-05T15:00:00.000Z" });
  const k = (e: { record: { pasta: string; ordem?: string } }) => chaveDe(e.record.pasta, e.record.ordem);

  it("chave = pasta + ordem; pasta repetida com Ordem 1 e 2 são processos distintos", () => {
    expect(chaveDe("2026 - 409", "Ordem 1")).not.toBe(chaveDe("2026 - 409", "Ordem 2"));
    expect(chaveDe("2026 - 100", undefined)).toBe(chaveDe("2026 - 100", null));
    expect(plano.duplicadas).toEqual([]);
  });

  it("permanecem / novos / apagados pela chave (demo fora de tudo)", () => {
    expect(plano.permanecem.map(k).sort()).toEqual(["2026 - 100|", "2026 - 11|Ordem 2"]);
    expect(plano.novos.map(k)).toEqual(["2026 - 409|Ordem 1", "2026 - 409|Ordem 2"]);
    expect(plano.apagados.map((r: { pasta: string; ordem: string | null }) => chaveDe(r.pasta, r.ordem)).sort()).toEqual(["2026 - 11|Ordem 1", "2026 - 200|"]);
    expect(plano.reais).toHaveLength(4);
    expect(plano.demo.map((r: { pasta: string }) => r.pasta)).toEqual(["2026 - 901", "2026 - 904"]);
    expect(PASTAS_DEMO).toEqual(["2026 - 901", "2026 - 902", "2026 - 903", "2026 - 904"]);
  });

  it("flags: quem permanece mantém as do banco; novos usam a regra do mandado e fornecedor=false", () => {
    const f100 = plano.flagsDe(plano.permanecem.find((e: { record: { pasta: string } }) => e.record.pasta === "2026 - 100"));
    expect(f100).toMatchObject({ fornecedor: true, mandado: false });
    const f11 = plano.flagsDe(plano.permanecem.find((e: { record: { pasta: string } }) => e.record.pasta === "2026 - 11"));
    expect(f11).toMatchObject({ fornecedor: false, mandado: true });
    for (const n of plano.novos) expect(plano.flagsDe(n)).toMatchObject({ fornecedor: false, mandado: false });
  });

  it("linhas de carga: 37 colunas, flags preservadas, ids na ordem do Doc, nenhuma pasta demo", () => {
    expect(plano.linhas).toHaveLength(4);
    const l100 = plano.linhas.find((l: { pasta: string }) => l.pasta === "2026 - 100");
    expect([l100.alerta_fornecedor_resolvido, l100.alerta_mandado_resolvido]).toEqual([true, false]);
    expect(plano.linhas.every((l: { pasta: string }) => !PASTAS_DEMO.includes(l.pasta))).toBe(true);
    const ids = plano.linhas.map((l: { id: string }) => l.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("flags dos processos reais do banco (para devolver depois), com a situação de cada um", () => {
    expect(plano.flagsReais).toEqual([
      expect.objectContaining({ pasta: "2026 - 100", fornecedor: true, mandado: false, permanece: true }),
      expect.objectContaining({ pasta: "2026 - 11", ordem: "Ordem 2", mandado: true, permanece: true }),
      expect.objectContaining({ pasta: "2026 - 200", mandado: true, permanece: false }),
    ]);
  });
});

describe("regra do mandado para processos novos (mesma da migration 20261028)", () => {
  const base = { status: "desembaraco", datas: { registroLpco: "20/10" }, atualizacoes: [{ data: "", texto: "Obs.: via Mandado de Segurança" }] };
  it("desembaraço + LPCO + 'mandado' no texto → true", () => expect(regraMandadoNovo(base)).toBe(true));
  it("sem LPCO, fora de desembaraço ou sem 'mandado' → false", () => {
    expect(regraMandadoNovo({ ...base, datas: {} })).toBe(false);
    expect(regraMandadoNovo({ ...base, datas: { registroLpco: "  " } })).toBe(false);
    expect(regraMandadoNovo({ ...base, status: "em_transito" })).toBe(false);
    expect(regraMandadoNovo({ ...base, atualizacoes: [{ data: "", texto: "7 dias vencem - solicitar MS" }] })).toBe(false);
  });
  it("ILIKE: maiúsculas e plural contam", () => {
    expect(regraMandadoNovo({ ...base, atualizacoes: [{ data: "", texto: "MANDADOS pendentes" }] })).toBe(true);
  });
});
