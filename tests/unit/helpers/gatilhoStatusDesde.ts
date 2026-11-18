// Espelho, em TypeScript, do gatilho follow_up_status_desde do banco (supabase/migrations/20261118212456_follow_up_status_desde.sql),
// para os testes de servidor que usam o FakeSupabase (que não roda gatilho): no INSERT, status_desde = coalesce(status_desde,
// created_at, now()); no UPDATE, now() quando o status NORMALIZADO muda. Não mexe em updated_at. O código da aplicação nunca
// grava status_desde — quem grava é este gatilho (no banco real, o do SQL).

const NORMALIZADO: Record<string, string> = {
  aguardando_inicio: "elaboracao_fornecedores",
  liberado_parcial: "desembaraco",
  outro: "desembaraco",
};
const coluna = (s: unknown): string => NORMALIZADO[String(s)] ?? String(s);

export function gatilhoStatusDesde(
  op: "insert" | "update",
  antiga: Record<string, unknown> | null,
  nova: Record<string, unknown>,
): void {
  if (op === "insert") {
    nova.status_desde = nova.status_desde ?? nova.created_at ?? new Date().toISOString();
  } else if (antiga && coluna(nova.status) !== coluna(antiga.status)) {
    nova.status_desde = new Date().toISOString();
  }
}
