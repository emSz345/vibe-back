const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET;

const authMiddleware = (req, res, next) => {
  // 1. Tenta obter o token do cookie chamado 'authToken' (seu método atual)
  let token = req.cookies.authToken;

  // 2. Se não encontrou no cookie, tenta no header Authorization (para o carrinho)
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  }

  // 3. Se não houver token em nenhum lugar, retorna erro
  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
  }

  try {
    // 4. Verifica se o token é válido
    const decoded = jwt.verify(token, SECRET);

    // 5. 🔥 CORREÇÃO: Padroniza a estrutura para todas as rotas
    // Mantém compatibilidade com suas rotas existentes E com o carrinho
    req.userId = decoded.userId; // Para suas rotas atuais
    req.user = { userId: decoded.userId }; // Para as rotas do carrinho

    
    next(); // Continua para a próxima função (a rota)
  } catch (error) {
    // 6. Se o token for inválido (expirado, etc.), retorna erro
    console.log('❌ Token inválido:', error.message);
    res.status(401).json({ message: 'Token inválido.' });
  }
};

module.exports = authMiddleware;