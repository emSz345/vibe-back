// services/EventSearchService.ts
import Event, { IEvent } from '../models/Event'; // ⬅️ IMPORTANDO O MODELO E A INTERFACE!

// Interface para os critérios de busca
interface ICriteriosBusca {
    categoria?: string;
    localizacao?: string;
    valorEspecifico?: number;
    faixaPreco?: {
        min?: number;
        max?: number;
    };
    intent?: string;
    quantidade?: number;
}

// Interface para a Query do Mongoose
// (Usamos 'any' para flexibilidade com $or, $gte, etc.)
interface IEventQuery {
    status: 'aprovado';
    categoria?: RegExp;
    valorIngressoInteira?: any;
    estado?: string | RegExp;
    cidade?: RegExp;
    $or?: any[];
}

function escapeRegex(text: string): string {
    if (typeof text !== 'string') return '';
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

export default class EventSearchService {
    public categoriasDisponiveis: string[];

    constructor() {
        this.categoriasDisponiveis = [
            'rock', 'funk', 'sertanejo', 'eletrônica', 'pop', 'mpb', 'forró',
            'pagode', 'jazz', 'blues', 'clássica', 'teatro', 'dança',
            'stand-up', 'festival', 'infantil', 'esportes', 'gastronomia',
            'workshop', 'outros'
        ];
    }

    public async buscarPorCriterios(criteriosBusca: ICriteriosBusca = {}): Promise<IEvent[]> {
        try {
            const query: IEventQuery = await this.construirQuery(criteriosBusca);
            const opcoesOrdenacao = this.definirOrdenacao(criteriosBusca);
            const limite = this.definirLimite(criteriosBusca);

            console.log("🔍 Query construída:", query);

            const eventos: IEvent[] = await Event.find(query)
                .sort(opcoesOrdenacao)
                .limit(limite);

            console.log("🎉 Eventos retornados:", eventos.length);
            return eventos;
        } catch (error) {
            console.error('Erro ao buscar eventos:', error);
            return [];
        }
    }

    public async buscarEventosMaisBaratos(limite: number = 3, localizacao: string | null = null): Promise<IEvent[]> {
        const criterios: ICriteriosBusca = {
            intent: 'preco',
            quantidade: limite
        };
        if (localizacao) {
            criterios.localizacao = localizacao;
        }
        return this.buscarPorCriterios(criterios);
    }

    public async buscarPorValorEspecifico(valor: number, localizacao: string | null = null): Promise<IEvent[]> {
        const criterios: ICriteriosBusca = {
            valorEspecifico: valor,
            quantidade: 3
        };
        if (localizacao) {
            criterios.localizacao = localizacao;
        }
        return this.buscarPorCriterios(criterios);
    }

    public async obterCategoriasDisponiveis(): Promise<string[]> {
        try {
            // O distinct retorna um array de 'any' por padrão, forçamos 'string[]'
            const categorias = await Event.distinct('categoria', { status: 'aprovado' }) as string[];
            return categorias.filter(cat => cat).sort();
        } catch (error) {
            console.error('Erro ao buscar categorias:', error);
            return this.categoriasDisponiveis;
        }
    }

    public async construirQuery(criteriosBusca: ICriteriosBusca): Promise<IEventQuery> {
        const query: IEventQuery = { status: 'aprovado' };

        if (criteriosBusca.categoria) {
            query.categoria = await this.normalizarCategoria(criteriosBusca.categoria);
        }

        if (criteriosBusca.localizacao && this.eLocalizacaoValida(criteriosBusca.localizacao)) {
            const localQuery = await this.processarLocalizacao(criteriosBusca.localizacao);
            Object.assign(query, localQuery);
        }

        if (criteriosBusca.valorEspecifico) {
            query.valorIngressoInteira = criteriosBusca.valorEspecifico;
        } else if (criteriosBusca.faixaPreco) {
            query.valorIngressoInteira = {
                $gte: criteriosBusca.faixaPreco.min || 0,
                $lte: criteriosBusca.faixaPreco.max || 1000
            };
        }

        return query;
    }

    public eLocalizacaoValida(localizacao: string): boolean {
        const siglasEstados = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
            'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
            'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

        const cidadesComuns = ['sao paulo', 'rio de janeiro', 'belo horizonte', 'brasilia', 'salvador',
            'fortaleza', 'recife', 'porto alegre', 'curitiba', 'manaus'];

        const locLower = localizacao.toLowerCase();

        // Se for sigla de estado
        if (siglasEstados.includes(localizacao.toUpperCase())) {
            return true;
        }

        // Se for nome de cidade comum
        if (cidadesComuns.some(cidade => locLower.includes(cidade))) {
            return true;
        }

        // Se tem formato cidade-estado
        if (localizacao.includes('-')) {
            const [cidade, estado] = localizacao.split('-');
            return siglasEstados.includes(estado.toUpperCase());
        }
        return true; // Simplificado (mantenha sua lógica original)
    }

    public async normalizarCategoria(categoria: string): Promise<RegExp> {

        const MAX_CAT_LENGTH = 100;
        if (categoria.length > MAX_CAT_LENGTH) {
            // Lança um erro ou retorna uma RegExp que não acha nada
            throw new Error("O nome da categoria é muito longo.");
            // Ou: return new RegExp('^$', 'i'); 
        }

        const categoriaNormalizada = escapeRegex(categoria.trim()); // ⬅️ CORREÇÃO
        return new RegExp(`^${categoriaNormalizada}$`, 'i');
    }

    public async processarLocalizacao(localizacao: string): Promise<{ estado?: string | RegExp; cidade?: RegExp; $or?: any[] }> {

        const MAX_LOC_LENGTH = 200;
        if (localizacao.length > MAX_LOC_LENGTH) {
            throw new Error("O nome da localização é muito longo.");
        }

        const query: { estado?: string | RegExp; cidade?: RegExp; $or?: any[] } = {};
        const localizacaoNormalizada = localizacao.trim().toUpperCase();
        const siglasEstados = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
            'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
            'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

        // Se for uma sigla de estado
        if (siglasEstados.includes(localizacaoNormalizada)) {
            query.estado = localizacaoNormalizada;
        }
        // Se for no formato "cidade-estado"
        else if (localizacaoNormalizada.includes('-')) {
            const [cidade, estado] = localizacaoNormalizada.split('-').map(s => s.trim());
            if (estado) {
                query.estado = new RegExp(`^${escapeRegex(estado)}$`, 'i');
            }
            if (cidade && cidade !== estado) {
                query.cidade = new RegExp(`^${escapeRegex(cidade)}$`, 'i');
            }
        }
        // Se for apenas nome de cidade
        else {
            query.cidade = new RegExp(`^${escapeRegex(localizacaoNormalizada)}$`, 'i');
        }
        return query; // Simplificado (mantenha sua lógica original)
    }

    public definirOrdenacao(criteriosBusca: ICriteriosBusca): { [key: string]: 1 | -1 } {
        if (criteriosBusca.intent === 'preco' || criteriosBusca.faixaPreco || criteriosBusca.valorEspecifico) {
            return { valorIngressoInteira: 1 };
        }
        return { dataInicio: 1 };
    }

    public definirLimite(criteriosBusca: ICriteriosBusca): number {
        if (criteriosBusca.intent === 'preco' || criteriosBusca.valorEspecifico) {
            return criteriosBusca.quantidade || 3;
        }
        return criteriosBusca.quantidade || 10;
    }
}