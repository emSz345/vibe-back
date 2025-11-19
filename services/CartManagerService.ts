// services/CartManagerService.ts

// --- Interfaces para este Serviço ---

export interface IQuickReply {
    text: string;
    action: string;
}

// Representa um item de carrinho NO CONTEXTO DO CHAT
// (Pode ser diferente do model do Mongoose)
export interface IChatCarrinhoItem {
    id: string;
    idEvento: string;
    nomeEvento: string;
    dataEvento: string;
    preco: number;
    quantidade: number;
    adicionadoEm: Date;
}

// O que este serviço retorna para o Orquestrador
export interface IRespostaServicoCarrinho {
    textoResposta: string;
    carrinho: IChatCarrinhoItem[];
    quickReplies: IQuickReply[];
    navegarPara?: string; // Opcional
}

// Parâmetros que a ação pode receber
interface IParametrosAcao {
    itemIndex?: number;
    quantidade?: number;
    [key: string]: any; // Permite outras propriedades
}

// --- Fim das Interfaces ---

export default class CartManagerService {
    public quickRepliesPadrao: IQuickReply[];

    constructor() {
        this.quickRepliesPadrao = [
            { text: "🎪 Ver eventos", action: "verEventos" },
            { text: "🛒 Meu carrinho", action: "verCarrinho" }
        ];
    }

    public processarAcaoCarrinho(
        acao: string, 
        parametros: IParametrosAcao, 
        carrinhoAtual: IChatCarrinhoItem[] = []
    ): IRespostaServicoCarrinho {
        
        let novoCarrinho = [...carrinhoAtual];

        switch (acao) {
            case 'verCarrinho':
                return this.processarVisualizacaoCarrinho(novoCarrinho);
            
            case 'limparCarrinho':
                return this.processarLimpezaCarrinho();
            
            case 'removerItemCarrinho':
                // O '!' (Non-null assertion) diz ao TS "confie em mim, itemIndex não será nulo aqui"
                return this.processarRemocaoItem(parametros.itemIndex!, novoCarrinho);
            
            case 'finalizarCompra':
                return this.processarFinalizacaoCompra(novoCarrinho);
            
            case 'adicionarCarrinho':
                return this.processarAdicaoItem(parametros, novoCarrinho);
            
            default:
                return this.respostaPadrao(novoCarrinho);
        }
    }

    public processarVisualizacaoCarrinho(carrinho: IChatCarrinhoItem[]): IRespostaServicoCarrinho {
        if (carrinho.length === 0) {
            return {
                textoResposta: "🛒 Seu carrinho está vazio! Que tal explorar alguns eventos? 🎪",
                carrinho: carrinho,
                quickReplies: [{ text: "🎪 Ver eventos", action: "verEventos" }]
            };
        }

        const total = this.calcularTotalCarrinho(carrinho);
        
        let textoResposta = "🛒 **Seu Carrinho:**\\n\\n";
        carrinho.forEach((item, index) => {
            textoResposta += `${index + 1}. **${item.nomeEvento}**\\n`;
            textoResposta += `   📅 ${item.dataEvento}\\n`;
            textoResposta += `   🎫 ${item.quantidade}x R$ ${item.preco.toFixed(2)}\\n`;
            textoResposta += `   💰 Subtotal: R$ ${(item.preco * item.quantidade).toFixed(2)}\\n\\n`;
        });
        textoResposta += `**💰 TOTAL: R$ ${total.toFixed(2)}**`;
        
        return {
            textoResposta: textoResposta,
            carrinho: carrinho,
            quickReplies: [
                { text: "🗑️ Remover item", action: "removerItem" },
                { text: "🧹 Limpar carrinho", action: "limparCarrinho" },
                { text: "✅ Finalizar compra", action: "finalizarCompra" }
            ]
        };
    }

    public processarLimpezaCarrinho(): IRespostaServicoCarrinho {
        return {
            textoResposta: "🧹 Carrinho limpo com sucesso! Todos os itens foram removidos.",
            carrinho: [],
            quickReplies: [{ text: "🎪 Ver eventos", action: "verEventos" }]
        };
    }

    public processarRemocaoItem(itemIndex: number, carrinho: IChatCarrinhoItem[]): IRespostaServicoCarrinho {
        if (itemIndex >= 0 && itemIndex < carrinho.length) {
            const itemRemovido = carrinho[itemIndex];
            carrinho.splice(itemIndex, 1);
            
            return {
                textoResposta: `🗑️ "${itemRemovido.nomeEvento}" removido do carrinho!`,
                carrinho: carrinho,
                quickReplies: [
                    { text: "🛒 Ver carrinho", action: "verCarrinho" },
                    { text: "🎪 Continuar comprando", action: "verEventos" }
                ]
            };
        }

        return {
            textoResposta: "❌ Não consegui encontrar esse item no carrinho.",
            carrinho: carrinho,
            quickReplies: [{ text: "🛒 Ver carrinho", action: "verCarrinho" }]
        };
    }

    public processarFinalizacaoCompra(carrinho: IChatCarrinhoItem[]): IRespostaServicoCarrinho {
        if (carrinho.length === 0) {
            return {
                textoResposta: "🛒 Seu carrinho está vazio! Adicione alguns eventos antes de finalizar a compra.",
                carrinho: carrinho,
                quickReplies: [{ text: "🎪 Ver eventos", action: "verEventos" }]
            };
        }

        return {
            textoResposta: "✅ Te levando para finalizar sua compra... 🚀",
            carrinho: carrinho,
            navegarPara: "/carrinho",
            quickReplies: []
        };
    }

    public processarAdicaoItem(parametros: IParametrosAcao, carrinho: IChatCarrinhoItem[]): IRespostaServicoCarrinho {
        const novoItem: IChatCarrinhoItem = {
            id: Date.now().toString(),
            idEvento: parametros.idEvento || "evento-exemplo-id",
            nomeEvento: "Evento Exemplo", // Você buscaria isso do DB
            dataEvento: "15/12/2024",
            preco: 50.00,
            quantidade: parametros.quantidade || 1,
            adicionadoEm: new Date()
        };

        carrinho.push(novoItem);

        return {
            textoResposta: `✅ "${novoItem.nomeEvento}" adicionado ao carrinho! 🎉`,
            carrinho: carrinho,
            quickReplies: [
                { text: "🛒 Ver carrinho", action: "verCarrinho" },
                { text: "🎪 Continuar comprando", action: "verEventos" }
            ]
        };
    }

    public respostaPadrao(carrinho: IChatCarrinhoItem[]): IRespostaServicoCarrinho {
        return {
            textoResposta: "", // O Orquestrador preenche isso
            carrinho: carrinho,
            quickReplies: this.quickRepliesPadrao
        };
    }

    public calcularTotalCarrinho(carrinho: IChatCarrinhoItem[]): number {
        return carrinho.reduce((total, item) => total + (item.preco * item.quantidade), 0);
    }

    public obterQuantidadeItens(carrinho: IChatCarrinhoItem[]): number {
        return carrinho.reduce((total, item) => total + item.quantidade, 0);
    }
}