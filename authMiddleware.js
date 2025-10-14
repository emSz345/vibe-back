// Arquivo: authMiddleware.js

const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET;

// 1. A função 'protect' (seu middleware antigo, mas melhorado)
const protect = (req, res, next) => {
  let token;

  // A sua lógica para encontrar o token no cookie ou no header está perfeita.
  if (req.cookies.authToken) {
    token = req.cookies.authToken;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);

    // 🔥 MUDANÇA PRINCIPAL AQUI:
    // Em vez de salvar apenas o ID, salvamos o objeto INTEIRO do token ({ userId, role }).
    // Isso deixa a 'role' disponível para os próximos middlewares.
    req.user = decoded; 

    next(); // Continua para a próxima função
  } catch (error) {
    res.status(401).json({ message: 'Token inválido ou expirado.' });
  }
};

// 2. A NOVA função 'checkPermission'
const checkPermission = (allowedRoles) => {
  // Esta função retorna outra função (um middleware)
  return (req, res, next) => {
    // Primeiro, checamos se o middleware 'protect' foi executado e nos deu um usuário
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Não autorizado, informações de usuário ausentes.' });
    }

    const { role } = req.user; // Pegamos a role que o 'protect' extraiu do token

    // Verificamos se a role do usuário está na lista de roles permitidas para esta rota
    if (allowedRoles.includes(role)) {
      next(); // Se estiver, PERMITIDO! Pode continuar.
    } else {
      // Se não estiver, PROIBIDO!
      res.status(403).json({ message: 'Acesso negado. Você não tem permissão para executar esta ação.' });
    }
  };
};

// Exportamos as duas funções para serem usadas em outros arquivos
module.exports = { protect, checkPermission };