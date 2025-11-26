/**
 * Este serviço atua como o "sistema de reconhecimento de intenções" do chatbot, 
 * utilizando técnicas de NLP (Natural Language Processing) para entender o que
 * o usuário realmente quer dizer e classificar suas mensagens em categorias específicas.
 * É o componente responsável por dar inteligência contextual ao chatbot.
 */

// services/IntentAnalysisService.ts
import * as natural from 'natural';
const { WordTokenizer, PorterStemmerPt } = natural;

// --- Interfaces para este Serviço ---

/**
 * INTERFACE IPadroesIntencoes - Mapeia intenções para padrões de palavras
 * @prop palavras - Palavras completas relacionadas à intenção (match exato)
 * @prop stem - Radicais de palavras relacionadas à intenção (match flexível)
 */
interface IPadroesIntencoes {
  [key: string]: {
    palavras: string[];
    stem: string[];
  };
}

/**
 * INTERFACE IIntentParams - Parâmetros extraídos da mensagem
 * @prop tipo - Tipo específico de ajuda solicitada (subcategoria da intenção)
 * @prop [key: string] - Permite parâmetros adicionais dinâmicos
 */
export interface IIntentParams {
  tipo?: string;
  [key: string]: any;
}

/**
 * INTERFACE IAnaliseResultado - Resultado final da análise de intenção
 * @prop tipo - Tipo de intenção detectada (ex: 'ajuda_sistema', 'saudacao')
 * @prop parametros - Parâmetros extraídos da mensagem (detalhes específicos)
 * @prop confianca - Nível de confiança da detecção (0-1, onde 1 é 100% confiável)
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
 * - Tokenização de texto em português
 * - Stemming (redução de palavras aos seus radicais)
 * - Detecção de intenções baseada em padrões pré-definidos
 * - Extração de parâmetros contextuais
 * - Cálculo de confiança probabilística
 * - Filtragem de mensagens fora do contexto
 */
export default class IntentAnalysisService {
  private tokenizer: natural.WordTokenizer;      // Divisor de texto em tokens/palavras
  private stemmer: typeof natural.PorterStemmerPt; // Redutor de palavras aos radicais
  private padroesIntencoes: IPadroesIntencoes;   // Banco de padrões de intenções

  /**
   * CONSTRUTOR - Inicializa o serviço com ferramentas de NLP
   * Configura tokenizer e stemmer para processamento em português
   */
  constructor() {
    // Inicializa ferramentas de NLP
    this.tokenizer = new WordTokenizer();  // Tokenizer para dividir texto em palavras
    this.stemmer = PorterStemmerPt;        // Stemmer específico para português
    this.padroesIntencoes = this.inicializarPadroes(); // Carrega padrões de intenções
  }

