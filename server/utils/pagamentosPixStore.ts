import { createError } from "h3";
import {
  DESPACHANTE_PIX_PADRAO,
  DESPACHANTES_PAGAMENTO,
  GRUPO_PAGAMENTO_CONFIG,
  TRANSPORTADORA_PIX_PADRAO,
  TRANSPORTADORAS_PAGAMENTO,
} from "../../shared/constants/pagamentos";
import type { GrupoPagamento } from "../../shared/types/Pagamento";
import { createSupabaseAdminClient } from "./supabaseServerClient";

/**
 * Chave PIX por despachante / transportadora — persistência no Supabase
 * (tabela `pagamento_pix_chaves`, PK composta `(tipo, nome)`).
 *
 * A tabela guarda só os *overrides* do usuário; o valor efetivo é sempre
 * padrão (constante) + override. As 4 funções públicas são importadas
 * diretamente deste arquivo pelos endpoints (não são reexportadas por
 * `pagamentosStore.ts`).
 *
 * Os arquivos `data/pagamentos-*-pix.json` continuam no disco como backup da
 * migração one-time, mas não são mais lidos nem escritos por este módulo.
 */

const T_PIX = "pagamento_pix_chaves";

interface PixConfig {
  tipo: GrupoPagamento["tipo"];
  nomes: readonly string[];
  padrao: Record<string, string>;
}

const PIX_DESPACHANTE: PixConfig = {
  tipo: "DESPACHANTE",
  nomes: DESPACHANTES_PAGAMENTO,
  padrao: DESPACHANTE_PIX_PADRAO,
};
const PIX_TRANSPORTADORA: PixConfig = {
  tipo: "TRANSPORTADORA",
  nomes: TRANSPORTADORAS_PAGAMENTO,
  padrao: TRANSPORTADORA_PIX_PADRAO,
};

interface PixRow {
  nome: string;
  chave_pix: string;
}

async function readPixOverrides(tipo: GrupoPagamento["tipo"]): Promise<Record<string, string>> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(T_PIX).select("nome, chave_pix").eq("tipo", tipo);
  if (error) throw new Error(`Supabase: falha ao listar chaves PIX — ${error.message}`);
  const overrides: Record<string, string> = {};
  for (const row of (data ?? []) as PixRow[]) {
    if (typeof row.chave_pix === "string" && row.chave_pix) overrides[row.nome] = row.chave_pix;
  }
  return overrides;
}

async function getPixEfetivo(cfg: PixConfig): Promise<Record<string, string>> {
  const overrides = await readPixOverrides(cfg.tipo);
  const efetivo: Record<string, string> = { ...cfg.padrao };
  for (const nome of cfg.nomes) {
    if (typeof overrides[nome] === "string" && overrides[nome]) efetivo[nome] = overrides[nome] as string;
  }
  return efetivo;
}

async function salvarPix(cfg: PixConfig, nome: string, chavePix: string): Promise<Record<string, string>> {
  if (!cfg.nomes.includes(nome)) {
    throw createError({ statusCode: 400, statusMessage: "Nome desconhecido." });
  }
  const chave = chavePix.trim();
  if (!chave) {
    throw createError({ statusCode: 400, statusMessage: "Chave PIX vazia." });
  }
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from(T_PIX)
    .upsert(
      { tipo: cfg.tipo, nome, chave_pix: chave, updated_at: new Date().toISOString() },
      { onConflict: "tipo,nome" },
    );
  if (error) throw new Error(`Supabase: falha ao salvar chave PIX — ${error.message}`);
  return await getPixEfetivo(cfg);
}

export const getDespachantePix = () => getPixEfetivo(PIX_DESPACHANTE);
export const salvarDespachantePix = (nome: string, chave: string) => salvarPix(PIX_DESPACHANTE, nome, chave);
export const getTransportadoraPix = () => getPixEfetivo(PIX_TRANSPORTADORA);
export const salvarTransportadoraPix = (nome: string, chave: string) => salvarPix(PIX_TRANSPORTADORA, nome, chave);

export function isNomeConhecido(tipo: GrupoPagamento["tipo"], nome: string): boolean {
  return GRUPO_PAGAMENTO_CONFIG[tipo].nomes.includes(nome);
}
