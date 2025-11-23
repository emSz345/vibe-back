// services/IntentAnalysisService.ts
import * as natural from 'natural';
const { WordTokenizer, PorterStemmerPt } = natural;

// --- Interfaces para este Serviço ---

/**
 * INTERFACE IPadroesIntencoes - Mapeia intenções para padrões de palavras
 * @prop palavras - Palavras completas relacionadas à intenção
 * @prop stem - Radicais de palavras relacionadas à intenção
 */
interface IPadroesIntencoes {
  [key: string]: {
    palavras: string[];
    stem: string[];
  };
}

/**
 * INTERFACE IIntentParams - Parâmetros extraídos da mensagem
 * @prop tipo - Tipo específico de ajuda solicitada
 */
export interface IIntentParams {
  tipo?: string;
  [key: string]: any;
}

/**
 * INTERFACE IAnaliseResultado - Resultado final da análise de intenção
 * @prop tipo - Tipo de intenção detectada
 * @prop parametros - Parâmetros extraídos da mensagem
 * @prop confianca - Nível de confiança da detecção (0-1)
 */
export interface IAnaliseResultado {
  tipo: string;
  parametros: IIntentParams;
  confianca: number;
}

// --- Fim das Interfaces ---

/**
 * CLASSE IntentAnalysisService - Analisa intenções do usuário usando NLP
 * 
 * Funcionalidades:
 * - Tokenização de texto
 * - Stemming em português
 * - Detecção de intenções baseada em padrões
 * - Extração de parâmetros
 * - Cálculo de confiança
 */
export default class IntentAnalysisService {
  private tokenizer: natural.WordTokenizer;
  private stemmer: typeof natural.PorterStemmerPt;
  private padroesIntencoes: IPadroesIntencoes;

  constructor() {
    // Inicializa ferramentas de NLP
    this.tokenizer = new WordTokenizer();
    this.stemmer = PorterStemmerPt;
    this.padroesIntencoes = this.inicializarPadroes();
  }

