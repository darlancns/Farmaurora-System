// OBSOLETO desde 08/11/2026: a coluna public.follow_up.codigo_rastreio foi removida (rastreio
// virou numero_awb). Este script depende dela e falharia se rodado de novo. Mantido só como
// registro histórico da carga de 11/2026. Não rodar.

// Plano da recarga definitiva do Follow-Up (2026-11-05): fonte nova + backup do banco → o que
// permanece / é novo / é apagado, flags de alerta e linhas prontas para a carga.
//
// PURO: sem rede, sem Supabase, sem escrita em disco. Quem lê o backup/escreve arquivos são
// dry-run-follow-up-2026-11.mjs e gerar-carga-follow-up-2026-11.mjs.

import { parseFollowUpSource } from "./followUpParser.mjs";
import { idCarga, registroParaLinha } from "./followUpRows.mjs";

/** Processos demo: nunca entram na comparação, nunca são apagados, nunca são reinseridos. */
export const PASTAS_DEMO = ["2026 - 901", "2026 - 902", "2026 - 903", "2026 - 904"];

/** Chave de um processo: pasta + ordem ("" quando não há ordem). */
export const chaveDe = (pasta, ordem) => `${pasta}|${ordem ?? ""}`;

/** Regra da migration 20261028: desembaraço + registro de LPCO + texto mencionando "mandado". */
export function regraMandadoNovo(rec) {
  if (rec.status !== "desembaraco") return false;
  if (!String(rec.datas?.registroLpco ?? "").trim()) return false;
  return (rec.atualizacoes ?? []).some((a) => /mandado/i.test(a.texto ?? ""));
}

const limpaLinha = (l) => l.trim().replace(/^\*+\s*/, "").replace(/\s*\*+$/, "");

/** Nº da linha do Doc de uma linha do corpo da entrada (texto já limpo como o parser limpa). */
export function linhaNoDoc(entrada, texto) {
  const i = entrada.corpo.findIndex((l) => limpaLinha(l) === texto || l.trim() === texto);
  return i < 0 ? null : entrada.linha + 1 + i;
}

export function montarPlano({ texto, backup, ms, agora }) {
  const parsed = parseFollowUpSource(texto);
  const entradas = parsed.entradas;
  const itens = entradas.filter((e) => e.record);
  const puladas = entradas.filter((e) => !e.record);

  const reais = backup.filter((r) => !PASTAS_DEMO.includes(r.pasta));
  const demo = backup.filter((r) => PASTAS_DEMO.includes(r.pasta));
  const dbPorChave = new Map(reais.map((r) => [chaveDe(r.pasta, r.ordem), r]));

  const docChaves = new Map();
  const duplicadas = [];
  for (const e of itens) {
    const k = chaveDe(e.record.pasta, e.record.ordem);
    if (docChaves.has(k)) duplicadas.push(k);
    docChaves.set(k, e);
  }

  const permanecem = [];
  const novos = [];
  for (const e of itens) {
    const k = chaveDe(e.record.pasta, e.record.ordem);
    (dbPorChave.has(k) ? permanecem : novos).push(e);
  }
  const apagados = reais.filter((r) => !docChaves.has(chaveDe(r.pasta, r.ordem)));

  // Flags: quem permanece mantém as marcas do banco; novos: fornecedor=false, mandado pela regra.
  const flagsDe = (e) => {
    const db = dbPorChave.get(chaveDe(e.record.pasta, e.record.ordem));
    if (db) return { fornecedor: db.alerta_fornecedor_resolvido === true, mandado: db.alerta_mandado_resolvido === true, origem: "banco" };
    return { fornecedor: false, mandado: regraMandadoNovo(e.record), origem: "regra (novo)" };
  };

  const linhas = itens.map((e, i) =>
    registroParaLinha(e.record, { id: idCarga(ms, i), agora, flags: flagsDe(e) }),
  );

  const flagsReais = reais
    .filter((r) => r.alerta_fornecedor_resolvido || r.alerta_mandado_resolvido)
    .map((r) => ({
      pasta: r.pasta,
      ordem: r.ordem ?? "",
      paciente: r.paciente,
      fornecedor: r.alerta_fornecedor_resolvido === true,
      mandado: r.alerta_mandado_resolvido === true,
      permanece: docChaves.has(chaveDe(r.pasta, r.ordem)),
    }));

  return { parsed, entradas, itens, puladas, reais, demo, permanecem, novos, apagados, duplicadas, linhas, flagsDe, flagsReais, dbPorChave };
}
