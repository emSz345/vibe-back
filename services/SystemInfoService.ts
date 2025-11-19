// services/SystemInfoService.ts

// --- Interfaces para este Serviço ---

interface IInfoItem {
    titulo: string;
    passos: string[];
    observacoes: string[];
}

interface IInfoSistema {
    // Permite chaves como 'cadastro', 'login', etc.
    [key: string]: IInfoItem;
}

// --- Fim das Interfaces ---

export default class SystemInfoService {
    private informacoesSistema: IInfoSistema;

    constructor() {
        this.informacoesSistema = {
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

    public obterInformacao(tipo: string): IInfoItem | null {
        return this.informacoesSistema[tipo] || null;
    }

    public gerarResposta(tipo: string): string | null {
        const info = this.obterInformacao(tipo);
        if (!info) return null;

        let resposta = `**${info.titulo}**\n\n`;

        resposta += "**Passo a passo:**\n";
        info.passos.forEach(passo => {
            resposta += `${passo}\n`;
        });

        if (info.observacoes && info.observacoes.length > 0) {
            resposta += "\n**💡 Dicas importantes:**\n";
            info.observacoes.forEach(obs => {
                resposta += `${obs}\n`;
            });
        }

        return resposta;
    }
}