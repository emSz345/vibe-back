const natural = require('natural');
const { WordTokenizer, PorterStemmerPt } = natural;

class IntentAnalysisService {
  constructor() {
    this.tokenizer = new WordTokenizer();
    this.stemmer = PorterStemmerPt;
    this.padroesIntencoes = this.inicializarPadroes();
    this.categorias = this.inicializarCategorias();
  }

  inicializarPadroes() {
    return {
      ajuda_sistema: {
        palavras: ['como funciona', 'como faço', 'como usar', 'cadastrar', 'login', 'entrar', 'recuperar senha', 'esqueci senha', 'categorias', 'carrinho', 'comprar ingresso'],
        stem: ['como', 'funcion', 'faz', 'usar', 'cadastr', 'login', 'entrar', 'recuper', 'senha', 'esquec', 'categor', 'carrinh', 'comprar', 'ingress']
      },
      saudacao: {
        palavras: ['olá', 'oi', 'ola', 'e aí', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi', 'saudações', 'oie'],
        stem: ['olá', 'oi', 'ola', 'e aí', 'bom', 'dia', 'boa', 'tarde', 'noite', 'hello', 'hi', 'saudaç', 'oie']
      },
      agradecimento: {
        palavras: ['obrigado', 'obrigada', 'valeu', 'agradeço', 'thanks', 'thank you', 'brigado', 'brigada'],
        stem: ['obrig', 'val', 'agradeç', 'thank', 'brig']
      },
      buscarEventos: {
        palavras: ['evento', 'eventos', 'show', 'shows', 'festa', 'festas', 'encontrar', 'buscar', 'procurar', 'quero ir', 'encontre', 'mostre', 'liste', 'quero ver', 'onde tem', 'tem algum', 'há algum', 'o que tem', 'o que há', 'opções', 'programação', 'agenda', 'rolê', 'rolé'],
        stem: ['event', 'show', 'fest', 'encontr', 'busc', 'procur', 'quer', 'ir', 'encontr', 'mostr', 'list', 'ver', 'onde', 'tem', 'há', 'opç', 'program', 'agend', 'rolê', 'rolé']
      },
      categorias: {
        palavras: ['categoria', 'categorias', 'tipo', 'tipos', 'gênero', 'gêneros', 'estilo', 'estilos', 'qual', 'que tipo'],
        stem: ['categor', 'tip', 'gêner', 'estil', 'qual']
      },
      localizacao: {
        palavras: ['em', 'no', 'na', 'de', 'aí', 'aqui', 'próximo', 'perto', 'local', 'lugar', 'cidade', 'estado', 'onde', 'endereço'],
        stem: ['em', 'no', 'na', 'de', 'aí', 'aqui', 'próxim', 'pert', 'local', 'lugar', 'cidad', 'estad', 'onde', 'endereç']
      },
      preco: {
        palavras: ['preço', 'valor', 'quanto custa', 'barato', 'caro', 'grátis', 'gratuito', 'de graça', 'menor preço', 'mais barato', 'mais econômico', 'mais caro', 'maior preço', 'ingresso', 'entrada'],
        stem: ['preç', 'valor', 'quant', 'cust', 'barat', 'car', 'grátis', 'gratuit', 'graç', 'menor', 'mais', 'econômic', 'ingress', 'entrad']
      },
      comprarIngresso: {
        palavras: ['comprar', 'ingresso', 'entrada', 'bilhete', 'adquirir', 'como compro', 'quero comprar'],
        stem: ['compr', 'ingress', 'entrad', 'bilhet', 'adquir', 'compr', 'quer']
      }
    };
  }

  inicializarCategorias() {
    return {
      'rock': ['rock', 'rock and roll', 'rock n roll'],
      'funk': ['funk', 'funk carioca'],
      'sertanejo': ['sertanejo', 'sertaneja', 'música sertaneja'],
      'eletrônica': ['eletrônica', 'eletronica', 'edm', 'house', 'techno', 'trance'],
      'pop': ['pop', 'música pop'],
      'mpb': ['mpb', 'música popular brasileira'],
      'forró': ['forró', 'forro', 'forrozinho'],
      'pagode': ['pagode', 'samba', 'samba pagode']
    };
  }

  analisar(mensagem) {
    const mensagemNormalizada = mensagem.toLowerCase();
    const tokens = this.tokenizer.tokenize(mensagemNormalizada);
    const stems = tokens.map(token => this.stemmer.stem(token));

    // 🔥 VERIFICAÇÃO DE OUTRAS PLATAFORMAS
    if (this.detectarOutrasPlataformas(mensagem)) {
      console.log("🧠 Detectada menção a outras plataformas");
      return {
        tipo: 'outra_plataforma',
        parametros: {},
        confianca: 0.95
      };
    }

    // 🔥 VERIFICAÇÃO DE PERGUNTAS SEM SENTIDO
    if (this.detectarPerguntasSemSentido(mensagem)) {
      console.log("🧠 Detectada pergunta fora do contexto");
      return {
        tipo: 'fora_contexto',
        parametros: {},
        confianca: 0.9
      };
    }

    const intencaoDetectada = this.detectarIntencaoPrincipal(tokens, stems);
    const parametros = this.extrairParametros(mensagem, intencaoDetectada, tokens);

    console.log("🧠 Análise NLP:", {
      mensagem,
      tokens,
      stems,
      intent: intencaoDetectada,
      parametros
    });

    return {
      tipo: intencaoDetectada,
      parametros: parametros,
      confianca: this.calcularConfianca(intencaoDetectada, tokens, stems)
    };
  }

  detectarOutrasPlataformas(mensagem) {
    const mensagemLower = mensagem.toLowerCase();

    // Lista de plataformas concorrentes e termos relacionados
    const outrasPlataformas = [
      'eventbrite', 'sympla', 'ingresso.com', 'ingressocom', 'ingresso rapid',
      'ticketmaster', 'bilheteria', 'allianz park', 'arena', 'site oficial',
      'outro site', 'outra plataforma', 'plataforma externa', 'site do evento',
      'comprar direto', 'na fonte', 'no local', 'bilheteria física'
    ];

    return outrasPlataformas.some(plataforma =>
      mensagemLower.includes(plataforma.toLowerCase())
    );
  }

  detectarPerguntasSemSentido(mensagem) {
    const mensagemLower = mensagem.toLowerCase();

    // Padrões de perguntas sem sentido ou fora do contexto
    const padroesForaContexto = [
      /(como|qual|quem|onde|porque|por que|o que).*(deus|universo|vida|morte|pol[íi]tica|governo|presidente)/i,
      /(futebol|esporte|time|campeonato).*(jogo|partida)/i,
      /(filme|s[ée]rie|netflix|cinema).*(assistir|recomendar)/i,
      /(comida|receita|restaurante).*(fazer|comer)/i,
      /(viagem|hotel|passagem).*(viajar|reservar)/i,
      /(namoro|casamento|relacionamento).*(amor|paquera)/i,
      /(trabalho|emprego|sal[áa]rio).*(contratar|trabalhar)/i
    ];

    return padroesForaContexto.some(pattern => pattern.test(mensagemLower));
  }

  detectarIntencaoPrincipal(tokens, stems) {
    const scores = {};

    // Calcular score para cada intenção
    for (const [intencao, dados] of Object.entries(this.padroesIntencoes)) {
      scores[intencao] = this.calcularScoreIntencao(tokens, stems, dados);
    }

    // Encontrar intenção com maior score
    let melhorIntencao = 'outros';
    let maiorScore = 0;

    for (const [intencao, score] of Object.entries(scores)) {
      if (score > maiorScore) {
        maiorScore = score;
        melhorIntencao = intencao;
      }
    }

    // Só retorna se tiver score mínimo
    return maiorScore > 0.3 ? melhorIntencao : 'outros';
  }

  calcularScoreIntencao(tokens, stems, dadosIntencao) {
    let score = 0;

    // Verificar palavras exatas
    for (const token of tokens) {
      if (dadosIntencao.palavras.includes(token)) {
        score += 1.0;
      }
    }

    // Verificar stems (radicais)
    for (const stem of stems) {
      if (dadosIntencao.stem.includes(stem)) {
        score += 0.8;
      }
    }

    // Normalizar score pelo número de tokens
    return tokens.length > 0 ? score / tokens.length : 0;
  }

  calcularConfianca(intencao, tokens, stems) {
    if (intencao === 'outros') return 0.3;

    const dadosIntencao = this.padroesIntencoes[intencao];
    const score = this.calcularScoreIntencao(tokens, stems, dadosIntencao);

    // Converter score para confiança entre 0.5 e 0.95
    return Math.min(0.5 + (score * 0.45), 0.95);
  }

  extrairParametros(mensagem, intencao, tokens) {
    const parametros = {};


    if (intencao === 'ajuda_sistema') {
      if (mensagem.includes('cadastrar') || mensagem.includes('cadastro')) {
        parametros.tipo = 'cadastro';
      } else if (mensagem.includes('login') || mensagem.includes('entrar')) {
        parametros.tipo = 'login';
      } else if (mensagem.includes('senha') || mensagem.includes('recuperar')) {
        parametros.tipo = 'recuperarSenha';
      } else if (mensagem.includes('categoria')) {
        parametros.tipo = 'categorias';
      } else if (mensagem.includes('carrinho')) {
        parametros.tipo = 'carrinho';
      } else {
        parametros.tipo = 'cadastro'; // padrão
      }
    }

    // Extrair categoria usando NLP
    parametros.categoria = this.extrairCategoriaNLP(tokens);

    // Extrair localização
    parametros.localizacao = this.extrairLocalizacaoNLP(mensagem, tokens);

    // Extrair valor monetário
    if (intencao === 'preco') {
      parametros.valorEspecifico = this.extrairValorMonetario(mensagem);
    }

    return parametros;
  }

  extrairCategoriaNLP(tokens) {
    for (const [categoria, variacoes] of Object.entries(this.categorias)) {
      for (const token of tokens) {
        if (variacoes.includes(token.toLowerCase())) {
          return categoria;
        }
      }
    }
    return null;
  }

  extrairLocalizacaoNLP(mensagem, tokens) {
    const locKeywords = ['em', 'no', 'na', 'de', 'aí', 'aqui', 'próximo', 'perto'];
    const cidades = ['são paulo', 'rio', 'curitiba', 'brasília', 'salvador', 'fortaleza'];

    for (let i = 0; i < tokens.length; i++) {
      if (locKeywords.includes(tokens[i]) && i + 1 < tokens.length) {
        const possivelLocal = tokens[i + 1];
        for (const cidade of cidades) {
          if (cidade.includes(possivelLocal)) {
            return cidade;
          }
        }
      }
    }
    return null;
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
}

module.exports = IntentAnalysisService;