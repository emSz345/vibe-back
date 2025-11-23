// services/ChatOrchestrator.ts

/**
 Este serviço atua como o "cérebro" do sistema de chatbot, coordenando todos os componentes
 de processamento de mensagens e decidindo o fluxo da conversa.
*/ 


import ChatContext from '../models/ChatContext';
import type IntentAnalysisService from './IntentAnalysisService';
import type SystemInfoService from './SystemInfoService';


/**
 * INTERFACE IResultadoChat - Define a estrutura da resposta do chat
 * @prop textoResposta - Resposta textual para o usuário
 * @prop showCommands - Se deve mostrar comandos disponíveis
 * @prop quickReplies - Respostas rápidas sugeridas
 * @prop necessitaAI - Se a mensagem precisa processamento por IA
 * @prop state - Estado atual da conversa
 */
export interface IResultadoChat {
    textoResposta: string;
    showCommands: boolean;
    necessitaAI: boolean;
    state: any;
}


/**
 * CLASSE ChatOrchestrator - Orquestra o processamento de mensagens
 * 
 * Responsabilidades:
 * - Coordenar análise de intenção
 * - Gerenciar contexto da conversa
 * - Decidir fluxo de resposta
 */
export default class ChatOrchestrator {
    private servicoAnalise: IntentAnalysisService;
    private systemInfoService: SystemInfoService;

    constructor(
        servicoAnalise: IntentAnalysisService,
        systemInfoService: SystemInfoService
    ) {
        this.servicoAnalise = servicoAnalise;
        this.systemInfoService = systemInfoService;
    }

    /**
     * MÉTODO processarMensagem - Processa mensagem do usuário
     * @param mensagem - Texto enviado pelo usuário
     * @param contextoUsuario - Contexto atual da conversa
     * @returns Resultado processado do chat
     */
    public async processarMensagem(mensagem: string, contextoUsuario: ChatContext): Promise<IResultadoChat> {
        console.log("🤖 [ORQUESTRADOR] Processando mensagem:", mensagem);

        // Estrutura base da resposta
        const resultado: IResultadoChat = {
            textoResposta: "",
            showCommands: true,
            
            necessitaAI: true,
            state: contextoUsuario.obterEstado()
        };

        // TODO: Implementar lógica de processamento baseada na intenção
        // Por enquanto, sempre usa IA e replies padrão
        resultado.necessitaAI = true;
        return resultado;
    }

}