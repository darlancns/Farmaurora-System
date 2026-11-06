import type { AtualizacaoProcesso, Processo } from "#shared/types/processo";

// Caminho ÚNICO de gravação das atualizações de um processo (adicionar, editar e excluir passam por
// aqui). Sem Vue/rede — as dependências entram por `deps` (ver useProcessos.ts) e o módulo é
// testável isoladamente (tests/unit/gravadorAtualizacoes.spec.ts).
//
// - FILA por processo: só uma gravação em voo por vez. Cada uma é calculada sobre a lista MAIS
//   RECENTE (lida só quando chega a vez dela), então duas adições rápidas nunca perdem a primeira.
// - Conferência de versão (optimistic locking): envia o `updatedAt` que o cliente viu, como string
//   opaca. Se o servidor responder conflito, recarrega o processo e rejeita com ConflitoVersaoError.

export const MENSAGEM_CONFLITO_VERSAO =
  "Este processo foi alterado por outra pessoa. Recarregamos, confira e tente de novo.";
export const MENSAGEM_LISTA_MUDOU =
  "A lista de atualizações mudou enquanto você editava. Confira e tente de novo.";
export const MENSAGEM_PROCESSO_AUSENTE = "Processo não encontrado. Recarregue a página.";

export class ConflitoVersaoError extends Error {
  constructor(message: string = MENSAGEM_CONFLITO_VERSAO) {
    super(message);
    this.name = "ConflitoVersaoError";
  }
}

// A operação não pôde ser aplicada à lista atual (índice fora, item diferente do visto, texto vazio).
export class AtualizacaoInaplicavelError extends Error {
  constructor(message: string = MENSAGEM_LISTA_MUDOU) {
    super(message);
    this.name = "AtualizacaoInaplicavelError";
  }
}

export type AlteracaoAtualizacoes = (atual: readonly AtualizacaoProcesso[]) => AtualizacaoProcesso[] | null;

export interface DependenciasGravador {
  // Processo como está AGORA no estado local (lido na hora de gravar, nunca antes).
  obter: (id: string) => Processo | undefined;
  // Envia o PATCH. Deve lançar ConflitoVersaoError quando o servidor responder 409.
  enviar: (id: string, atualizacoes: AtualizacaoProcesso[], versao: string) => Promise<Processo>;
  // Grava no estado local o processo devolvido pelo servidor.
  aplicar: (processo: Processo) => void;
  // Recarrega um processo do servidor para o estado local (após um conflito).
  recarregar: (id: string) => Promise<void>;
}

// `filas` é injetável: o chamador que recria o gravador a cada uso (ex.: um composable chamado por
// vários componentes) passa o MESMO Map de módulo, para a fila por processo ser única no app.
export function criarGravadorAtualizacoes(
  deps: DependenciasGravador,
  filas: Map<string, Promise<unknown>> = new Map(),
) {
  async function executar(id: string, alterar: AlteracaoAtualizacoes): Promise<Processo> {
    const atual = deps.obter(id);
    if (!atual) throw new Error(MENSAGEM_PROCESSO_AUSENTE);

    const nova = alterar(atual.atualizacoes);
    if (!nova) throw new AtualizacaoInaplicavelError();

    try {
      const atualizado = await deps.enviar(id, nova, atual.updatedAt);
      deps.aplicar(atualizado);
      return atualizado;
    } catch (e) {
      if (e instanceof ConflitoVersaoError) {
        await deps.recarregar(id).catch(() => undefined);
      }
      throw e;
    }
  }

  return function gravar(id: string, alterar: AlteracaoAtualizacoes): Promise<Processo> {
    const anterior = filas.get(id) ?? Promise.resolve();
    const tarefa = anterior.catch(() => undefined).then(() => executar(id, alterar));
    filas.set(id, tarefa);
    const limpar = (): void => {
      if (filas.get(id) === tarefa) filas.delete(id);
    };
    tarefa.then(limpar, limpar);
    return tarefa;
  };
}
