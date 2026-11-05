import type { Notificacao } from "#shared/types/notificacao";
import { rotaParaProcesso, type RotaProcesso } from "./processoFoco";
import { rotaParaRecado, type RotaRecados } from "./recadoFoco";
import type { NotificacaoFornecedor } from "./prazoFornecedor";
import type { NotificacaoMandado } from "./prazoMandado";

export interface DependenciasSino {
  navegar: (rota: RotaProcesso | RotaRecados) => unknown;
  fecharPainel: () => void;
  resolverFornecedor: (notificacao: NotificacaoFornecedor) => Promise<void>;
  resolverMandado: (notificacao: NotificacaoMandado) => Promise<void>;
  // Marca a notificação de recado como lida (quem chama trata o erro/toast).
  marcarRecadoLido: (notificacao: Notificacao) => Promise<void>;
}

// Ações dos itens do sino (Fornecedor, Mandado e Recados), sem DOM nem router — pra testar o
// comportamento do clique. UM ÚNICO ponto de navegação (`irPara`): fecha o sino e navega.
//
// - Texto de um alerta de processo (Fornecedor/Mandado) -> /processos?processo=<id>.
// - Item de recado -> /recados?recado=<recado_id> (sem query se o recado foi apagado) e marca lido;
//   a navegação acontece ANTES, então uma falha ao marcar lido nunca impede de abrir a página.
// - Check de resolver (Fornecedor/Mandado): só resolve — nunca navega nem fecha o sino, e corta a
//   propagação do clique, por garantia.
export function criarAcoesSino(deps: DependenciasSino) {
  function irPara(rota: RotaProcesso | RotaRecados): void {
    deps.fecharPainel();
    deps.navegar(rota);
  }

  function abrirProcesso(alerta: { processoId: string }): void {
    irPara(rotaParaProcesso(alerta.processoId));
  }

  function abrirRecado(notificacao: Notificacao): Promise<void> {
    irPara(rotaParaRecado(notificacao.recadoId));
    return deps.marcarRecadoLido(notificacao);
  }

  function resolverSemNavegar<T>(
    resolver: (alerta: T) => Promise<void>,
    alerta: T,
    evento?: { stopPropagation: () => void },
  ): Promise<void> {
    evento?.stopPropagation();
    return resolver(alerta);
  }

  return {
    abrirProcesso,
    abrirRecado,
    resolverFornecedor: (alerta: NotificacaoFornecedor, evento?: { stopPropagation: () => void }) =>
      resolverSemNavegar(deps.resolverFornecedor, alerta, evento),
    resolverMandado: (alerta: NotificacaoMandado, evento?: { stopPropagation: () => void }) =>
      resolverSemNavegar(deps.resolverMandado, alerta, evento),
  };
}
