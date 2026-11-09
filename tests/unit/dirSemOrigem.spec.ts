import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDirForm } from "../../app/composables/useDirForm";
import { colunasDeDir, montarDir, type DirRow } from "../../server/utils/dirMappers";
import { isValidDirPatch, isValidDirPayload } from "../../server/utils/dirValidation";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { novoDir, novoDirDTO } from "./helpers/dirFixtures";

// A Origem saiu da DIR (formulário e código). A COLUNA origem do banco continua (nullable, só será apagada depois de a
// remoção estar publicada): o código deixa de ler e de escrever nela, e as linhas que ainda têm origem gravada abrem e
// salvam normalmente.

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));
const { createDir, patchDir } = await import("../../server/utils/dirStore");

const RAIZ = process.cwd();
const lerFonte = (caminho: string): string => readFileSync(resolve(RAIZ, caminho), "utf-8");

function arquivos(pasta: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(resolve(RAIZ, pasta))) {
    const caminho = join(pasta, nome);
    if (["node_modules", ".nuxt", ".output", "backups"].includes(nome)) continue;
    if (statSync(resolve(RAIZ, caminho)).isDirectory()) achados.push(...arquivos(caminho));
    else if (/\.(ts|vue|mjs|js)$/.test(nome)) achados.push(caminho.replace(/\\/g, "/"));
  }
  return achados;
}

