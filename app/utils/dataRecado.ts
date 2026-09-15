// Formatação de data de Recado/LembretePessoal, compartilhada entre
// RecadoCard e LembreteCard — "Hoje" no dia da criação (comparação por
// ano/mês/dia local, mesmo fuso usado por toLocaleDateString), senão
// dd/mm/aaaa normal.
export function formatarDataRecado(isoCreatedAt: string): string {
  const data = new Date(isoCreatedAt);
  const hoje = new Date();

  const mesmoDia =
    data.getFullYear() === hoje.getFullYear() && data.getMonth() === hoje.getMonth() && data.getDate() === hoje.getDate();

  if (mesmoDia) return "Hoje";
  return data.toLocaleDateString("pt-BR");
}