  /**
   * MÉTODO inicializarPadroes - Define os padrões de intenções do sistema
   * Cada intenção possui palavras completas e stems para matching flexível
   * 
   * @returns Dicionário completo de intenções e seus padrões associados
   */
  private inicializarPadroes(): IPadroesIntencoes {
    return {
      // Intenção: Pedidos de ajuda sobre o sistema
      // Captura dúvidas sobre funcionalidades da plataforma
      ajuda_sistema: {
        palavras: ['como funciona', 'como faço', 'como usar', 'cadastrar', 'login', 'entrar', 'recuperar senha', 'esqueci senha', 'categorias', 'comprar ingresso', 'criar evento', 'editar perfil'],
        stem: ['como', 'funcion', 'faz', 'usar', 'cadastr', 'login', 'entrar', 'recuper', 'senha', 'esquec', 'categor', 'comprar', 'ingress', 'criar', 'event', 'edit', 'perfil']
      },
      // Intenção: Saudações
      // Identifica cumprimentos e saudações iniciais
      saudacao: {
        palavras: ['olá', 'oi', 'ola', 'e aí', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi', 'saudações', 'oie', 'opa', 'eae'],
        stem: ['olá', 'oi', 'ola', 'e aí', 'bom', 'dia', 'boa', 'tarde', 'noite', 'hello', 'hi', 'saudaç', 'oie', 'opa', 'eae']
      },
      // Intenção: Agradecimentos
      // Detecta expressões de gratidão do usuário
      agradecimento: {
        palavras: ['obrigado', 'obrigada', 'valeu', 'agradeço', 'thanks', 'thank you', 'brigado', 'brigada', 'obrigadão'],
        stem: ['obrig', 'val', 'agradeç', 'thank', 'brig']
      },
      // Intenção: Sobre a plataforma
      // Responde perguntas sobre identidade e propósito do bot/plataforma
      sobre_plataforma: {
        palavras: ['quem é você', 'o que é', 'sobre', 'plataforma', 'navibe', 'vibe bot', 'você é', 'quem é'],
        stem: ['quem', 'é', 'você', 'o que', 'sobre', 'plataform', 'navibe', 'vibe', 'bot']
      },
      // Intenção: Consulta sobre eventos
      // Identifica buscas e consultas por eventos na plataforma
      eventos_geral: {
        palavras: ['evento', 'eventos', 'show', 'shows', 'festa', 'festas', 'encontrar', 'buscar', 'procurar', 'quero ir', 'encontre', 'mostre', 'liste', 'quero ver', 'onde tem', 'tem algum', 'há algum', 'o que tem', 'o que há', 'opções', 'programação', 'agenda', 'rolê', 'rolé', 'categoria', 'categorias'],
        stem: ['event', 'show', 'fest', 'encontr', 'busc', 'procur', 'quer', 'ir', 'encontr', 'mostr', 'list', 'ver', 'onde', 'tem', 'há', 'opç', 'program', 'agend', 'rolê', 'rolé', 'categor']
      }
    };
  }

  /**
   * MÉTODO analisar - Método principal de análise de intenção
   * Orquestra todo o pipeline de processamento de linguagem natural
   * 
   * Pipeline:
   * 1. Validação → 2. Normalização → 3. Tokenização → 4. Stemming
   * 5. Filtragem → 6. Detecção → 7. Extração → 8. Confiança
   * 
   * @param mensagem - Texto bruto do usuário para análise
   * @returns Resultado completo da análise com intenção detectada e confiança
   */
  public analisar(mensagem: string): IAnaliseResultado {
    // Validação de comprimento da mensagem (prevenção de abuse)
    const MAX_MESSAGE_LENGTH = 300;
    if (mensagem.length > MAX_MESSAGE_LENGTH) {
        return {
            tipo: 'fora_contexto',
            parametros: {},
            confianca: 0.9  // Alta confiança para mensagens muito longas
        };
    }

    // PRÉ-PROCESSAMENTO DO TEXTO
    // Normalização: converte para minúsculas para case-insensitive matching
    const mensagemNormalizada = mensagem.toLowerCase();
    
    // Tokenização: divide o texto em palavras/tokens individuais
    const tokens = this.tokenizer.tokenize(mensagemNormalizada);
    
    // Stemming: reduz cada token ao seu radical em português
    const stems = tokens.map(token => this.stemmer.stem(token));

    // FILTRAGEM DE CONTEXTO
    // Verifica se menciona outras plataformas (concorrentes)
    if (this.detectarOutrasPlataformas(mensagem)) {
      return { tipo: 'outra_plataforma', parametros: {}, confianca: 0.95 };
    }

    // Verifica se é pergunta fora do contexto da plataforma
    if (this.detectarPerguntasSemSentido(mensagem)) {
      return { tipo: 'fora_contexto', parametros: {}, confianca: 0.9 };
    }

    // DETECÇÃO PRINCIPAL
    // Identifica a intenção mais provável baseada nos tokens e stems
    const intencaoDetectada = this.detectarIntencaoPrincipal(tokens, stems);
    
    // Extrai parâmetros específicos da intenção detectada
    const parametros = this.extrairParametros(mensagem, intencaoDetectada);

    // Retorna resultado completo da análise
    return {
      tipo: intencaoDetectada,
      parametros: parametros,
      confianca: this.calcularConfianca(intencaoDetectada, tokens, stems)
    };
  }

  /**
   * MÉTODO detectarOutrasPlataformas - Detecta menção a concorrentes
   * Filtra mensagens que mencionam plataformas de eventos concorrentes
   * 
   * @param mensagem - Texto original do usuário
   * @returns Boolean indicando se mencionou outras plataformas
   */
  private detectarOutrasPlataformas(mensagem: string): boolean {
    const mensagemLower = mensagem.toLowerCase();
    
    // Lista de plataformas concorrentes e termos relacionados
    const outrasPlataformas = [
      'eventbrite', 'sympla', 'ingresso.com', 'ingressocom', 'ingresso rapid',
      'ticketmaster', 'bilheteria', 'allianz park', 'arena', 'site oficial',
      'outro site', 'outra plataforma', 'plataforma externa', 'site do evento',
      'comprar direto', 'na fonte', 'no local', 'bilheteria física'
    ];

    // Verifica se alguma plataforma está presente na mensagem
    return outrasPlataformas.some(plataforma => 
      mensagemLower.includes(plataforma)
    );
  }

  /**
   * MÉTODO detectarPerguntasSemSentido - Filtra perguntas fora do contexto
   * Usa regex para identificar temas não relacionados à plataforma de eventos
   * 
   * @param mensagem - Texto original do usuário
   * @returns Boolean indicando se é pergunta fora do contexto
   */
  private detectarPerguntasSemSentido(mensagem: string): boolean {
    // Padrões de regex para detectar temas fora do escopo da plataforma
    const padroesForaContexto = [
      /(como|qual|quem|onde|porque|por que|o que).*(deus|universo|vida|morte|pol[íi]tica|governo|presidente)/i,
      /(futebol|esporte|time|campeonato).*(jogo|partida)/i,
      /(filme|s[ée]rie|netflix|cinema).*(assistir|recomendar)/i,
      /(comida|receita|restaurante).*(fazer|comer)/i,
      /(viagem|hotel|passagem).*(viajar|reservar)/i,
      /(namoro|casamento|relacionamento).*(amor|paquera)/i,
      /(trabalho|emprego|sal[áa]rio).*(contratar|trabalhar)/i
    ];

    // Testa se algum padrão corresponde à mensagem
    return padroesForaContexto.some(padrao => padrao.test(mensagem));
  }

  /**
   * MÉTODO detectarIntencaoPrincipal - Identifica a intenção mais provável
   * Calcula scores para cada intenção e seleciona a com maior pontuação
   * 
   * @param tokens - Array de tokens (palavras) da mensagem
   * @param stems - Array de stems (radicais) da mensagem
   * @returns String com o tipo da intenção detectada ou 'outros' se não encontrada
   */
  private detectarIntencaoPrincipal(tokens: string[], stems: string[]): string {
    const scores: { [key: string]: number } = {}; // Mapa de scores por intenção

    // Calcula score para cada intenção registrada
    for (const [intencao, dados] of Object.entries(this.padroesIntencoes)) {
        scores[intencao] = this.calcularScoreIntencao(tokens, stems, dados);
    }

    // Encontra intenção com maior score
    let melhorIntencao = 'outros'; // Intenção padrão
    let maiorScore = 0;            // Score inicial

    // Itera sobre todas as intenções para encontrar a melhor
    for (const [intencao, score] of Object.entries(scores)) {
        if (score > maiorScore) {
            maiorScore = score;
            melhorIntencao = intencao;
        }
    }

    // Retorna a intenção apenas se tiver confiança mínima (threshold de 0.3)
    return maiorScore > 0.3 ? melhorIntencao : 'outros';
  }

  /**
   * MÉTODO calcularScoreIntencao - Calcula pontuação para uma intenção específica
   * Combina matching de palavras exatas e stems para scoring flexível
   * 
   * @param tokens - Tokens da mensagem para matching exato
   * @param stems - Stems da mensagem para matching de radicais
   * @param dadosIntencao - Dados da intenção sendo avaliada (palavras e stems)
   * @returns Pontuação numérica representando a força do match
   */
  private calcularScoreIntencao(tokens: string[], stems: string[], dadosIntencao: { palavras: string[]; stem: string[] }): number {
    let score = 0; // Score inicial

    // Verifica correspondência com palavras exatas (peso maior: 1.0)
    for (const token of tokens) {
      if (dadosIntencao.palavras.includes(token)) {
        score += 1.0; // Match exato tem peso completo
      }
    }

    // Verifica correspondência com stems (radicais) - peso menor: 0.8
    for (const stem of stems) {
      if (dadosIntencao.stem.includes(stem)) {
        score += 0.8; // Match de radical tem peso reduzido
      }
    }

    return score;
  }

  /**
   * MÉTODO calcularConfianca - Calcula confiança da detecção baseada no score
   * Converte o score absoluto em uma probabilidade entre 0 e 1
   * 
   * @param intencao - Intenção detectada para cálculo específico
   * @param tokens - Tokens usados no cálculo do score
   * @param stems - Stems usados no cálculo do score
   * @returns Valor entre 0-1 representando a confiança na detecção
   */
  private calcularConfianca(intencao: string, tokens: string[], stems: string[]): number {
    // Intenção 'outros' tem confiança fixa baixa
    if (intencao === 'outros') return 0.3;

    // Busca dados da intenção detectada
    const dadosIntencao = this.padroesIntencoes[intencao];
    
    // Calcula score atual da intenção
    const score = this.calcularScoreIntencao(tokens, stems, dadosIntencao);
    
    // Calcula score máximo possível (considerando todos os tokens/stems)
    const maxScore = Math.max(tokens.length * 1.0, stems.length * 0.8);
    
    // Retorna razão score/maxScore (normalização), com fallback de 0.5
    return maxScore > 0 ? score / maxScore : 0.5;
  }

  /**
   * MÉTODO extrairParametros - Extrai parâmetros específicos da mensagem
   * Refina a intenção detectada com detalhes contextuais específicos
   * 
   * @param mensagem - Texto original do usuário para análise detalhada
   * @param intencao - Intenção detectada para extração específica
   * @returns Parâmetros extraídos que detalham a intenção
   */
  private extrairParametros(mensagem: string, intencao: string): IIntentParams {
    const parametros: IIntentParams = {};

    // Extrai parâmetros específicos para intenção de ajuda no sistema
    if (intencao === 'ajuda_sistema') {
      // Determina o tipo específico de ajuda solicitada
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
        parametros.tipo = 'geral'; // Tipo padrão para ajuda não específica
      }
    }

    return parametros;
  }
}