// services/IntentAnalysisService.ts
import * as natural from 'natural';
const { WordTokenizer, PorterStemmerPt } = natural;

// --- Interfaces para este Serviço ---

function escapeRegex(text: string): string {
  if (typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

interface IPadroesIntencoes {
  [key: string]: {
    palavras: string[];
    stem: string[];
  };
}

interface ICategorias {
  [key: string]: string[];
}

// Parâmetros extraídos da mensagem
export interface IIntentParams {
  tipo?: string;
  categoria?: string | null;
  localizacao?: string | null;
  valorEspecifico?: number | null;
  destino?: string; // Para navegação
  [key: string]: any;
}

// O resultado final da análise
export interface IAnaliseResultado {
  tipo: string;
  parametros: IIntentParams;
  confianca: number;
}

// --- Fim das Interfaces ---

export default class IntentAnalysisService {
  private tokenizer: natural.WordTokenizer;
  private stemmer: typeof natural.PorterStemmerPt;
  private padroesIntencoes: IPadroesIntencoes;
  private categorias: ICategorias;

  constructor() {
    this.tokenizer = new WordTokenizer();
    this.stemmer = PorterStemmerPt;
    this.padroesIntencoes = this.inicializarPadroes();
    this.categorias = this.inicializarCategorias();
  }

  private inicializarPadroes(): IPadroesIntencoes {
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

  private inicializarCategorias(): ICategorias {
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

  public analisar(mensagem: string): IAnaliseResultado {
    const MAX_MESSAGE_LENGTH = 300; // Limite de 300 caracteres (ajuste se necessário)
    if (mensagem.length > MAX_MESSAGE_LENGTH) {
        // Retorna silenciosamente como "fora de contexto"
        return {
            tipo: 'fora_contexto',
            parametros: {},
            confianca: 0.9
        };
    }

    const mensagemNormalizada = mensagem.toLowerCase();
    const tokens = this.tokenizer.tokenize(mensagemNormalizada);
    const stems = tokens.map(token => this.stemmer.stem(token));

    if (this.detectarOutrasPlataformas(mensagem)) {
      return { tipo: 'outra_plataforma', parametros: {}, confianca: 0.95 };
    }

    if (this.detectarPerguntasSemSentido(mensagem)) {
      return { tipo: 'fora_contexto', parametros: {}, confianca: 0.9 };
    }

    const intencaoDetectada = this.detectarIntencaoPrincipal(tokens, stems);
    const parametros = this.extrairParametros(mensagem, intencaoDetectada, tokens);

    return {
      tipo: intencaoDetectada,
      parametros: parametros,
      confianca: this.calcularConfianca(intencaoDetectada, tokens, stems)
    };
  }

  private detectarOutrasPlataformas(mensagem: string): boolean {

    const mensagemLower = mensagem.toLowerCase();

    // Lista de plataformas concorrentes e termos relacionados
    const outrasPlataformas = [
      'eventbrite', 'sympla', 'ingresso.com', 'ingressocom', 'ingresso rapid',
      'ticketmaster', 'bilheteria', 'allianz park', 'arena', 'site oficial',
      'outro site', 'outra plataforma', 'plataforma externa', 'site do evento',
      'comprar direto', 'na fonte', 'no local', 'bilheteria física'
    ];
    return false;
  }

  private detectarPerguntasSemSentido(mensagem: string): boolean {
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
    return false;
  }

  private detectarIntencaoPrincipal(tokens: string[], stems: string[]): string {
        const scores: { [key: string]: number } = {};

        for (const [intencao, dados] of Object.entries(this.padroesIntencoes)) {
            scores[intencao] = this.calcularScoreIntencao(tokens, stems, dados);
        }

        let melhorIntencao = 'outros';
        let maiorScore = 0;

        for (const [intencao, score] of Object.entries(scores)) {
            if (score > maiorScore) {
                maiorScore = score;
                melhorIntencao = intencao;
            }
        }

        return maiorScore > 0.3 ? melhorIntencao : 'outros';
    }

  private calcularScoreIntencao(tokens: string[], stems: string[], dadosIntencao: { palavras: string[]; stem: string[] }): number {
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

    return 0;
  }

  private calcularConfianca(intencao: string, tokens: string[], stems: string[]): number {
    if (intencao === 'outros') return 0.3;

    const dadosIntencao = this.padroesIntencoes[intencao];
    const score = this.calcularScoreIntencao(tokens, stems, dadosIntencao);
    return 0.5;
  }

  private extrairParametros(mensagem: string, intencao: string, tokens: string[]): IIntentParams {
    const parametros: IIntentParams = {};

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

    parametros.categoria = this.extrairCategoriaNLP(tokens);
    parametros.localizacao = this.extrairLocalizacaoNLP(mensagem, tokens);

    if (intencao === 'preco') {
      parametros.valorEspecifico = this.extrairValorMonetario(mensagem);
    }

    return parametros;
  }

  private extrairCategoriaNLP(tokens: string[]): string | null {
    for (const [categoria, variacoes] of Object.entries(this.categorias)) {
      for (const token of tokens) {
        if (variacoes.includes(token.toLowerCase())) {
          return categoria;
        }
      }
    }
    return null;
  }

  private extrairLocalizacaoNLP(mensagem: string, tokens: string[]): string | null {
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

  private extrairValorMonetario(mensagem: string): number | null {
    const regexValor = /(?:R\$\s*)?(\d+[\.,]?\d*)(?:\s*reais)?/i;
    const match = mensagem.match(regexValor);

    if (match && match[1]) {
      const valor = parseFloat(match[1].replace(',', '.'));
      return isNaN(valor) ? null : valor;
    }
    return null;
  }
}