const Event = require('../models/Event');

const eventBotController = {
  // Buscar eventos por categoria, status, ou outros filtros
  searchEvents: async (req, res) => {
    try {
      const { query, categoria, status = 'aprovado' } = req.body;
      
      let filter = { status: status };
      
      // Filtro por texto (busca em nome e descrição)
      if (query) {
        filter.$or = [
          { nome: { $regex: query, $options: 'i' } },
          { descricao: { $regex: query, $options: 'i' } }
        ];
      }
      
      // Filtro por categoria
      if (categoria && categoria !== 'todos') {
        filter.categoria = categoria;
      }

      const eventos = await Event.find(filter)
        .sort({ dataInicio: 1 }) // Ordenar por data mais próxima
        .limit(5); // Limitar a 5 resultados

      res.json({
        success: true,
        eventos: eventos,
        total: eventos.length
      });

    } catch (error) {
      console.error('Erro ao buscar eventos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar eventos'
      });
    }
  },

  // Buscar próximos eventos
  getUpcomingEvents: async (req, res) => {
    try {
      const hoje = new Date().toISOString().split('T')[0];
      
      const eventos = await Event.find({
        status: 'aprovado',
        dataInicio: { $gte: hoje }
      })
      .sort({ dataInicio: 1, horaInicio: 1 })
      .limit(3);

      res.json({
        success: true,
        eventos: eventos
      });

    } catch (error) {
      console.error('Erro ao buscar próximos eventos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar próximos eventos'
      });
    }
  },

  // Buscar evento por ID
  getEventById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const evento = await Event.findById(id);
      
      if (!evento) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado'
        });
      }

      res.json({
        success: true,
        evento: evento
      });

    } catch (error) {
      console.error('Erro ao buscar evento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar evento'
      });
    }
  },

  // Listar categorias disponíveis
  getCategories: async (req, res) => {
    try {
      const categorias = await Event.distinct('categoria', { status: 'aprovado' });
      
      res.json({
        success: true,
        categorias: categorias
      });

    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar categorias'
      });
    }
  }
};

module.exports = eventBotController;