import type { Recado } from "#shared/types/recado";

// Lógica pura de divisão de abas do mural de Recados (Todos/Recebidos/
// Enviados — "Meus", lembretes pessoais, é tabela à parte, ver
// useLembretesPessoais.ts). Extraída do composable pra ser testável sem
// contexto Nuxt, mesmo padrão de app/utils/prazoFornecedor.ts.
//
// GET /api/recados já devolve só o que o usuário pode ver (público + do
// próprio cargo + direcionado a ele + o que ele autorou — ver
// server/utils/recadosStore.ts listRecadosVisiveis). Aqui só falta:
// - remover o que o usuário já concluiu (concluir é individual e definitivo,
//   não é status do recado — ele continua existindo pros outros destinatários);
// - ordenar fixado primeiro, depois created_at desc;
// - separar Recebidos (não fui eu que criei) de Enviados (fui eu).

function porFixadoEData(a: Recado, b: Recado): number {
  if (a.fixadoPorMim !== b.fixadoPorMim) return a.fixadoPorMim ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

export interface RecadosDivididos {
  todos: Recado[];
  recebidos: Recado[];
  enviados: Recado[];
}

export function dividirRecados(recados: Recado[], meuId: string | null): RecadosDivididos {
  const todos = recados.filter((r) => !r.concluidoPorMim).sort(porFixadoEData);

  return {
    todos,
    recebidos: todos.filter((r) => r.autorId !== meuId),
    enviados: todos.filter((r) => r.autorId === meuId),
  };
}
