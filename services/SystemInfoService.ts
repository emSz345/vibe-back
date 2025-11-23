/**
 * Este serviço atua como o "banco de conhecimento" do chatbot, fornecendo informações
 * estruturadas e tutoriais sobre como utilizar as funcionalidades da plataforma NaVibe.
 * Centraliza todo o conteúdo de ajuda em um único local para fácil manutenção e consistência.
 */

// services/SystemInfoService.ts

// --- Interfaces para este Serviço ---

/**
 * INTERFACE IInfoItem - Define a estrutura de um item de informação do sistema
 * @prop titulo - Título descritivo do processo/tópico (com emojis para engajamento)
 * @prop passos - Array com os passos sequenciais para realizar a ação (formato numerado)
 * @prop observacoes - Array com dicas e informações adicionais importantes (com emojis)
 */
interface IInfoItem {
    titulo: string;
    passos: string[];
    observacoes: string[];
}

/**
 * INTERFACE IInfoSistema - Mapeia chaves para itens de informação
 * @prop [key: string] - Permite chaves dinâmicas como 'cadastro', 'login', etc.
 *                        Facilita a busca por tópicos específicos
 */
interface IInfoSistema {
    [key: string]: IInfoItem;
}

// --- Fim das Interfaces ---

/**
 * CLASSE SystemInfoService - Serviço para gerenciar informações do sistema
 * 
 * Responsabilidades:
 * - Armazenar informações estruturadas sobre funcionalidades da plataforma
 * - Fornecer dados formatados para respostas do chatbot
 * - Centralizar conteúdo de ajuda e tutoriais
 * - Garantir consistência nas informações fornecidas aos usuários
 */
export default class SystemInfoService {
    // Dicionário com todas as informações do sistema organizadas por tópico
    // Funciona como uma base de conhecimento interna para o chatbot
    private informacoesSistema: IInfoSistema;

    /**
     * CONSTRUTOR - Inicializa o serviço com todas as informações do sistema
     * Pré-carrega todos os tutoriais e informações de ajuda
     */
    constructor() {
        // Inicializa o dicionário com informações pré-definidas
        // Cada tópico representa uma funcionalidade principal da plataforma
        this.informacoesSistema = {
            // Tópico: Processo de cadastro na plataforma
            // Guia completo para novos usuários se registrarem
            cadastro: {
                titulo: "📝 Como se Cadastrar na NaVibe",
                passos: [
                    "1. Clique em 'Cadastrar' na página inicial",
                    "2. Preencha nome, e-mail e senha",
                    "3. Aceite os termos e políticas",
                    "4. Confirme seu e-mail no link que enviamos",
                    "5. Faça login e aproveite! 🎉"
                ],
                observacoes: [
                    "💡 Você pode usar login social com Google ou Facebook",
                    "🔒 Sua senha deve ter letras, números e caractere especial",
                    "📧 Não recebeu o e-mail? Verifique a caixa de spam"
                ]
            },
            // Tópico: Processo de login na plataforma
            // Instruções para acesso à conta existente
            login: {
                titulo: "🔑 Como Fazer Login",
                passos: [
                    "1. Clique em 'Login' na página inicial",
                    "2. Digite seu e-mail e senha",
                    "3. Ou use Google/Facebook para entrar rapidamente",
                    "4. Pronto! Você será redirecionado para a página inicial"
                ],
                observacoes: [
                    "🤔 Esqueceu a senha? Clique em 'Esqueci minha senha'",
                    "📱 Login social é mais rápido e seguro"
                ]
            },
            // Tópico: Recuperação de senha esquecida
            // Fluxo completo para recuperar acesso à conta
            recuperarSenha: {
                titulo: "🆘 Recuperação de Senha",
                passos: [
                    "1. Na tela de login, clique em 'Esqueci minha senha'",
                    "2. Digite o e-mail da sua conta",
                    "3. Clique no link que enviarmos por e-mail",
                    "4. Crie uma nova senha segura",
                    "5. Faça login com a nova senha"
                ],
                observacoes: [
                    "⏰ O link de recuperação expira em 1 hora",
                    "📧 Verifique sua caixa de spam se não receber"
                ]
            },
            // Tópico: Navegação por categorias de eventos
            // Como explorar e encontrar eventos de interesse
            categorias: {
                titulo: "🎵 Explorar Categorias",
                passos: [
                    "1. Acesse a página 'Categorias'",
                    "2. Escolha um estado para filtrar eventos",
                    "3. Veja todos os eventos disponíveis",
                    "4. Clique em um evento para ver detalhes"
                ],
                observacoes: [
                    "📍 Você pode filtrar por estado brasileiro",
                    "🔍 Use a busca para encontrar eventos específicos"
                ]
            },
            // Tópico: Gerenciamento do carrinho de compras
            // Processo de compra e finalização de pedidos
            carrinho: {
                titulo: "🛒 Gerenciar Carrinho",
                passos: [
                    "1. Adicione eventos ao carrinho",
                    "2. Acesse seu carrinho para revisar",
                    "3. Ajuste quantidades se necessário",
                    "4. Finalize a compra com Mercado Pago"
                ],
                observacoes: [
                    "💳 Pagamento 100% seguro via Mercado Pago",
                    "📧 Ingressos são enviados por e-mail após confirmação"
                ]
            }
        };
    }

    /**
     * MÉTODO obterInformacao - Busca informação específica por tipo
     * Interface principal para acessar conteúdo específico do sistema
     * 
     * @param tipo - Chave do tópico (ex: 'cadastro', 'login', 'recuperarSenha')
     * @returns Item de informação completo ou null se não encontrado
     * 
     * Exemplo de uso:
     * ```typescript
     * const infoCadastro = systemInfoService.obterInformacao('cadastro');
     * ```
     */
    public obterInformacao(tipo: string): IInfoItem | null {
        // Retorna o item correspondente ao tipo ou null se não existir
        // Uso de || null garante que sempre retorna IInfoItem | null
        return this.informacoesSistema[tipo] || null;
    }

    /**
     * MÉTODO gerarResposta - Formata informação em texto para resposta do chat
     * Transforma a informação estruturada em texto formatado para exibição ao usuário
     * 
     * @param tipo - Chave do tópico a ser formatado
     * @returns String formatada com título, passos e observações ou null se não encontrado
     * 
     * Formato da resposta:
     * **Título**
     * 
     * **Passo a passo:**
     * 1. Passo 1
     * 2. Passo 2
     * ...
     * 
     * **💡 Dicas importantes:**
     * • Dica 1
     * • Dica 2
     */
    public gerarResposta(tipo: string): string | null {
        // Busca a informação pelo tipo usando o método obterInformacao
        const info = this.obterInformacao(tipo);
        
        // Retorna null se o tipo não for encontrado
        if (!info) return null;

        // Inicia a construção da resposta com o título em negrito
        // Usa template string para formatação consistente
        let resposta = `**${info.titulo}**\n\n`;

        // Adiciona a seção de passo a passo
        resposta += "**Passo a passo:**\n";
        
        // Itera sobre cada passo e adiciona à resposta
        // Mantém a numeração original do array
        info.passos.forEach(passo => {
            resposta += `${passo}\n`; // Cada passo em uma nova linha
        });

        // Adiciona observações se existirem e não estiverem vazias
        if (info.observacoes && info.observacoes.length > 0) {
            resposta += "\n**💡 Dicas importantes:**\n";
            
            // Itera sobre cada observação/dica
            info.observacoes.forEach(obs => {
                resposta += `${obs}\n`; // Cada observação em uma nova linha
            });
        }

        // Retorna a string formatada pronta para exibição
        return resposta;
    }
}