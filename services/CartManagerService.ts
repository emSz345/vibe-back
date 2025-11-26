// src/services/CartManagerService.ts

/**
 * Interface que define a estrutura de um item no carrinho.
 * O ChatContext precisa disso para funcionar.
 */
export interface IChatCarrinhoItem {
    id: string;
    idEvento: string;
    nomeEvento: string;
    dataEvento: Date | string; // Aceita Date ou string (útil vindo de JSON)
    preco: number;
    quantidade: number;
    adicionadoEm: Date;
}

/**
 * Serviço responsável pela lógica de manipulação do carrinho.
 * Mesmo que o ChatContext manipule o array, funções de cálculo
 * e formatação devem ficar aqui para manter o código limpo.
 */
export class CartManagerService {

    /**
     * Calcula o valor total do carrinho
     */
    public static calcularTotal(carrinho: IChatCarrinhoItem[]): number {
        return carrinho.reduce((total, item) => {
            return total + (item.preco * item.quantidade);
        }, 0);
    }

    /**
     * Gera um resumo em texto do carrinho (Útil para o bot responder ao usuário)
     */
    public static gerarResumoTexto(carrinho: IChatCarrinhoItem[]): string {
        if (!carrinho || carrinho.length === 0) {
            return "O carrinho está vazio.";
        }

        let texto = "🛒 *Resumo do Carrinho:*\n";
        
        carrinho.forEach((item, index) => {
            const subtotal = item.preco * item.quantidade;
            texto += `\n${index + 1}. ${item.nomeEvento}`;
            texto += `\n   Qtd: ${item.quantidade} x R$ ${item.preco.toFixed(2)}`;
            texto += `\n   Subtotal: R$ ${subtotal.toFixed(2)}\n`;
        });

        const total = this.calcularTotal(carrinho);
        texto += `\n💰 *Total: R$ ${total.toFixed(2)}*`;

        return texto;
    }
}

export default CartManagerService;