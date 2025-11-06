class CartManagerService {
  constructor() {
    this.quickRepliesPadrao = [
      { text: "🎪 Ver eventos", action: "verEventos" },
      { text: "🛒 Meu carrinho", action: "verCarrinho" }
    ];
  }

  processarAcaoCarrinho(acao, parametros, carrinhoAtual = []) {
    let novoCarrinho = [...carrinhoAtual];

    switch (acao) {
      case 'verCarrinho':
        return this.processarVisualizacaoCarrinho(novoCarrinho);
      
      case 'limparCarrinho':
        return this.processarLimpezaCarrinho();
      
      case 'removerItemCarrinho':
        return this.processarRemocaoItem(parametros.itemIndex, novoCarrinho);
      
      case 'finalizarCompra':
        return this.processarFinalizacaoCompra(novoCarrinho);
      
      case 'adicionarCarrinho':
        return this.processarAdicaoItem(parametros, novoCarrinho);
      
      default:
        return this.respostaPadrao();
    }
  }

  processarVisualizacaoCarrinho(carrinho) {
    if (carrinho.length === 0) {
      return {
        textoResposta: "🛒 Seu carrinho está vazio! Que tal explorar alguns eventos? 🎪",
        carrinho: carrinho,
        quickReplies: [
          { text: "🎪 Ver eventos", action: "verEventos" }
        ]
      };
    }

    const total = carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
    
    let textoResposta = "🛒 **Seu Carrinho:**\\n\\n";
    carrinho.forEach((item, index) => {
      textoResposta += `${index + 1}. **${item.nomeEvento}**\\n`;
      textoResposta += `   📅 ${item.dataEvento}\\n`;
      textoResposta += `   🎫 ${item.quantidade}x R$ ${item.preco.toFixed(2)}\\n`;
      textoResposta += `   💰 Subtotal: R$ ${(item.preco * item.quantidade).toFixed(2)}\\n\\n`;
    });
    textoResposta += `**💰 TOTAL: R$ ${total.toFixed(2)}**`;
    
    return {
      textoResposta: textoResposta,
      carrinho: carrinho,
      quickReplies: [
        { text: "🗑️ Remover item", action: "removerItem" },
        { text: "🧹 Limpar carrinho", action: "limparCarrinho" },
        { text: "✅ Finalizar compra", action: "finalizarCompra" }
      ]
    };
  }

  processarLimpezaCarrinho() {
    return {
      textoResposta: "🧹 Carrinho limpo com sucesso! Todos os itens foram removidos.",
      carrinho: [],
      quickReplies: [
        { text: "🎪 Ver eventos", action: "verEventos" }
      ]
    };
  }

  processarRemocaoItem(itemIndex, carrinho) {
    if (itemIndex >= 0 && itemIndex < carrinho.length) {
      const itemRemovido = carrinho[itemIndex];
      carrinho.splice(itemIndex, 1);
      
      return {
        textoResposta: `🗑️ "${itemRemovido.nomeEvento}" removido do carrinho!`,
        carrinho: carrinho,
        quickReplies: [
          { text: "🛒 Ver carrinho", action: "verCarrinho" },
          { text: "🎪 Continuar comprando", action: "verEventos" }
        ]
      };
    }

    return {
      textoResposta: "❌ Não consegui encontrar esse item no carrinho.",
      carrinho: carrinho,
      quickReplies: [
        { text: "🛒 Ver carrinho", action: "verCarrinho" }
      ]
    };
  }

  processarFinalizacaoCompra(carrinho) {
    if (carrinho.length === 0) {
      return {
        textoResposta: "🛒 Seu carrinho está vazio! Adicione alguns eventos antes de finalizar a compra.",
        carrinho: carrinho,
        quickReplies: [
          { text: "🎪 Ver eventos", action: "verEventos" }
        ]
      };
    }

    return {
      textoResposta: "✅ Te levando para finalizar sua compra... 🚀",
      carrinho: carrinho,
      navegarPara: "/carrinho",
      quickReplies: []
    };
  }

  processarAdicaoItem(parametros, carrinho) {
    // Em uma implementação real, você buscaria o evento do banco
    // Aqui é um exemplo simplificado
    const novoItem = {
      id: Date.now().toString(),
      nomeEvento: "Evento Exemplo",
      dataEvento: "15/12/2024",
      preco: 50.00,
      quantidade: parametros.quantidade || 1
    };

    carrinho.push(novoItem);

    return {
      textoResposta: `✅ "${novoItem.nomeEvento}" adicionado ao carrinho! 🎉`,
      carrinho: carrinho,
      quickReplies: [
        { text: "🛒 Ver carrinho", action: "verCarrinho" },
        { text: "🎪 Continuar comprando", action: "verEventos" }
      ]
    };
  }

  respostaPadrao() {
    return {
      textoResposta: "",
      carrinho: [],
      quickReplies: this.quickRepliesPadrao
    };
  }

  calcularTotalCarrinho(carrinho) {
    return carrinho.reduce((total, item) => total + (item.preco * item.quantidade), 0);
  }

  obterQuantidadeItens(carrinho) {
    return carrinho.reduce((total, item) => total + item.quantidade, 0);
  }
}

module.exports = CartManagerService;