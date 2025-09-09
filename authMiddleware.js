const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET;

const authMiddleware = (req, res, next) => {
  // 1. Tenta obter o token do cookie chamado 'authToken'
  const token = req.cookies.authToken;

  // 2. Se não houver token, retorna erro de não autorizado
  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
  }

  try {
    // 3. Verifica se o token é válido
    const decoded = jwt.verify(token, SECRET);

    // 4. Adiciona o ID do usuário ao objeto 'req' para uso nas rotas protegidas
    req.userId = decoded.userId;
    next(); // Continua para a próxima função (a rota)
  } catch (error) {
    // 5. Se o token for inválido (expirado, etc.), retorna erro
    res.status(401).json({ message: 'Token inválido.' });
  }
};

module.exports = authMiddleware;