  /**
   * MÉTODO inicializarPadroes - Define os padrões de intenções
   * @returns Dicionário de intenções e seus padrões
   */
  private inicializarPadroes(): IPadroesIntencoes {
    return {
      // Intenção: Pedidos de ajuda sobre o sistema
      ajuda_sistema: {
        palavras: ['como funciona', 'como faço', 'como usar', 'cadastrar', 'login', 'entrar', 'recuperar senha', 'esqueci senha', 'categorias', 'comprar ingresso', 'criar evento', 'editar perfil'],
        stem: ['como', 'funcion', 'faz', 'usar', 'cadastr', 'login', 'entrar', 'recuper', 'senha', 'esquec', 'categor', 'comprar', 'ingress', 'criar', 'event', 'edit', 'perfil']
      },
      // Intenção: Saudações
      saudacao: {
        palavras: ['olá', 'oi', 'ola', 'e aí', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi', 'saudações', 'oie', 'opa', 'eae'],
        stem: ['olá', 'oi', 'ola', 'e aí', 'bom', 'dia', 'boa', 'tarde', 'noite', 'hello', 'hi', 'saudaç', 'oie', 'opa', 'eae']
      },
      // Intenção: Agradecimentos
      agradecimento: {
        palavras: ['obrigado', 'obrigada', 'valeu', 'agradeço', 'thanks', 'thank you', 'brigado', 'brigada', 'obrigadão'],
        stem: ['obrig', 'val', 'agradeç', 'thank', 'brig']
      },
      // Intenção: Sobre a plataforma
      sobre_plataforma: {
        palavras: ['quem é você', 'o que é', 'sobre', 'plataforma', 'navibe', 'vibe bot', 'você é', 'quem é'],
        stem: ['quem', 'é', 'você', 'o que', 'sobre', 'plataform', 'navibe', 'vibe', 'bot']
      },
      // Intenção: Consulta sobre eventos
      eventos_geral: {
        palavras: ['evento', 'eventos', 'show', 'shows', 'festa', 'festas', 'encontrar', 'buscar', 'procurar', 'quero ir', 'encontre', 'mostre', 'liste', 'quero ver', 'onde tem', 'tem algum', 'há algum', 'o que tem', 'o que há', 'opções', 'programação', 'agenda', 'rolê', 'rolé', 'categoria', 'categorias'],
        stem: ['event', 'show', 'fest', 'encontr', 'busc', 'procur', 'quer', 'ir', 'encontr', 'mostr', 'list', 'ver', 'onde', 'tem', 'há', 'opç', 'program', 'agend', 'rolê', 'rolé', 'categor']
      }
    };
  }

  /**
   * MÉTODO analisar - Método principal de análise de intenção
   * @param mensagem - Texto do usuário para análise
   * @returns Resultado da análise com intenção detectada
   */
  public analisar(mensagem: string): IAnaliseResultado {
    // Validação de comprimento da mensagem
    const MAX_MESSAGE_LENGTH = 300;
    if (mensagem.length > MAX_MESSAGE_LENGTH) {
        return {
            tipo: 'fora_contexto',
            parametros: {},
            confianca: 0.9
        };
    }

    // Pré-processamento do texto
    const mensagemNormalizada = mensagem.toLowerCase();
    const tokens = this.tokenizer.tokenize(mensagemNormalizada);
    const stems = tokens.map(token => this.stemmer.stem(token));

    // Verifica se menciona outras plataformas
    if (this.detectarOutrasPlataformas(mensagem)) {
      return { tipo: 'outra_plataforma', parametros: {}, confianca: 0.95 };
    }

    // Verifica se é pergunta fora do contexto
    if (this.detectarPerguntasSemSentido(mensagem)) {
      return { tipo: 'fora_contexto', parametros: {}, confianca: 0.9 };
    }

    // Detecção principal de intenção
    const intencaoDetectada = this.detectarIntencaoPrincipal(tokens, stems);
    const parametros = this.extrairParametros(mensagem, intencaoDetectada);

    return {
      tipo: intencaoDetectada,
      parametros: parametros,
      confianca: this.calcularConfianca(intencaoDetectada, tokens, stems)
    };
  }

  /**
   * MÉTODO detectarOutrasPlataformas - Detecta menção a concorrentes
   * @param mensagem - Texto do usuário
   * @returns Boolean indicando se mencionou outras plataformas
   */
  private detectarOutrasPlataformas(mensagem: string): boolean {
    const mensagemLower = mensagem.toLowerCase();
    const outrasPlataformas = [
      'eventbrite', 'sympla', 'ingresso.com', 'ingressocom', 'ingresso rapid',
      'ticketmaster', 'bilheteria', 'allianz park', 'arena', 'site oficial',
      'outro site', 'outra plataforma', 'plataforma externa', 'site do evento',
      'comprar direto', 'na fonte', 'no local', 'bilheteria física'
    ];

    return outrasPlataformas.some(plataforma => 
      mensagemLower.includes(plataforma)
    );
  }

  /**
   * MÉTODO detectarPerguntasSemSentido - Filtra perguntas fora do contexto
   * @param mensagem - Texto do usuário
   * @returns Boolean indicando se é pergunta fora do contexto
   */
  private detectarPerguntasSemSentido(mensagem: string): boolean {
    // Padrões de regex para detectar temas fora do escopo
    const padroesForaContexto = [
      /(como|qual|quem|onde|porque|por que|o que).*(deus|universo|vida|morte|pol[íi]tica|governo|presidente)/i,
      /(futebol|esporte|time|campeonato).*(jogo|partida)/i,
      /(filme|s[ée]rie|netflix|cinema).*(assistir|recomendar)/i,
      /(comida|receita|restaurante).*(fazer|comer)/i,
      /(viagem|hotel|passagem).*(viajar|reservar)/i,
      /(namoro|casamento|relacionamento).*(amor|paquera)/i,
      /(trabalho|emprego|sal[áa]rio).*(contratar|trabalhar)/i
    ];

    return padroesForaContexto.some(padrao => padrao.test(mensagem));
  }

  /**
   * MÉTODO detectarIntencaoPrincipal - Identifica a intenção mais provável
   * @param tokens - Tokens da mensagem
   * @param stems - Stems da mensagem
   * @returns String com o tipo da intenção detectada
   */
  private detectarIntencaoPrincipal(tokens: string[], stems: string[]): string {
    const scores: { [key: string]: number } = {};

    // Calcula score para cada intenção
    for (const [intencao, dados] of Object.entries(this.padroesIntencoes)) {
        scores[intencao] = this.calcularScoreIntencao(tokens, stems, dados);
    }

    // Encontra intenção com maior score
    let melhorIntencao = 'outros';
    let maiorScore = 0;

    for (const [intencao, score] of Object.entries(scores)) {
        if (score > maiorScore) {
            maiorScore = score;
            melhorIntencao = intencao;
        }
    }

    // Retorna a intenção apenas se tiver confiança mínima
    return maiorScore > 0.3 ? melhorIntencao : 'outros';
  }

  /**
   * MÉTODO calcularScoreIntencao - Calcula pontuação para uma intenção
   * @param tokens - Tokens da mensagem
   * @param stems - Stems da mensagem
   * @param dadosIntencao - Dados da intenção sendo avaliada
   * @returns Pontuação numérica para a intenção
   */
  private calcularScoreIntencao(tokens: string[], stems: string[], dadosIntencao: { palavras: string[]; stem: string[] }): number {
    let score = 0;

    // Verifica correspondência com palavras exatas
    for (const token of tokens) {
      if (dadosIntencao.palavras.includes(token)) {
        score += 1.0;
      }
    }

    // Verifica correspondência com stems (radicais)
    for (const stem of stems) {
      if (dadosIntencao.stem.includes(stem)) {
        score += 0.8;
      }
    }

    return score;
  }

  /**
   * MÉTODO calcularConfianca - Calcula confiança da detecção
   * @param intencao - Intenção detectada
   * @param tokens - Tokens da mensagem
   * @param stems - Stems da mensagem
   * @returns Valor entre 0-1 representando a confiança
   */
  private calcularConfianca(intencao: string, tokens: string[], stems: string[]): number {
    if (intencao === 'outros') return 0.3;

    const dadosIntencao = this.padroesIntencoes[intencao];
    const score = this.calcularScoreIntencao(tokens, stems, dadosIntencao);
    const maxScore = Math.max(tokens.length * 1.0, stems.length * 0.8);
    
    return maxScore > 0 ? score / maxScore : 0.5;
  }

  /**
   * MÉTODO extrairParametros - Extrai parâmetros específicos da mensagem
   * @param mensagem - Texto original do usuário
   * @param intencao - Intenção detectada
   * @returns Parâmetros extraídos da mensagem
   */
  private extrairParametros(mensagem: string, intencao: string): IIntentParams {
    const parametros: IIntentParams = {};

    // Extrai parâmetros específicos para intenção de ajuda
    if (intencao === 'ajuda_sistema') {
      if (mensagem.includes('cadastrar') || mensagem.includes('cadastro')) {
        parametros.tipo = 'cadastro';
      } else if (mensagem.includes('login') || mensagem.includes('entrar')) {
        parametros.tipo = 'login';
      } else if (mensagem.includes('senha') || mensagem.includes('recuperar')) {
        parametros.tipo = 'recuperarSenha';
      } else if (mensagem.includes('categoria')) {
        parametros.tipo = 'categorias';
      } else if (mensagem.includes('criar evento')) {
        parametros.tipo = 'criarEvento';
      } else if (mensagem.includes('perfil')) {
        parametros.tipo = 'perfil';
      } else {
        parametros.tipo = 'geral';
      }
    }

    return parametros;
  }
}