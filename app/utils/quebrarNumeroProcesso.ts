// Parte um nº de processo em trechos que terminam em ponto, barra ou traço —
// os únicos lugares onde a quebra de linha é legível. Em mobile o detalhe põe um
// <wbr> entre os trechos (um traço seguido de dígito não é ponto de quebra nativo,
// então "25BR…-2/2026-ADM/0001.2345" não quebraria em lugar nenhum sem isso).
export function quebrarNumeroProcesso(valor: string): string[] {
  return valor.match(/[^./-]*[./-]|[^./-]+$/g) ?? [valor];
}
