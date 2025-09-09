const jwt = require('jsonwebtoken');
const User = require('./models/User'); // Ajuste o caminho para seu modelo User
const SECRET = process.env.JWT_SECRET;

const authMiddleware = async (req, res, next) => {
  // 1. Pega o token do cookie que o navegador enviou
  const token = req.cookies.authToken;

  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
  }

  try {
    // 2. Verifica se o token é válido
    const decoded = jwt.verify(token, SECRET);

    // 3. Adiciona o ID do usuário ao objeto 'req' para que as próximas rotas possam usá-lo
    req.userId = decoded.userId;

    next(); // 4. Passa para a próxima função (a rota principal)
  } catch (error) {
    res.status(401).json({ message: 'Token inválido.' });
  }
};

module.exports = authMiddleware;