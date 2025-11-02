class ChatOrchestrator {
    constructor(servicoEventos, servicoAnalise, gerenciadorCarrinho) {
        this.servicoEventos = servicoEventos;
        this.servicoAnalise = servicoAnalise;
        this.gerenciadorCarrinho = gerenciadorCarrinho;
    }

    async processarMensagem(mensagem, contextoUsuario) {
        console.log("🤖 [ORQUESTRADOR] Processando mensagem:", mensagem);

        const analiseIntencao = this.servicoAnalise.analisar(mensagem);
        console.log("🎯 [ORQUESTRADOR] Intenção detectada:", analiseIntencao.tipo);

        let resultado = {
            textoResposta: "",
            eventos: [],
            categorias: [],
            showCommands: true,
            quickReplies: [],
            necessitaAI: true,
            state: contextoUsuario.obterEstado()
        };

        // 🔥 LISTA DE INTENÇÕES QUE PRECISAM BUSCAR EVENTOS
        const intencoesQueBuscamEventos = [
            'buscarEventos',
            'preco',
            'localizacao',
            'categorias', // categorias busca a lista, não eventos
            'outros'
        ];

        if (intencoesQueBuscamEventos.includes(analiseIntencao.tipo)) {
            console.log(`🔍 [ORQUESTRADOR] Intenção que busca eventos: ${analiseIntencao.tipo}`);

            switch (analiseIntencao.tipo) {
                case 'outros':
                    // Se detectou categoria mas não intenção clara, busca eventos
                    if (analiseIntencao.parametros.categoria) {
                        resultado.eventos = await this.servicoEventos.buscarPorCriterios({
                            categoria: analiseIntencao.parametros.categoria
                        });
                    }
                    break;
                case 'buscarEventos':
                    const filtros = {
                        ...contextoUsuario.filtrosAtivos,
                        ...analiseIntencao.parametros
                    };
                    resultado.eventos = await this.servicoEventos.buscarPorCriterios(filtros);
                    contextoUsuario.atualizarFiltros(analiseIntencao.parametros);
                    break;

                case 'preco':
                    if (analiseIntencao.parametros.valorEspecifico) {
                        resultado.eventos = await this.servicoEventos.buscarPorValorEspecifico(
                            analiseIntencao.parametros.valorEspecifico,
                            contextoUsuario.filtrosAtivos.localizacao
                        );
                    } else {
                        resultado.eventos = await this.servicoEventos.buscarEventosMaisBaratos(
                            3,
                            contextoUsuario.filtrosAtivos.localizacao
                        );
                    }
                    break;

                case 'localizacao':
                    contextoUsuario.atualizarFiltros({
                        localizacao: analiseIntencao.parametros.localizacao
                    });
                    resultado.eventos = await this.servicoEventos.buscarPorCriterios(
                        contextoUsuario.filtrosAtivos
                    );
                    break;

                case 'categorias':
                    resultado.categorias = await this.servicoEventos.obterCategoriasDisponiveis();
                    break;
            }
        } else {
            console.log(`💬 [ORQUESTRADOR] Intenção conversacional: ${analiseIntencao.tipo} - NÃO buscar eventos`);

            // Apenas processar ações específicas sem buscar eventos
            switch (analiseIntencao.tipo) {
                case 'navegacao':
                    if (analiseIntencao.parametros.destino) {
                        resultado.state.navegarPara = analiseIntencao.parametros.destino;
                        resultado.showCommands = false;
                    }
                    break;

                case 'verCarrinho':
                case 'limparCarrinho':
                case 'removerItemCarrinho':
                case 'finalizarCompra':
                    const resultadoCarrinho = this.gerenciadorCarrinho.processarAcaoCarrinho(
                        analiseIntencao.tipo,
                        analiseIntencao.parametros,
                        contextoUsuario.carrinho
                    );

                    contextoUsuario.carrinho = resultadoCarrinho.carrinho;

                    if (resultadoCarrinho.navegarPara) {
                        resultado.state.navegarPara = resultadoCarrinho.navegarPara;
                    }

                    resultado.quickReplies = resultadoCarrinho.quickReplies;
                    break;
            }
        }

        console.log("📊 [ORQUESTRADOR] Dados coletados para AI:", {
            eventos: resultado.eventos.length,
            categorias: resultado.categorias?.length || 0,
            carrinho: contextoUsuario.carrinho.length
        });

        resultado.necessitaAI = true;
        return this.finalizarResposta(resultado, contextoUsuario);
    }

    async processarNavegacao(analiseIntencao, resultado) {
        if (analiseIntencao.parametros.destino) {
            resultado.state.navegarPara = analiseIntencao.parametros.destino;
            resultado.showCommands = false;
            resultado.textoResposta = `📍 Te levando para ${analiseIntencao.parametros.destino}...`;
        }
        return resultado;
    }

    async processarCarrinho(analiseIntencao, contextoUsuario, resultado) {
        const resultadoCarrinho = this.gerenciadorCarrinho.processarAcaoCarrinho(
            analiseIntencao.tipo,
            analiseIntencao.parametros,
            contextoUsuario.carrinho
        );

        resultado.textoResposta = resultadoCarrinho.textoResposta;
        resultado.quickReplies = resultadoCarrinho.quickReplies;
        resultado.showCommands = false;

        if (resultadoCarrinho.navegarPara) {
            resultado.state.navegarPara = resultadoCarrinho.navegarPara;
        }

        // Atualizar carrinho no contexto
        contextoUsuario.carrinho = resultadoCarrinho.carrinho;

        return resultado;
    }

    async processarBuscaEventos(analiseIntencao, contextoUsuario, resultado) {
        const filtros = {
            ...contextoUsuario.filtrosAtivos,
            ...analiseIntencao.parametros
        };

        resultado.eventos = await this.servicoEventos.buscarPorCriterios(filtros);
        resultado.showCommands = resultado.eventos.length === 0;
        resultado.necessitaAI = resultado.eventos.length > 0;

        // Atualizar filtros no contexto
        contextoUsuario.atualizarFiltros(analiseIntencao.parametros);

        return resultado;
    }

    async processarBuscaPrecos(analiseIntencao, contextoUsuario, resultado) {
        const filtrosPreco = { ...contextoUsuario.filtrosAtivos };

        if (analiseIntencao.parametros.valorEspecifico) {
            resultado.eventos = await this.servicoEventos.buscarPorValorEspecifico(
                analiseIntencao.parametros.valorEspecifico,
                filtrosPreco.localizacao
            );
        } else {
            resultado.eventos = await this.servicoEventos.buscarEventosMaisBaratos(
                3,
                filtrosPreco.localizacao
            );
        }

        resultado.showCommands = resultado.eventos.length === 0;
        resultado.necessitaAI = true;

        return resultado;
    }

    async processarCategorias(resultado) {
        resultado.categorias = await this.servicoEventos.obterCategoriasDisponiveis();
        resultado.necessitaAI = true;
        return resultado;
    }

    async processarLocalizacao(localizacao) {
        const query = {};
        const localizacaoNormalizada = localizacao.trim().toLowerCase();

        // Busca mais flexível
        if (localizacaoNormalizada.includes('-')) {
            const [cidade, estado] = localizacaoNormalizada.split('-').map(s => s.trim());
            if (estado) {
                query.estado = new RegExp(estado, 'i');
            }
            if (cidade) {
                query.cidade = new RegExp(cidade, 'i');
            }
        } else {
            // Tenta buscar por cidade OU estado
            query.$or = [
                { cidade: new RegExp(localizacaoNormalizada, 'i') },
                { estado: new RegExp(localizacaoNormalizada, 'i') }
            ];
        }

        return query;
    }

    finalizarResposta(resultado, contextoUsuario) {
        return {
            ...resultado,
            state: {
                ...resultado.state,
                filtros: contextoUsuario.filtrosAtivos,
                carrinho: contextoUsuario.carrinho
            },
            quickReplies: resultado.quickReplies.length > 0 ?
                resultado.quickReplies :
                this.gerarQuickRepliesPadrao()
        };
    }

    gerarQuickRepliesPadrao() {
        return [
            { text: "🎪 Ver eventos", action: "verEventos" },
            { text: "💰 Eventos baratos", action: "eventosBaratos" },
            { text: "🛒 Meu carrinho", action: "verCarrinho" },
            { text: "❓ Ajuda", action: "ajuda" }
        ];
    }
}

module.exports = ChatOrchestrator;