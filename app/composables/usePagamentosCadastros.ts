import { useState } from "#app";
import type { CadastrosPagamento } from "#shared/types/Pagamento";
import { apiFetch } from "../utils/apiFetch";

// Fornecedores, despachantes e transportadoras que a página de Pagamentos usa (selects, filtros e exportação), lidos dos
// Cadastros (Configurações → Cadastros) por GET /api/pagamentos/cadastros — ativos E inativos, cada um com `ativo`. Sem chave
// PIX (ela vem em /api/pagamentos/*-pix). Só leitura: Pagamentos não altera Cadastros.
// Estado em useState; preenchido só a partir de onMounted() (client-only), junto com o resto da página.

export function usePagamentosCadastros() {
  const cadastros = useState<CadastrosPagamento>("pagamentos-cadastros", () => ({
    fornecedores: [],
    despachantes: [],
    transportadoras: [],
  }));

  async function fetchCadastros(): Promise<void> {
    const recebido = await apiFetch<Partial<CadastrosPagamento>>(
      "/api/pagamentos/cadastros",
      undefined,
      "Falha ao carregar os cadastros de Pagamentos.",
    );
    // Sempre as três listas (uma resposta incompleta não pode quebrar a tela).
    cadastros.value = {
      fornecedores: recebido.fornecedores ?? [],
      despachantes: recebido.despachantes ?? [],
      transportadoras: recebido.transportadoras ?? [],
    };
  }

  return { cadastros, fetchCadastros };
}
