// services/ChatOrchestrator.ts

// Importando os modelos e seus tipos
import type { IEvent } from '../models/Event'; // 'import type' é ótimo para tipos
import ChatContext from '../models/ChatContext';

// Importando os outros serviços (como tipos)
import type EventSearchService from './EventSearchService';
import type IntentAnalysisService from './IntentAnalysisService';
import type CartManagerService from './CartManagerService';
import type SystemInfoService from './SystemInfoService';

// Importando tipos específicos de outros serviços
// (Assumindo que CartManagerService exporta estes tipos, como fizemos no passo anterior)
import type { IQuickReply, IChatCarrinhoItem, IRespostaServicoCarrinho } from './CartManagerService';
import type { IAnaliseResultado, IIntentParams } from './IntentAnalysisService';

// --- Interfaces para este Serviço ---

// O objeto de estado que vai para o frontend
interface IChatState {
    filtros: any;
    carrinho: IChatCarrinhoItem[];
    navegarPara?: string;
    [key: string]: any; // Permite outras propriedades do 'obterEstado()'
}

// A resposta final do orquestrador
export interface IResultadoChat {
    textoResposta: string;
    eventos: IEvent[];
    categorias: string[];
    showCommands: boolean;
    quickReplies: IQuickReply[];
    necessitaAI: boolean; // Indica se a IA (HuggingFace) deve processar a resposta
    state: IChatState;
}

// --- Fim das Interfaces ---

export default class ChatOrchestrator {
    // Propriedades tipadas e privadas
    private servicoEventos: EventSearchService;
    private servicoAnalise: IntentAnalysisService;
    private gerenciadorCarrinho: CartManagerService;
    private systemInfoService: SystemInfoService;

    constructor(
        servicoEventos: EventSearchService,
        servicoAnalise: IntentAnalysisService,
        gerenciadorCarrinho: CartManagerService,
        systemInfoService: SystemInfoService
    ) {
        this.servicoEventos = servicoEventos;
        this.servicoAnalise = servicoAnalise;
        this.gerenciadorCarrinho = gerenciadorCarrinho;
        this.systemInfoService = systemInfoService;
    }

