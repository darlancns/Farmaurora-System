import type { APIRequestContext } from "@playwright/test";

// O consultor (vendedor) de um PO novo da DIR precisa ser um consultor ATIVO do Cadastro (lista "consultores"). No
// Supabase falso local a tabela `cadastro_consultores` nasce vazia (migration 20261118210000_cadastro_consultores.sql, sem a
// carga), então os e2e que criam PO garantem este consultor de TESTE antes. Só o administrador grava o Cadastro: para outro
// cargo as chamadas levam 403 e são ignoradas (aí o consultor precisa já existir no banco local).
export const CONSULTOR_E2E = "Mateus Morais";

export async function garantirConsultorAtivo(request: APIRequestContext, nome: string = CONSULTOR_E2E): Promise<void> {
  const criado = await request.post("/api/cadastros/consultores", { data: { nome } });
  if (criado.status() !== 409) return; // 200 (criado) ou 403 (sem permissão de escrita)
  // Já existe: se estiver inativo, reativa.
  const itens = (await (await request.get("/api/cadastros/consultores")).json()) as Array<{ id: string; nome: string; ativo: boolean }>;
  const item = itens.find((i) => i.nome === nome);
  if (item && !item.ativo) await request.patch(`/api/cadastros/consultores/${item.id}`, { data: { ativo: true } });
}
