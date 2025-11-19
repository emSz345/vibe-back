// vibe-back/utils/MemoryManager.ts

export class MemoryManager {
  static limparReferenciasCirculares(objeto: any): any {
    const visto = new WeakSet<object>(); // Tipamos o WeakSet
    
    const limpar = (obj: any): any => {
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }
      if (visto.has(obj)) {
        return '[Referência Circular Removida]';
      }
      visto.add(obj);

      if (Array.isArray(obj)) {
        return obj.map(limpar);
      }

      const resultado: { [key: string]: any } = {}; // Tipamos o objeto 'resultado'
      for (const [chave, valor] of Object.entries(obj)) {
        if (this.deveManterPropriedade(chave, valor)) {
          resultado[chave] = limpar(valor);
        }
      }
      return resultado;
    };

    return limpar(objeto);
  }

  static deveManterPropriedade(chave: string, valor: any): boolean {
    const propriedadesEssenciais = [
      'text', 'intent', 'eventos', 'categorias', 'showCommands', 
      'quickReplies', 'state', 'carrinho', 'success', 'reply'
    ];
    if (propriedadesEssenciais.includes(chave)) {
      return true;
    }

    const propriedadesDesnecessarias = [
      'historico', 'timestamp', 'adicionadoEm', 'ultimaAtividade',
      'dataCriacao', 'visto', 'weakSet'
    ];
    if (propriedadesDesnecessarias.includes(chave)) {
      return false;
    }

    if (typeof valor === 'string' && valor.length > 1000) {
      return false;
    }
    return true;
  }

  static otimizarResposta(resposta: any): any {
    try {
      let respostaOtimizada = JSON.parse(JSON.stringify(resposta));
      respostaOtimizada = this.limparReferenciasCirculares(respostaOtimizada);

      if (respostaOtimizada.eventos && Array.isArray(respostaOtimizada.eventos)) {
        respostaOtimizada.eventos = respostaOtimizada.eventos.map((evento: any) => 
          this.otimizarEvento(evento)
        ).slice(0, 5);
      }

      if (respostaOtimizada.carrinho && Array.isArray(respostaOtimizada.carrinho)) {
        respostaOtimizada.carrinho = respostaOtimizada.carrinho.map((item: any) => 
          this.otimizarItemCarrinho(item)
        );
      }

      if (respostaOtimizada.state) {
        respostaOtimizada.state = this.otimizarEstado(respostaOtimizada.state);
      }

      if (respostaOtimizada.quickReplies && Array.isArray(respostaOtimizada.quickReplies)) {
        respostaOtimizada.quickReplies = respostaOtimizada.quickReplies.map((reply: { text: string; action: any }) => ({
          text: reply.text.length > 20 ? reply.text.substring(0, 20) + '...' : reply.text,
          action: reply.action
        })).slice(0, 4);
      }

      return respostaOtimizada;
    } catch (error) {
      console.error('Erro ao otimizar resposta:', error);
      return this.respostaDeFallback();
    }
  }

  static otimizarEvento(evento: any): any {
    return {
      id: evento._id || evento.id,
      nome: evento.nome,
      categoria: evento.categoria,
      cidade: evento.cidade,
      estado: evento.estado,
      dataInicio: evento.dataInicio,
      valorIngressoInteira: evento.valorIngressoInteira
    };
  }

  static otimizarItemCarrinho(item: any): any {
    return {
      id: item.id,
      nomeEvento: item.nomeEvento,
      dataEvento: item.dataEvento,
      preco: item.preco,
      quantidade: item.quantidade
    };
  }

  static otimizarEstado(estado: any): any {
    return {
      filtros: estado.filtros || {},
      carrinho: (estado.carrinho || []).map((item: any) => this.otimizarItemCarrinho(item)),
      navegarPara: estado.navegarPara
    };
  }

  // Definimos um tipo de retorno explícito para a resposta de fallback
  static respostaDeFallback(): { text: string; showCommands: boolean; quickReplies: { text: string; action: string; }[] } {
    return {
      text: "Opa! Algo deu errado, mas já estou me recuperando! 😊",
      showCommands: true,
      quickReplies: [
        { text: "🎪 Ver eventos", action: "verEventos" },
        { text: "🛒 Meu carrinho", action: "verCarrinho" }
      ]
    };
  }

  static logUsoMemoria(tag: string = ''): void {
    if (process.env.NODE_ENV === 'development') {
      const uso = process.memoryUsage();
      console.log(`🧠 ${tag} - Memória:`, {
        rss: `${Math.round(uso.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(uso.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(uso.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(uso.external / 1024 / 1024)} MB`
      });
    }
  }
}