    /**
     * Método público principal: Processa a mensagem e orquestra os serviços.
     */
    public async processarMensagem(mensagem: string, contextoUsuario: ChatContext): Promise<IResultadoChat> {
        console.log("🤖 [ORQUESTRADOR] Processando mensagem:", mensagem);

        const analiseIntencao: IAnaliseResultado = this.servicoAnalise.analisar(mensagem);
        console.log("🎯 [ORQUESTRADOR] Intenção detectada:", analiseIntencao.tipo);

        // Inicializa a resposta padrão
        let resultado: IResultadoChat = {
            textoResposta: "",
            eventos: [],
            categorias: [],
            showCommands: true,
            quickReplies: [],
            necessitaAI: true, // Por padrão, precisa de IA
            state: contextoUsuario.obterEstado() // Pega o estado ATUAL
        };

        const intencoesQueBuscamEventos = [
            'buscarEventos',
            'preco',
            'localizacao',
            'categorias',
            'outros'
        ];

        if (intencoesQueBuscamEventos.includes(analiseIntencao.tipo)) {
            console.log(`🔍 [ORQUESTRADOR] Intenção que busca eventos: ${analiseIntencao.tipo}`);

            switch (analiseIntencao.tipo) {
                case 'outra_plataforma':
                    resultado.textoResposta = "Desculpe, só posso ajudar com eventos e ingressos da plataforma NaVibe! 🎪\n\nPosso te mostrar os eventos incríveis que temos disponíveis aqui? 😊";
                    resultado.necessitaAI = false;
                    resultado.showCommands = false;
                    break;
                case 'ajuda_sistema':
                    const tipoAjuda = analiseIntencao.parametros.tipo || 'cadastro';
                    const respostaSistema = this.systemInfoService.gerarResposta(tipoAjuda);
                    if (respostaSistema) {
                        resultado.textoResposta = respostaSistema;
                        resultado.necessitaAI = false;
                        resultado.showCommands = true;
                    }
                    break;
                case 'fora_contexto':
                    resultado.textoResposta = "Desculpe, só consigo ajudar com eventos, ingressos e a plataforma NaVibe! 🎪\n\nPosso te ajudar a encontrar eventos incríveis ou tirar dúvidas sobre a plataforma? 😊";
                    resultado.necessitaAI = false;
                    resultado.showCommands = true;
                    resultado.quickReplies = this.gerarQuickRepliesPadrao();
                    break;
                case 'outros':
                    if (analiseIntencao.parametros.categoria) {
                        resultado.eventos = await this.servicoEventos.buscarPorCriterios({
                            categoria: analiseIntencao.parametros.categoria
                        });
                    }
                    break;
                case 'buscarEventos':
                    const filtros = {
                        ...contextoUsuario.filtrosAtivos,
                        ...analiseIntencao.parametros
                    };
                    resultado.eventos = await this.servicoEventos.buscarPorCriterios(filtros);
                    contextoUsuario.atualizarFiltros(analiseIntencao.parametros);
                    break;
                case 'preco':
                    if (analiseIntencao.parametros.valorEspecifico) {
                        resultado.eventos = await this.servicoEventos.buscarPorValorEspecifico(
                            analiseIntencao.parametros.valorEspecifico,
                            contextoUsuario.filtrosAtivos.localizacao
                        );
                    } else {
                        resultado.eventos = await this.servicoEventos.buscarEventosMaisBaratos(
                            3,
                            contextoUsuario.filtrosAtivos.localizacao
                        );
                    }
                    break;
                case 'localizacao':
                    contextoUsuario.atualizarFiltros({
                        localizacao: analiseIntencao.parametros.localizacao
                    });
                    resultado.eventos = await this.servicoEventos.buscarPorCriterios(
                        contextoUsuario.filtrosAtivos
                    );
                    break;
                case 'categorias':
                    resultado.categorias = await this.servicoEventos.obterCategoriasDisponiveis();
                    break;
            }
        } else {
            console.log(`💬 [ORQUESTRADOR] Intenção conversacional: ${analiseIntencao.tipo} - NÃO buscar eventos`);

            switch (analiseIntencao.tipo) {
                case 'navegacao':
                    if (analiseIntencao.parametros.destino) {
                        resultado.state.navegarPara = analiseIntencao.parametros.destino;
                        resultado.showCommands = false;
                    }
                    break;

                // Ações de Carrinho
                case 'verCarrinho':
                case 'limparCarrinho':
                case 'removerItemCarrinho':
                case 'finalizarCompra':
                    // Usamos 'IRespostaServicoCarrinho' para tipar o retorno
                    const resultadoCarrinho: IRespostaServicoCarrinho = this.gerenciadorCarrinho.processarAcaoCarrinho(
                        analiseIntencao.tipo,
                        analiseIntencao.parametros,
                        contextoUsuario.carrinho
                    );
                    
                    // Atualiza o contexto com o novo carrinho
                    contextoUsuario.carrinho = resultadoCarrinho.carrinho; 

                    if (resultadoCarrinho.navegarPara) {
                        resultado.state.navegarPara = resultadoCarrinho.navegarPara;
                    }
                    resultado.quickReplies = resultadoCarrinho.quickReplies;
                    break;
            }
        }

        console.log("📊 [ORQUESTRADOR] Dados coletados para AI:", {
            eventos: resultado.eventos.length,
            categorias: resultado.categorias?.length || 0,
            carrinho: contextoUsuario.carrinho.length
        });

        resultado.necessitaAI = true; // Confirma que a IA deve processar
        return this.finalizarResposta(resultado, contextoUsuario);
    }

    /**
     * Monta a resposta final, garantindo que o 'state' mais recente seja incluído.
     */
    private finalizarResposta(resultado: IResultadoChat, contextoUsuario: ChatContext): IResultadoChat {
        return {
            ...resultado,
            state: { // Garante que o estado (filtros, carrinho) está atualizado
                ...resultado.state,
                ...contextoUsuario.obterEstado() // Pega o estado MAIS ATUAL
            },
            quickReplies: resultado.quickReplies.length > 0
                ? resultado.quickReplies
                : this.gerarQuickRepliesPadrao()
        };
    }

    /**
     * Gera os quick replies padrão.
     */
    private gerarQuickRepliesPadrao(): IQuickReply[] {
        return [
            { text: "🎪 Ver eventos", action: "verEventos" },
            { text: "💰 Eventos baratos", action: "eventosBaratos" },
            { text: "🛒 Meu carrinho", action: "verCarrinho" },
            { text: "❓ Ajuda", action: "ajuda" }
        ];
    }
}