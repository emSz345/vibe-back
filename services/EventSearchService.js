const Event = require('../models/Event');

class EventSearchService {
  constructor() {
    this.categoriasDisponiveis = [
      'rock', 'funk', 'sertanejo', 'eletrônica', 'pop', 'mpb', 'forró',
      'pagode', 'jazz', 'blues', 'clássica', 'teatro', 'dança',
      'stand-up', 'festival', 'infantil', 'esportes', 'gastronomia',
      'workshop', 'outros'
    ];
  }

  async buscarPorCriterios(criteriosBusca = {}) {
    try {
      const query = await this.construirQuery(criteriosBusca);
      const opcoesOrdenacao = this.definirOrdenacao(criteriosBusca);
      const limite = this.definirLimite(criteriosBusca);

      console.log("🔍 Query construída:", query);

      const eventos = await Event.find(query)
        .sort(opcoesOrdenacao)
        .limit(limite);

      console.log("🎉 Eventos retornados:", eventos.length);
      return eventos;
    } catch (error) {
      console.error('Erro ao buscar eventos:', error);
      return [];
    }
  }

  async buscarEventosMaisBaratos(limite = 3, localizacao = null) {
    const criterios = {
      intent: 'preco',
      quantidade: limite
    };

    if (localizacao) {
      criterios.localizacao = localizacao;
    }

    return this.buscarPorCriterios(criterios);
  }

  async buscarPorValorEspecifico(valor, localizacao = null) {
    const criterios = {
      valorEspecifico: valor,
      quantidade: 3
    };

    if (localizacao) {
      criterios.localizacao = localizacao;
    }

    return this.buscarPorCriterios(criterios);
  }

  async obterCategoriasDisponiveis() {
    try {
      const categorias = await Event.distinct('categoria', { status: 'aprovado' });
      return categorias.filter(cat => cat).sort();
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
      return this.categoriasDisponiveis;
    }
  }

  async construirQuery(criteriosBusca) {
    const query = { status: 'aprovado' };

    // Filtro por categoria
    if (criteriosBusca.categoria) {
      query.categoria = await this.normalizarCategoria(criteriosBusca.categoria);
    }

    // 🔥 FILTRO CORRIGIDO: Só aplicar localização se for uma localização válida
    if (criteriosBusca.localizacao && this.eLocalizacaoValida(criteriosBusca.localizacao)) {
      Object.assign(query, await this.processarLocalizacao(criteriosBusca.localizacao));
    }


    // Filtro por valor específico
    if (criteriosBusca.valorEspecifico) {
      query.valorIngressoInteira = criteriosBusca.valorEspecifico;
    }

    // Filtro por faixa de preço
    else if (criteriosBusca.faixaPreco) {
      query.valorIngressoInteira = {
        $gte: criteriosBusca.faixaPreco.min || 0,
        $lte: criteriosBusca.faixaPreco.max || 1000
      };
    }

    return query;
  }

  eLocalizacaoValida(localizacao) {
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
  
  return false;
}

  async normalizarCategoria(categoria) {
    const categoriaNormalizada = categoria.trim();
    return new RegExp(`^${categoriaNormalizada}$`, 'i');
  }

  async processarLocalizacao(localizacao) {
    const query = {};
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
        query.estado = new RegExp(`^${estado}$`, 'i');
      }
      if (cidade && cidade !== estado) {
        query.cidade = new RegExp(`^${cidade}$`, 'i');
      }
    }
    // Se for apenas nome de cidade
    else {
      query.cidade = new RegExp(`^${localizacaoNormalizada}$`, 'i');
    }

    return query;
  }

  definirOrdenacao(criteriosBusca) {
    if (criteriosBusca.intent === 'preco' || criteriosBusca.faixaPreco || criteriosBusca.valorEspecifico) {
      return { valorIngressoInteira: 1 }; // Ordenar por preço crescente
    }
    return { dataInicio: 1 }; // Ordenar por data
  }

  definirLimite(criteriosBusca) {
    if (criteriosBusca.intent === 'preco' || criteriosBusca.valorEspecifico) {
      return criteriosBusca.quantidade || 3;
    }
    return criteriosBusca.quantidade || 10;
  }
}

module.exports = EventSearchService;