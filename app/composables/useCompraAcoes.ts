import type { MedicamentoDoCadastro, PaginaMedicamentos, RespostaPreCadastro, RespostaTemperatura } from "#shared/types/compra";
import type { CompraOpcoes } from "./useCompraOpcoes";
import { ApiError } from "../utils/apiFetch";
import { readApiError } from "../utils/errorMessages";
import type { OpcaoBusca } from "../components/AppSearchSelect.vue";
import type { AcoesCompra, ResultadoPreCadastro, ResultadoTemperatura } from "../utils/comprasContexto";

// As ações do formulário que falam com o servidor: busca de medicamentos, pré-cadastro e temperatura nova. Usa fetch direto (e não
// apiFetch) porque o 409 do pré-cadastro traz o medicamento do Cadastro no corpo (`data.medicamento`) e o 409 da temperatura
// (inativa) precisa ser distinguido de um erro qualquer.

const JSON_HEADERS = { "Content-Type": "application/json" };
export const LIMITE_BUSCA_MEDICAMENTOS = 20;

export interface OpcoesAcoes {
  opcoes: CompraOpcoes;
  /** O id da compra aberta (o pré-cadastro guarda a origem). */
  compraId: () => string | null;
  avisar: (mensagem: string) => void;
  /** fetch injetável (testes). */
  buscarRede?: typeof fetch;
}

export function useCompraAcoes(config: OpcoesAcoes): AcoesCompra {
  const rede = (): typeof fetch => config.buscarRede ?? fetch;

  async function buscarMedicamentos(q: string, sinal: AbortSignal): Promise<OpcaoBusca[]> {
    // A rota LEVE (só medicamentos): a rota geral devolve todas as listas e fica para a carga inicial.
    const url = `/api/compras/opcoes/medicamentos?${new URLSearchParams({ q, limite: String(LIMITE_BUSCA_MEDICAMENTOS) }).toString()}`;
    const res = await rede()(url, { signal: sinal });
    if (!res.ok) throw new ApiError(await readApiError(res, "Não foi possível buscar."), res.status);
    const corpo = (await res.json()) as PaginaMedicamentos;
    return corpo.itens.map((m) => ({ valor: m.id, rotulo: m.nome, extra: { temperatura: m.temperatura } }));
  }

  async function registrarTemperatura(nome: string): Promise<ResultadoTemperatura> {
    const res = await rede()("/api/compras/temperaturas", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ nome }) });
    if (res.status === 409) return { tipo: "inativa" }; // existe, mas desativada: quem decide é quem administra os Cadastros
    if (!res.ok) throw new ApiError(await readApiError(res, "Não foi possível adicionar a temperatura."), res.status);
    const corpo = (await res.json()) as RespostaTemperatura;
    // A lista de temperaturas é de TODAS as linhas: a nova entra nela (em ordem alfabética) e passa a aparecer em todas.
    const atual = config.opcoes.opcoes.value;
    if (atual && !atual.temperaturas.some((t) => t.nome === corpo.item.nome)) {
      const temperaturas = [...atual.temperaturas, { nome: corpo.item.nome }].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      config.opcoes.opcoes.value = { ...atual, temperaturas };
    }
    return { tipo: corpo.criada ? "criada" : "existente", nome: corpo.item.nome };
  }

  async function pedirPreCadastro(nome: string, temperatura: string): Promise<ResultadoPreCadastro> {
    const corpo: { nome: string; temperatura: string; compraId?: string } = { nome, temperatura };
    const compraId = config.compraId();
    if (compraId) corpo.compraId = compraId;
    const res = await rede()("/api/compras/pre-cadastro-medicamentos", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(corpo) });
    if (res.status === 409) {
      // O medicamento já existe no Cadastro: a tela passa a usar o cadastrado.
      const erro = (await res.json().catch(() => ({}))) as { data?: { medicamento?: MedicamentoDoCadastro }; statusMessage?: string };
      const m = erro.data?.medicamento;
      if (m) return { tipo: "cadastrado", medicamento: { id: m.id, nome: m.nome, temperatura: m.temperatura } };
      throw new ApiError(erro.statusMessage ?? "Não foi possível registrar no pré-cadastro.", 409);
    }
    if (!res.ok) throw new ApiError(await readApiError(res, "Não foi possível registrar no pré-cadastro."), res.status);
    const ok = (await res.json()) as RespostaPreCadastro;
    return { tipo: "pre-cadastro", id: ok.preCadastro.id };
  }

  return { buscarMedicamentos, registrarTemperatura, pedirPreCadastro, avisar: config.avisar };
}
