import { nextTick, ref, type Ref } from "vue";
import type { GrupoPagamento, LancamentoBanco, LoteBanco } from "#shared/types/Pagamento";
import { useExportarImagem } from "./useExportarImagem";
import { formatarDataLocalISO, sanitizeNomeArquivo } from "../utils/pagamentoExport";
import type GrupoPagamentoExportCard from "../components/pagamentos/cards/GrupoPagamentoExportCard.vue";
import type LoteBancoExportCard from "../components/pagamentos/cards/LoteBancoExportCard.vue";

// Gerador de foto (recibo em PNG) da página de Pagamentos (Round 9a, Passo 3) —
// extraído de app/pages/pagamentos.vue sem mudar nenhuma linha de lógica.
//
// O cartão de exportação é montado fora da tela e capturado. Fica montado após
// a captura (é invisível) — o próximo export só substitui.
export function useLoteExport(deps: {
  lotesBanco: Ref<LoteBanco[]>;
  lancamentosBanco: Ref<LancamentoBanco[]>;
}) {
  const { exportarParaImagem } = useExportarImagem();

  const exportGrupo = ref<GrupoPagamento | null>(null);
  const exportLote = ref<{ lote: LoteBanco; lancamentos: LancamentoBanco[] } | null>(null);
  // Momento do clique — os dois cards podem ficar montados (invisíveis) ao
  // mesmo tempo, então cada um guarda seu próprio "hoje".
  const dataExibicaoGrupo = ref<Date>(new Date());
  const dataExibicaoLote = ref<Date>(new Date());
  const grupoExportRef = ref<InstanceType<typeof GrupoPagamentoExportCard> | null>(null);
  const loteExportRef = ref<InstanceType<typeof LoteBancoExportCard> | null>(null);

  async function handleExportarGrupo(grupo: GrupoPagamento): Promise<void> {
    exportGrupo.value = grupo;
    dataExibicaoGrupo.value = new Date();
    await nextTick();
    const el = grupoExportRef.value?.$el as HTMLElement | undefined;
    if (!el) return;
    const tipo = sanitizeNomeArquivo(grupo.tipo);
    const nome = sanitizeNomeArquivo(grupo.nomeGrupo) || "sem-nome";
    const dataArquivo = formatarDataLocalISO(dataExibicaoGrupo.value);
    await exportarParaImagem(el, `pagamento-${tipo}-${nome}-${dataArquivo}.png`);
  }

  async function handleExportarLote(loteId: string): Promise<void> {
    const lote = deps.lotesBanco.value.find((l) => l.id === loteId);
    if (!lote) return;
    exportLote.value = {
      lote,
      lancamentos: deps.lancamentosBanco.value.filter((l) => l.loteId === loteId),
    };
    dataExibicaoLote.value = new Date();
    await nextTick();
    const el = loteExportRef.value?.$el as HTMLElement | undefined;
    if (!el) return;
    const dataArquivo = formatarDataLocalISO(dataExibicaoLote.value);
    await exportarParaImagem(el, `pagamento-banco-${sanitizeNomeArquivo(lote.moeda)}-${dataArquivo}.png`);
  }

  return {
    exportGrupo,
    exportLote,
    dataExibicaoGrupo,
    dataExibicaoLote,
    grupoExportRef,
    loteExportRef,
    handleExportarGrupo,
    handleExportarLote,
  };
}
