const express = require('express');
const router = express.Router();
const eventBotController = require('../controllers/eventBotController');

// Buscar eventos com filtros
router.post('/buscar', eventBotController.searchEvents);

// Rota para buscar eventos com múltiplos filtros
router.get('/buscar/filtros', eventBotController.searchEventsWithFilters);

// Próximos eventos
router.get('/proximos', eventBotController.getUpcomingEvents);

// Evento por ID
router.get('/:id', eventBotController.getEventById);

// Categorias disponíveis
router.get('/categorias/listar', eventBotController.getCategories);

module.exports = router;