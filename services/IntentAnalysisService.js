class IntentAnalysisService {
  constructor() {
    this.padroesIntencoes = this.inicializarPadroes();
  }

  inicializarPadroes() {
    return {
      saudacao: /(olá|oi|e aí|bom dia|boa tarde|boa noite|hello|hi|saudações|oie)/i,
      agradecimento: /(obrigado|valeu|agradeço|thanks|thank you|brigado)/i,

      // 🔥 PADRÕES MAIS ESPECÍFICOS PARA BUSCA
      buscarEventos: /(eventos?|shows?|festas?|encontrar|buscar|procurar|quero ir|encontre|mostre|liste|quero ver|onde tem|tem algum|há algum|o que tem|o que há|opções|programação|agenda|rolê|rolé|^(?!.*categorias).*$)/i,
      categorias: /(\b(rock|funk|sertanejo|eletrônica|pop|mpb|forró|pagode|jazz|blues|clássica|teatro|dança|stand-up|festival|infantil|esportes|gastronomia|workshop|outros)\b|(quero|ver|buscar|encontrar).*(evento|show)|categorias?|tipos?|gêneros?|estilos?)/i,
      localizacao: /(\b(em|no|na|de|aí|aqui|próximo|perto)\b.*?\b(são paulo|sp|rio|rj|minas|mg|brasília|df|curitiba|pr|porto alegre|rs|bh|belo horizonte|salvador|ba|fortaleza|ce|recife|pe|manaus|am)|local|lugar|cidade|estado)/i,
      preco: /(preço|valor|quanto custa|barato|caro|grátis|gratuito|de graça|menor preço|mais barato|mais econômico|mais caro|maior preço|\b\d+\s*reais|\bR\$\s*\d+|(ingresso|entrada).*(quanto|valor|custa))/i,

      comprarIngresso: /(comprar|ingresso|entrada|bilhete|adquirir|como compro|quero comprar)/i,
      criarEvento: /(criar evento|publicar evento|cadastrar evento|anunciar evento|fazer evento)/i,
      perfil: /(perfil|minha conta|meus dados|editar perfil|minhas informações)/i,
      ajuda: /(ajuda|como funciona|help|suporte|dúvida|não entendo|explicar)/i,
      sobre: /(quem é você|o que você faz|vibe bot|sua função|seu propósito)/i,
      navegacao: /(me leve|me leve para|quero ir|acessar|ir para|ver (meus|o)|como (chego|acesso)|página|pág|site)/i,
      carrinho: /(carrinho|meu carrinho|itens do carrinho|compras|cesta)/i,
      adicionarCarrinho: /(adicionar|comprar|colocar no carrinho|quero ingressos?|adicionar ao carrinho)/i,
    };
  }

  analisar(mensagem) {
    const mensagemNormalizada = mensagem.toLowerCase();
    const intencaoDetectada = this.detectarIntencaoPrincipal(mensagemNormalizada);
    const parametros = this.extrairParametros(mensagem, intencaoDetectada);

    console.log("🧩 Análise da mensagem:", {
      intent: intencaoDetectada,
      parametros
    });

    return {
      tipo: intencaoDetectada,
      parametros: parametros,
      confianca: intencaoDetectada ? 0.8 : 0.3
    };
  }

  detectarIntencaoPrincipal(mensagemNormalizada) {
    const categoriaDetectada = this.extrairCategoria(mensagemNormalizada);
    if (categoriaDetectada) {
      return 'buscarEventos'; // Ou 'categorias' dependendo do que você quer
    }

    // Depois verifica outros padrões
    for (const [intencao, padrao] of Object.entries(this.padroesIntencoes)) {
      if (padrao.test(mensagemNormalizada)) {
        return this.refinarIntencao(mensagemNormalizada, intencao);
      }
    }
    return 'outros';
  }

  refinarIntencao(mensagemNormalizada, intencaoBase) {
    // Refinamentos específicos para carrinho
    if (intencaoBase === 'carrinho') {
      if (mensagemNormalizada.includes('limpar') || mensagemNormalizada.includes('esvaziar')) {
        return 'limparCarrinho';
      }
      if (mensagemNormalizada.includes('finalizar') || mensagemNormalizada.includes('comprar') || mensagemNormalizada.includes('checkout')) {
        return 'finalizarCompra';
      }
      if (this.contemRemocaoItem(mensagemNormalizada)) {
        return 'removerItemCarrinho';
      }
      return 'verCarrinho';
    }

    // Refinamentos para navegação
    if (intencaoBase === 'navegacao') {
      return 'navegacao';
    }

    return intencaoBase;
  }

  extrairParametros(mensagem, intencao) {
    const parametros = {};

    // Extrair categoria
    parametros.categoria = this.extrairCategoria(mensagem);

    // Extrair localização
    parametros.localizacao = this.extrairLocalizacao(mensagem);

    // Extrair valor monetário para intenções de preço
    if (intencao === 'preco') {
      const valorEspecifico = this.extrairValorMonetario(mensagem);
      if (valorEspecifico) {
        parametros.valorEspecifico = valorEspecifico;
      }
    }

    // Extrair índice para remoção de item do carrinho
    if (intencao === 'removerItemCarrinho') {
      parametros.itemIndex = this.extrairIndiceItem(mensagem);
    }

    // Extrair quantidade para adicionar ao carrinho
    if (intencao === 'adicionarCarrinho') {
      parametros.quantidade = this.extrairQuantidade(mensagem);
    }

    // Extrair destino para navegação
    if (intencao === 'navegacao') {
      parametros.destino = this.detectarDestinoNavegacao(mensagem);
    }

    return parametros;
  }

  extrairCategoria(mensagem) {
    const categorias = [
      'rock', 'funk', 'sertanejo', 'eletrônica', 'pop', 'mpb', 'forró',
      'pagode', 'jazz', 'blues', 'clássica', 'teatro', 'dança',
      'stand-up', 'festival', 'infantil', 'esportes', 'gastronomia',
      'workshop', 'outros'
    ];

    const mensagemLower = mensagem.toLowerCase();
    return categorias.find(categoria =>
      new RegExp(`\\b${categoria}\\b`, 'i').test(mensagemLower)
    );
  }

  extrairLocalizacao(mensagem) {
    // 🔥 EVITAR que categorias sejam detectadas como localização
    const categorias = ['rock', 'funk', 'sertanejo', 'eletrônica', 'pop', 'mpb', 'forró', 'pagode'];
    const mensagemLower = mensagem.toLowerCase();

    // Se a mensagem contém uma categoria, não extrair localização
    const temCategoria = categorias.some(cat =>
      new RegExp(`\\b${cat}\\b`, 'i').test(mensagemLower)
    );

    if (temCategoria) {
      return null; // 🔥 Não extrair localização se for uma categoria
    }

    const locRegex = /(?:em|no|na|de)\s+([a-záàâãéèêíïóôõöúçñ]{3,})(?:\s*-\s*([a-z]{2}))?|(?:em|no|na|de)\s+([a-z]{2})\b/i;
    const matchLoc = mensagem.match(locRegex);

    if (!matchLoc) return null;

    let cidadeDetectada = '';
    let estadoDetectado = '';

    if (matchLoc[1]) {
      cidadeDetectada = matchLoc[1].trim();
      estadoDetectado = matchLoc[2] ? matchLoc[2].toUpperCase() : null;
    } else if (matchLoc[3]) {
      estadoDetectado = matchLoc[3].toUpperCase();
    }

    const siglasEstados = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
      'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
      'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

    // 🔥 VALIDAR se é uma localização real
    if (estadoDetectado && siglasEstados.includes(estadoDetectado)) {
      return estadoDetectado;
    }

    if (cidadeDetectada && estadoDetectado) {
      return `${cidadeDetectada}-${estadoDetectado}`;
    }

    // 🔥 Só retorna cidade se for uma cidade conhecida (opcional)
    return cidadeDetectada || null;
  }
  extrairValorMonetario(mensagem) {
    const regexValor = /(?:R\$\s*)?(\d+[\.,]?\d*)(?:\s*reais)?/i;
    const match = mensagem.match(regexValor);

    if (match && match[1]) {
      const valor = parseFloat(match[1].replace(',', '.'));
      return isNaN(valor) ? null : valor;
    }
    return null;
  }

  extrairIndiceItem(mensagem) {
    const removerRegex = /(remover|deletar|excluir).*?(item|ingresso)?\s*(\d+)/i;
    const matchRemover = mensagem.match(removerRegex);
    return matchRemover && matchRemover[3] ? parseInt(matchRemover[3]) - 1 : -1;
  }

  extrairQuantidade(mensagem) {
    const quantidadeRegex = /(?:adicionar|comprar).*?(\d+).*?(ingressos?)?/i;
    const matchQuantidade = mensagem.match(quantidadeRegex);
    return matchQuantidade && matchQuantidade[1] ? parseInt(matchQuantidade[1]) : 1;
  }

  detectarDestinoNavegacao(mensagem) {
    const mensagemLower = mensagem.toLowerCase();

    const mapeamentoDestinos = {
      'perfil': ['perfil', 'minha conta', 'meus dados'],
      'carrinho': ['carrinho', 'meu carrinho', 'compras', 'cesta'],
      'meus-eventos': ['meus eventos', 'eventos criados', 'meus shows'],
      'meus-ingressos': ['meus ingressos', 'ingressos comprados', 'minhas entradas'],
      'cadastro': ['cadastro', 'criar conta', 'registrar'],
      'login': ['login', 'entrar', 'acessar conta'],
      'painel': ['painel', 'admin', 'administração'],
      'home': ['home', 'início', 'página inicial'],
      'categorias': ['categorias', 'tipos de evento'],
      'termos': ['termos', 'condições', 'políticas'],
      'duvidas': ['dúvidas', 'ajuda', 'suporte', 'faq']
    };

    for (const [destino, palavrasChave] of Object.entries(mapeamentoDestinos)) {
      for (const palavra of palavrasChave) {
        if (mensagemLower.includes(palavra)) {
          return `/${destino}`;
        }
      }
    }

    return null;
  }

  contemRemocaoItem(mensagemNormalizada) {
    const removerRegex = /(remover|deletar|excluir).*?(item|ingresso)?\s*(\d+)/i;
    return removerRegex.test(mensagemNormalizada);
  }
}

module.exports = IntentAnalysisService;