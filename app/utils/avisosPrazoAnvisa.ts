import type { Processo } from "#shared/types/processo";
import {
  avisoPrazoAnvisaDevido,
  montarTextoAvisoPrazoAnvisa,
  podeVerAvisoPrazoAnvisa,
  type UsuarioAvisoAnvisa,
} from "#shared/utils/avisoPrazoAnvisa";

// Itens do aviso "Prazo limite pra Manifestação da ANVISA" no sino (alerta DERIVADO, como Mandado e "Chegou?"):
// calculados a partir de Processo[], do usuário e do relógio. Função pura — `agora` vem de fora para testar.

export interface AvisoPrazoAnvisaSino {
  /** processoId|prazo — chave estável do item (e do "ciente" otimista). */
  chave: string;
  processoId: string;
  /** Prazo atual ("AAAA-MM-DD"): vai no corpo da ciência. */
  prazo: string;
  /** Primeiro dia útil depois do prazo ("AAAA-MM-DD"): desde quando o aviso vale. */
  diaAviso: string;
  responsavel: string;
  titulo: string;
  linhaProcesso: string;
  linhaPrazo: string;
}

/**
 * Avisos que o usuário vê agora (regra de quem vê: a do alerta de Mandado — administrador todos; operacional só os
 * seus; consultor e sócio nenhum). Mais antigos primeiro (dia do aviso; empate: paciente e pasta, depois id).
 */
export function calcularAvisosPrazoAnvisa(
  processos: readonly Processo[],
  usuario: UsuarioAvisoAnvisa,
  agora: Date,
): AvisoPrazoAnvisaSino[] {
  const avisos: AvisoPrazoAnvisaSino[] = [];
  for (const processo of processos) {
    if (!podeVerAvisoPrazoAnvisa(usuario, processo.responsavelOperacional)) continue;
    const devido = avisoPrazoAnvisaDevido(processo, agora);
    if (!devido.devido || !devido.prazo || !devido.diaAviso) continue;
    const texto = montarTextoAvisoPrazoAnvisa({ paciente: processo.paciente, pasta: processo.pasta, prazo: devido.prazo });
    avisos.push({
      chave: `${processo.id}|${devido.prazo}`,
      processoId: processo.id,
      prazo: devido.prazo,
      diaAviso: devido.diaAviso,
      responsavel: processo.responsavelOperacional ?? "",
      ...texto,
    });
  }
  return avisos.sort(
    (a, b) =>
      a.diaAviso.localeCompare(b.diaAviso) ||
      a.linhaProcesso.localeCompare(b.linhaProcesso, "pt-BR") ||
      a.processoId.localeCompare(b.processoId),
  );
}
