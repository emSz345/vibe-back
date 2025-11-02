class MemoryManager {
  static limparReferenciasCirculares(objeto) {
    const visto = new WeakSet();
    const limpar = (obj) => {
      // Caso base: não é objeto ou é null
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }

      // Verificar se já vimos este objeto (referência circular)
      if (visto.has(obj)) {
        return '[Referência Circular Removida]';
      }

      // Marcar como visto
      visto.add(obj);

      // Processar arrays
      if (Array.isArray(obj)) {
        return obj.map(limpar);
      }

      // Processar objetos regulares
      const resultado = {};
      for (const [chave, valor] of Object.entries(obj)) {
        // Manter apenas propriedades essenciais
        if (this.deveManterPropriedade(chave, valor)) {
          resultado[chave] = limpar(valor);
        }
      }

      return resultado;
    };

    return limpar(objeto);
  }

  static deveManterPropriedade(chave, valor) {
    // Lista de propriedades que devem ser sempre mantidas
    const propriedadesEssenciais = [
      'text', 'intent', 'eventos', 'categorias', 'showCommands', 
      'quickReplies', 'state', 'carrinho', 'success', 'reply'
    ];

    if (propriedadesEssenciais.includes(chave)) {
      return true;
    }

    // Remover propriedades grandes ou desnecessárias
    const propriedadesDesnecessarias = [
      'historico', 'timestamp', 'adicionadoEm', 'ultimaAtividade',
      'dataCriacao', 'visto', 'weakSet'
    ];

    if (propriedadesDesnecessarias.includes(chave)) {
      return false;
    }

    // Remover valores muito grandes
    if (typeof valor === 'string' && valor.length > 1000) {
      return false;
    }

    return true;
  }

  static otimizarResposta(resposta) {
    try {
      // Fazer uma cópia profunda para não modificar o original
      let respostaOtimizada = JSON.parse(JSON.stringify(resposta));

      // Remover referências circulares
      respostaOtimizada = this.limparReferenciasCirculares(respostaOtimizada);

      // Otimizar eventos - manter apenas dados essenciais
      if (respostaOtimizada.eventos && Array.isArray(respostaOtimizada.eventos)) {
        respostaOtimizada.eventos = respostaOtimizada.eventos.map(evento => 
          this.otimizarEvento(evento)
        ).slice(0, 5); // Limitar a 5 eventos
      }

      // Otimizar carrinho
      if (respostaOtimizada.carrinho && Array.isArray(respostaOtimizada.carrinho)) {
        respostaOtimizada.carrinho = respostaOtimizada.carrinho.map(item => 
          this.otimizarItemCarrinho(item)
        );
      }

      // Limpar state desnecessário
      if (respostaOtimizada.state) {
        respostaOtimizada.state = this.otimizarEstado(respostaOtimizada.state);
      }

      // Limpar quick replies muito longos
      if (respostaOtimizada.quickReplies && Array.isArray(respostaOtimizada.quickReplies)) {
        respostaOtimizada.quickReplies = respostaOtimizada.quickReplies.map(reply => ({
          text: reply.text.length > 20 ? reply.text.substring(0, 20) + '...' : reply.text,
          action: reply.action
        })).slice(0, 4); // Máximo 4 quick replies
      }

      return respostaOtimizada;
    } catch (error) {
      console.error('Erro ao otimizar resposta:', error);
      return this.respostaDeFallback();
    }
  }

  static otimizarEvento(evento) {
    return {
      id: evento._id || evento.id,
      nome: evento.nome,
      categoria: evento.categoria,
      cidade: evento.cidade,
      estado: evento.estado,
      dataInicio: evento.dataInicio,
      valorIngressoInteira: evento.valorIngressoInteira
      // Remover outros campos para economizar memória
    };
  }

  static otimizarItemCarrinho(item) {
    return {
      id: item.id,
      nomeEvento: item.nomeEvento,
      dataEvento: item.dataEvento,
      preco: item.preco,
      quantidade: item.quantidade
      // Remover campos temporais para economizar memória
    };
  }

  static otimizarEstado(estado) {
    return {
      filtros: estado.filtros || {},
      carrinho: (estado.carrinho || []).map(item => this.otimizarItemCarrinho(item)),
      navegarPara: estado.navegarPara
      // Remover histórico para economizar memória
    };
  }

  static respostaDeFallback() {
    return {
      text: "Opa! Algo deu errado, mas já estou me recuperando! 😊",
      showCommands: true,
      quickReplies: [
        { text: "🎪 Ver eventos", action: "verEventos" },
        { text: "🛒 Meu carrinho", action: "verCarrinho" }
      ]
    };
  }

  // Método para monitorar uso de memória
  static logUsoMemoria(tag = '') {
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

module.exports = MemoryManager;