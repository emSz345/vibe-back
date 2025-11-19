// models/ChatContext.ts
import type { IChatCarrinhoItem } from '../services/CartManagerService';
// --- Interfaces Auxiliares para o Contexto ---

interface IHistoricoItem {
    tipo: string;
    dados: any;
    timestamp: Date;
}

interface IChatEstadoAnterior {
    filtros?: any;
    carrinho?: IChatCarrinhoItem[];
    historico?: IHistoricoItem[];
}

interface IEstadoRetorno {
    filtros: any;
    carrinho: IChatCarrinhoItem[];
    historico: IHistoricoItem[];
    ultimaAtividade: Date;
}
// --- Fim das Interfaces ---

export default class ChatContext {
    // Definindo as propriedades da classe e seus tipos
    public usuarioId: string;
    public filtrosAtivos: any; // 'any' é aceitável aqui se os filtros forem muito dinâmicos
    public carrinho: IChatCarrinhoItem[];
    public historico: IHistoricoItem[];
    public dataCriacao: Date;
    public ultimaAtividade: Date;

    constructor(usuarioId: string, estadoAnterior: IChatEstadoAnterior = {}) {
        this.usuarioId = usuarioId;
        this.filtrosAtivos = estadoAnterior.filtros || {};
        this.carrinho = estadoAnterior.carrinho || [];
        this.historico = estadoAnterior.historico || [];
        this.dataCriacao = new Date();
        this.ultimaAtividade = new Date();
    }

    public atualizarFiltros(novosFiltros: any): void {
        this.filtrosAtivos = { ...this.filtrosAtivos, ...novosFiltros };
        this.ultimaAtividade = new Date();

        if (this.historico.length > 50) {
            this.historico = this.historico.slice(-25);
        }

        this.historico.push({
            tipo: 'ATUALIZACAO_FILTROS',
            dados: { ...novosFiltros },
            timestamp: new Date()
        });
    }

    // 'itemEvento: any' é ok para uma entrada, pois não sabemos a forma exata
    public adicionarAoCarrinho(itemEvento: any): void {
        const itemExistenteIndex = this.carrinho.findIndex(
            item => item.idEvento === itemEvento.idEvento
        );

        if (itemExistenteIndex >= 0) {
            this.carrinho[itemExistenteIndex].quantidade += itemEvento.quantidade || 1;
        } else {
            this.carrinho.push({
                id: Date.now().toString(),
                idEvento: itemEvento.idEvento,
                nomeEvento: itemEvento.nomeEvento,
                dataEvento: itemEvento.dataEvento,
                preco: itemEvento.preco,
                quantidade: itemEvento.quantidade || 1,
                adicionadoEm: new Date() // <-- 🔥 GARANTA QUE ESTA LINHA ESTÁ AQUI
            });
        }

        this.ultimaAtividade = new Date();
        this.historico.push({
            tipo: 'ADICAO_CARRINHO',
            dados: { ...itemEvento },
            timestamp: new Date()
        });
    }

    public removerDoCarrinho(itemIndex: number): IChatCarrinhoItem | null {
        if (itemIndex >= 0 && itemIndex < this.carrinho.length) {
            const itemRemovido = this.carrinho.splice(itemIndex, 1)[0];
            this.historico.push({
                tipo: 'REMOCAO_CARRINHO',
                dados: { ...itemRemovido },
                timestamp: new Date()
            });
            this.ultimaAtividade = new Date();
            return itemRemovido;
        }
        return null;
    }

    public limparCarrinho(): void {
        const carrinhoAnterior = [...this.carrinho];
        this.carrinho = [];
        this.historico.push({
            tipo: 'LIMPEZA_CARRINHO',
            dados: { itensRemovidos: carrinhoAnterior.length },
            timestamp: new Date()
        });
        this.ultimaAtividade = new Date();
    }

    public obterEstado(): IEstadoRetorno {
        return {
            filtros: { ...this.filtrosAtivos },
            carrinho: [...this.carrinho],
            historico: [...this.historico.slice(-10)],
            ultimaAtividade: this.ultimaAtividade
        };
    }

    public estaExpirado(): boolean {
        const agora = new Date();
        const diferencaMs = agora.getTime() - this.ultimaAtividade.getTime();
        const diferencaMinutos = diferencaMs / (1000 * 60);
        return diferencaMinutos > 30;
    }

    public toJSON(): IEstadoRetorno {
        return this.obterEstado();
    }
}