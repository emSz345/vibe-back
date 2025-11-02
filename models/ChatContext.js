class ChatContext {
  constructor(usuarioId, estadoAnterior = {}) {
    this.usuarioId = usuarioId;
    this.filtrosAtivos = estadoAnterior.filtros || {};
    this.carrinho = estadoAnterior.carrinho || [];
    this.historico = estadoAnterior.historico || [];
    this.dataCriacao = new Date();
    this.ultimaAtividade = new Date();
  }

  atualizarFiltros(novosFiltros) {
    this.filtrosAtivos = { ...this.filtrosAtivos, ...novosFiltros };
    this.ultimaAtividade = new Date();
    
    // Limitar histórico para evitar memory leaks
    if (this.historico.length > 50) {
      this.historico = this.historico.slice(-25);
    }
    
    this.historico.push({
      tipo: 'ATUALIZACAO_FILTROS',
      dados: { ...novosFiltros },
      timestamp: new Date()
    });
  }

  adicionarAoCarrinho(itemEvento) {
    // Verificar se o item já existe no carrinho
    const itemExistenteIndex = this.carrinho.findIndex(
      item => item.idEvento === itemEvento.idEvento
    );

    if (itemExistenteIndex >= 0) {
      // Atualizar quantidade se já existir
      this.carrinho[itemExistenteIndex].quantidade += itemEvento.quantidade || 1;
    } else {
      // Adicionar novo item
      this.carrinho.push({
        id: Date.now().toString(),
        idEvento: itemEvento.idEvento,
        nomeEvento: itemEvento.nomeEvento,
        dataEvento: itemEvento.dataEvento,
        preco: itemEvento.preco,
        quantidade: itemEvento.quantidade || 1,
        adicionadoEm: new Date()
      });
    }

    this.ultimaAtividade = new Date();
    
    this.historico.push({
      tipo: 'ADICAO_CARRINHO',
      dados: { ...itemEvento },
      timestamp: new Date()
    });
  }

  removerDoCarrinho(itemIndex) {
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

  limparCarrinho() {
    const carrinhoAnterior = [...this.carrinho];
    this.carrinho = [];
    
    this.historico.push({
      tipo: 'LIMPEZA_CARRINHO',
      dados: { itensRemovidos: carrinhoAnterior.length },
      timestamp: new Date()
    });

    this.ultimaAtividade = new Date();
  }

  obterEstado() {
    return {
      filtros: { ...this.filtrosAtivos },
      carrinho: [...this.carrinho],
      historico: [...this.historico.slice(-10)], // Manter apenas últimos 10 itens
      ultimaAtividade: this.ultimaAtividade
    };
  }

  estaExpirado() {
    const agora = new Date();
    const diferencaMs = agora - this.ultimaAtividade;
    const diferencaMinutos = diferencaMs / (1000 * 60);
    
    // Considerar expirado após 30 minutos de inatividade
    return diferencaMinutos > 30;
  }

  toJSON() {
    return this.obterEstado();
  }
}

module.exports = ChatContext;