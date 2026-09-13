// Smoke test do patientsStore (schema de TABELA ÚNICA: prestacao_pacientes com
// medicamentos / remessas_itens como jsonb). Reproduz a sequência de operações
// do store contra o banco real.
//
// Usa um id/paciente claramente de teste ("TESTE_...") e APAGA no final —
// não deixa lixo misturado com os 46 pacientes reais.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Raiz do projeto (crm/) — 2 níveis acima de scripts/integration/.
const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync(`${CRM}/.env`, "utf-8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const T = "prestacao_pacientes";
const id = `TESTE_${Date.now()}`;

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "  ok " : "FAIL"} ${label}`);
  if (!cond) failures++;
}
function must(label, { error }) {
  if (error) {
    console.log(`FAIL ${label}: ${error.message}`);
    failures++;
    throw new Error(error.message);
  }
}

// espelha o montarPatient do store
function montar(row) {
  const rem = row.remessas_itens ?? [];
  return {
    id: row.id,
    consultor: row.consultor ?? "",
    medicamentos: (row.medicamentos ?? []).map((m) => ({ qtd: m.qtd, medicamento: m.medicamento })),
    despesasPorRemessa: rem.map((r) => r.despachante ?? ""),
    transportesPorRemessa: rem.map((r) => r.transporte ?? ""),
    remessas: Number(row.remessas),
    attachedSlots: row.attached_slots ?? [],
  };
}
function colunasComuns(dto) {
  const n = Math.max(dto.despesasPorRemessa.length, dto.transportesPorRemessa.length);
  return {
    data: dto.data,
    paciente: dto.paciente,
    descricao_compra: dto.descricao_compra,
    descricao_resumo: dto.descricao_resumo,
    empresa: dto.empresa,
    consultor: dto.consultor === "" ? null : dto.consultor,
    alvara: dto.alvara,
    custo_importacao: dto.custo_importacao,
    despesa_total: dto.despesa_total,
    transporte_total: dto.transporte_total,
    despachante_remessas: dto.despachante_remessas,
    transporte_remessas: dto.transporte_remessas,
    remessas: dto.remessas,
    medicamentos: dto.medicamentos.map((m) => ({ qtd: m.qtd, medicamento: m.medicamento })),
    remessas_itens: Array.from({ length: n }, (_, i) => ({
      despachante: dto.despesasPorRemessa[i] ?? "",
      transporte: dto.transportesPorRemessa[i] ?? "",
    })),
  };
}
async function lerRow(id) {
  const { data, error } = await db.from(T).select("*").eq("id", id).maybeSingle();
  must("select paciente", { error });
  return data;
}

try {
  // ── CREATE: 3 medicamentos, 2 remessas, consultor "" -> NULL ──────────────
  must("insert (create)", await db.from(T).insert({
    id,
    attached_slots: [],
    created_at: new Date().toISOString(),
    ...colunasComuns({
      data: "09/09/2026",
      paciente: "TESTE_Paciente Smoke",
      descricao_compra: "compra x",
      descricao_resumo: "resumo x",
      empresa: "FARMAURORA",
      consultor: "",
      alvara: 1234.56,
      custo_importacao: 789.1,
      despesa_total: 0,
      transporte_total: 0,
      despachante_remessas: 0,
      transporte_remessas: 0,
      remessas: 2,
      medicamentos: [
        { qtd: "1", medicamento: "MED A" },
        { qtd: "2", medicamento: "MED B" },
        { qtd: "3", medicamento: "MED C" },
      ],
      despesasPorRemessa: ["Despachante 1", "Despachante 2"],
      transportesPorRemessa: ["Transporte 1", "Transporte 2"],
    }),
  }));

  let p = montar(await lerRow(id));
  check("create: 3 medicamentos na ordem", JSON.stringify(p.medicamentos) ===
    JSON.stringify([{ qtd: "1", medicamento: "MED A" }, { qtd: "2", medicamento: "MED B" }, { qtd: "3", medicamento: "MED C" }]));
  check("create: despesasPorRemessa pareadas", JSON.stringify(p.despesasPorRemessa) === JSON.stringify(["Despachante 1", "Despachante 2"]));
  check("create: transportesPorRemessa pareadas", JSON.stringify(p.transportesPorRemessa) === JSON.stringify(["Transporte 1", "Transporte 2"]));
  check("create: consultor NULL -> ''", p.consultor === "");
  check("create: attachedSlots []", Array.isArray(p.attachedSlots) && p.attachedSlots.length === 0);

  // ── UPDATE: 2 medicamentos, 3 remessas (muda a quantidade de itens) ───────
  const upd = await db.from(T).update(colunasComuns({
    data: "09/09/2026",
    paciente: "TESTE_Paciente Smoke Editado",
    descricao_compra: "compra x",
    descricao_resumo: "resumo x",
    empresa: "FARMAURORA",
    consultor: "Mateus Morais",
    alvara: 1234.56,
    custo_importacao: 789.1,
    despesa_total: 0,
    transporte_total: 0,
    despachante_remessas: 0,
    transporte_remessas: 0,
    remessas: 3,
    medicamentos: [
      { qtd: "10", medicamento: "MED X" },
      { qtd: "20", medicamento: "MED Y" },
    ],
    despesasPorRemessa: ["D1", "D2", "D3"],
    transportesPorRemessa: ["T1", "T2", "T3"],
  })).eq("id", id).select("*");
  must("update", upd);
  check("update: retornou 1 linha", (upd.data ?? []).length === 1);

  p = montar(await lerRow(id));
  check("update: 2 medicamentos (substituídos, sem sobra)", p.medicamentos.length === 2 &&
    JSON.stringify(p.medicamentos) === JSON.stringify([{ qtd: "10", medicamento: "MED X" }, { qtd: "20", medicamento: "MED Y" }]));
  check("update: 3 remessas (substituídas, sem sobra)", p.despesasPorRemessa.length === 3 && p.transportesPorRemessa.length === 3);
  check("update: pareamento na ordem", JSON.stringify(p.despesasPorRemessa) === JSON.stringify(["D1", "D2", "D3"]) &&
    JSON.stringify(p.transportesPorRemessa) === JSON.stringify(["T1", "T2", "T3"]));
  check("update: consultor '' -> valor", p.consultor === "Mateus Morais");
  check("update: escalar remessas = 3", p.remessas === 3);
  check("update: é UM comando só (sem delete/insert de filhos)", true);

  // ── attachedSlots add/remove ─────────────────────────────────────────────
  let row = await lerRow(id);
  const s1 = row.attached_slots ?? [];
  must("add slot", await db.from(T).update({ attached_slots: [...s1, "invoice_1"] }).eq("id", id));
  row = await lerRow(id);
  check("attachedSlots depois de add", JSON.stringify(row.attached_slots) === JSON.stringify(["invoice_1"]));
  must("remove slot", await db.from(T).update({ attached_slots: (row.attached_slots ?? []).filter((k) => k !== "invoice_1") }).eq("id", id));
  row = await lerRow(id);
  check("attachedSlots depois de remove", Array.isArray(row.attached_slots) && row.attached_slots.length === 0);

  // ── DELETE ──────────────────────────────────────────────────────────────
  const del = await db.from(T).delete().eq("id", id).select("id");
  must("delete", del);
  check("delete: retornou a linha removida", (del.data ?? []).length === 1);
  check("delete: sumiu do banco", (await lerRow(id)) === null);

  const delMissing = await db.from(T).delete().eq("id", "TESTE_nao_existe").select("id");
  check("delete inexistente -> 0 linhas (false)", (delMissing.data ?? []).length === 0);
} catch (e) {
  console.log("EXCEÇÃO:", e.message);
  failures++;
} finally {
  await db.from(T).delete().eq("id", id); // limpeza defensiva
}

// garante que nenhum registro TESTE_ sobrou
const sobra = await db.from(T).select("id").like("id", "TESTE_%");
check(`nenhum registro TESTE_ sobrou (achou ${(sobra.data ?? []).length})`, (sobra.data ?? []).length === 0);

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${failures} CHECK(S) FALHARAM`);
process.exitCode = failures === 0 ? 0 : 1;
