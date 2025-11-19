// vibe-back/authMiddleware.ts

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { UserRole } from './models/User'; // ⬅️ Importando seu tipo de Role

// --- Tipagem do Payload do Token ---
// Define a "forma" do objeto que está dentro do seu JWT
export interface ITokenPayload {
  userId: string;
  role: UserRole;
  // iat: number; // (iat e exp são adicionados pelo jwt, mas não precisamos deles)
  // exp: number;
}

// --- Declaration Merging (A Mágica) ---
// Isso informa ao TypeScript que a interface 'Request' do Express
// agora tem uma propriedade 'user' opcional, que conterá nosso payload.
declare global {
  namespace Express {
    interface Request {
      user?: ITokenPayload;
    }
  }
}
// --- Fim da Mágica ---

const SECRET = process.env.JWT_SECRET as string;

/**
 * Middleware para proteger rotas.
 * Verifica se o token (no cookie ou header) é válido e anexa os dados do usuário ao req.user.
 */
export const protect = (req: Request, res: Response, next: NextFunction) => {
  let token: string | undefined;

  if (req.cookies.authToken) {
    token = req.cookies.authToken;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
  }

  try {
    // Verificamos o token e garantimos que o tipo de 'decoded' é o nosso ITokenPayload
    const decoded = jwt.verify(token, SECRET) as ITokenPayload;

    // 🔥 MUDANÇA PRINCIPAL:
    // Agora 'req.user' é totalmente tipado e reconhecido pelo TypeScript!
    req.user = decoded; 

    next(); // Continua para a próxima função
  } catch (error) {
    res.status(401).json({ message: 'Token inválido ou expirado.' });
  }
};

/**
 * Middleware factory para checar permissões (Roles).
 * @param allowedRoles Um array de roles que têm permissão.
 */
export const checkPermission = (allowedRoles: UserRole[]) => {
  
  // Retorna o middleware real
  return (req: Request, res: Response, next: NextFunction) => {
    
    // 1. Verifica se 'req.user' existe (ou seja, se o middleware 'protect' rodou antes)
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Não autorizado, informações de usuário ausentes.' });
    }

    const { role } = req.user; // 'role' agora é do tipo UserRole

    // 2. Verifica se a role do usuário está na lista de permitidas
    if (allowedRoles.includes(role)) {
      next(); // PERMITIDO! Pode continuar.
    } else {
      // PROIBIDO!
      res.status(403).json({ message: 'Acesso negado. Você não tem permissão para executar esta ação.' });
    }
  };
};

// Não usamos 'module.exports' com 'export const'.
// Os arquivos que importarem farão: import { protect, checkPermission } from './authMiddleware';