describe("trava: nenhum arquivo de produção da DIR referencia 'origem' fora do parser", () => {
  // Arquivos da DIR (pelo caminho): componentes/dir, useDirForm, dirOptions, dirFiltros, dirMappers, dirStore, dirValidation,
  // shared/constants/dir.ts, shared/types/dir.ts, dirParser, os scripts carga-dir e dry-run-dir…
  const doDir = [...arquivos("app"), ...arquivos("server"), ...arquivos("shared"), ...arquivos("scripts")].filter((c) =>
    /dir/i.test(c.replace(/^(app|server|shared|scripts)\//, "")),
  );

  // Só o parser (a regra do Care Pharma) e o relatório do dry-run dessa regra; dirValidation só nomeia a chave legada que ignora.
  const PERMITIDOS = ["shared/utils/dirParser.ts", "scripts/migration/dry-run-dir.mjs", "server/utils/dirValidation.ts"];

  it("a busca pelos arquivos da DIR encontra os arquivos esperados (a trava não está vazia)", () => {
    for (const esperado of [
      "app/components/dir/DirFormModal.vue",
      "app/composables/useDirForm.ts",
      "app/utils/dirOptions.ts",
      "server/utils/dirMappers.ts",
      "server/utils/dirStore.ts",
      "shared/constants/dir.ts",
      "shared/types/dir.ts",
      "scripts/migration/carga-dir.mjs",
    ]) {
      expect(doDir, esperado).toContain(esperado);
    }
  });

  it("nenhum outro arquivo de produção da DIR cita 'origem'", () => {
    const citam = doDir.filter((c) => /origem/i.test(lerFonte(c)) && !PERMITIDOS.includes(c));
    expect(citam).toEqual([]);
  });

  it("no parser e no dry-run, 'origem' só aparece na regra do Care Pharma (a Origem não é gravada)", () => {
    for (const arquivo of ["shared/utils/dirParser.ts", "scripts/migration/dry-run-dir.mjs"]) {
      const fonte = lerFonte(arquivo);
      expect(fonte, arquivo).toMatch(/Care Pharma/i);
      expect(fonte, `${arquivo}: sem origem gravada`).not.toMatch(/origem\s*:\s*texto\(|row\.origem|\.origem\b/);
    }
  });

  it("em dirValidation, 'origem' só aparece na chave legada ignorada", () => {
    const linhas = lerFonte("server/utils/dirValidation.ts")
      .split("\n")
      .filter((l) => /origem/i.test(l));
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(l.trim().startsWith("//") || l.includes("CHAVES_LEGADAS_IGNORADAS"), l).toBe(true);
  });

  it("a migration histórica da DIR não foi alterada e nenhuma migration de remoção foi criada", () => {
    expect(lerFonte("supabase/migrations/20261026000000_dir.sql")).toMatch(/origem text,/);
    const migrations = readdirSync(resolve(RAIZ, "supabase/migrations"));
    for (const m of migrations) {
      const sql = lerFonte(`supabase/migrations/${m}`);
      expect(sql, m).not.toMatch(/drop\s+column[^;]*origem/i);
    }
  });
});

describe("tipos, mapper e formulário sem origem", () => {
  const linha = (extra: Partial<DirRow> & Record<string, unknown> = {}): DirRow =>
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

  it("montarDir não lê a coluna origem (linha com origem gravada abre normalmente)", () => {
    const dir = montarDir(linha({ origem: "Speciality", fornecedor: "Care Pharma" } as Partial<DirRow>));
    expect("origem" in dir).toBe(false);
    expect(dir.fornecedor).toBe("Care Pharma");
  });

  it("colunasDeDir nunca escreve origem, nem se o corpo trouxer a chave", () => {
    expect("origem" in colunasDeDir(novoDirDTO())).toBe(false);
    expect(colunasDeDir({ origem: "X", banco: "XP" } as never)).toEqual({ banco: "XP" });
  });

  it("o formulário não tem o campo, a lista nem a chave no payload", () => {
    const f = useDirForm(() => novoDir());
    expect("origem" in f.outros).toBe(false);
    f.form.po = "PO26-10-0471";
    f.form.paciente = "Fulano";
    f.outros.vendedor.state.select = "Mateus Morais";
    const r = f.validar();
    expect(r.valido).toBe(true);
    expect(r.valido && "origem" in r.payload).toBe(false);
    expect(r.valido && "origem" in r.atualizacao).toBe(false);
  });
});

describe("servidor: linhas com origem gravada e abas antigas", () => {
  const T = "dir";
  beforeEach(() => {
    fake.tabelas[T] = [];
  });

  const semearAntiga = () => {
    fake.tabelas[T] = [
      {
        id: "a",
        po: "PO26-10-0001",
        paciente: "P",
        vendedor: "V",
        fornecedor: "Care Pharma",
        origem: "Speciality",
        updated_at: "x",
      },
    ];
  };

  it("salvar uma linha antiga pelo formulário atual não escreve nem apaga a coluna origem", async () => {
    semearAntiga();
    const f = useDirForm(() => novoDir({ id: "a", fornecedor: "Care Pharma" }));
    f.form.po = "PO26-10-0001";
    f.form.paciente = "P";
    f.outros.vendedor.state.select = "Mateus Morais";
    f.form.paciente = "Paciente novo";
    const r = f.validar();
    expect(r.valido).toBe(true);
    if (!r.valido) return;
    await patchDir("a", r.atualizacao, "Rebeca");
    expect(fake.linhas(T)[0]).toMatchObject({ paciente: "Paciente novo", origem: "Speciality" });
  });

  it("aba antiga (corpo com origem) é aceita e a chave é ignorada: criar e editar continuam funcionando", async () => {
    expect(isValidDirPayload({ ...novoDirDTO(), origem: "Tosun (China)" })).toBe(true);
    expect(isValidDirPatch({ origem: "Tosun (China)", banco: "XP" })).toBe(true);

    await createDir({ ...novoDirDTO(), origem: "Tosun (China)" } as never, "Rebeca");
    expect("origem" in fake.linhas(T)[0]!).toBe(false);

    semearAntiga();
    await patchDir("a", { origem: "Outra", banco: "XP" } as never, "Rebeca");
    expect(fake.linhas(T).find((l) => l.id === "a")).toMatchObject({ banco: "XP", origem: "Speciality" });
  });

  it("o create não exige mais a chave origem", () => {
    expect("origem" in novoDirDTO()).toBe(false);
    expect(isValidDirPayload(novoDirDTO())).toBe(true);
  });

  it("outras chaves desconhecidas continuam recusadas", () => {
    expect(isValidDirPayload({ ...novoDirDTO(), fornecedorReal: "X" })).toBe(false);
    expect(isValidDirPatch({ fornecedorReal: "X" })).toBe(false);
  });
});
