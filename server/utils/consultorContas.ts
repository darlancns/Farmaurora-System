import type { User } from "@supabase/supabase-js";
import type { ResultadoContasConsultor } from "../../shared/types/Cadastro";
import { listAllAuthUsers } from "./authUser";
import { createSupabaseAdminClient } from "./supabaseServerClient";

// Contas de login ligadas a um consultor: `app_metadata.consultorNome` guarda o NOME do consultor (texto). Renomear um consultor
// no Cadastro precisa trocar esse texto nas contas que tinham o nome antigo. O Auth não entra na transação do banco, então isto
// roda DEPOIS da função SQL e é IDEMPOTENTE: só mexe nas contas que ainda têm o nome antigo (rodar de novo não faz nada de mais).
// Nada de dados de pacientes aqui; os logs trazem só o id da conta.

function consultorNomeDaConta(user: User): string | undefined {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  return typeof meta.consultorNome === "string" ? meta.consultorNome.trim() : undefined;
}

/** Quantas contas têm exatamente este consultor (só leitura). */
export async function contarContasDoConsultor(nome: string): Promise<number> {
  const contas = await listAllAuthUsers(createSupabaseAdminClient());
  return contas.filter((u) => consultorNomeDaConta(u) === nome).length;
}

/**
 * Troca `app_metadata.consultorNome` das contas que têm `nomeAntigo` por `nomeNovo`, preservando o resto do app_metadata (cargo,
 * nome, permissões). Uma conta que falha não impede as outras: volta em `falhas` (id e e-mail) para a tela mostrar e permitir tentar
 * de novo. Nome antigo igual ao novo não faz nada.
 */
export async function sincronizarContasDoConsultor(nomeAntigo: string, nomeNovo: string): Promise<ResultadoContasConsultor> {
  if (nomeAntigo === nomeNovo) return { atualizadas: 0, falhas: [] };

  const admin = createSupabaseAdminClient();
  const contas = (await listAllAuthUsers(admin)).filter((u) => consultorNomeDaConta(u) === nomeAntigo);

  let atualizadas = 0;
  const falhas: ResultadoContasConsultor["falhas"] = [];
  for (const conta of contas) {
    const meta = (conta.app_metadata ?? {}) as Record<string, unknown>;
    try {
      const { error } = await admin.auth.admin.updateUserById(conta.id, { app_metadata: { ...meta, consultorNome: nomeNovo } });
      if (error) throw error;
      atualizadas += 1;
    } catch {
      console.error(`[consultores] não foi possível atualizar o consultor da conta ${conta.id}`);
      falhas.push({ id: conta.id, email: conta.email ?? "" });
    }
  }
  return { atualizadas, falhas };
}
