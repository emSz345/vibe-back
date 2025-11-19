// Em: utils/setupDirectories.ts
import fs from 'fs';
import path from 'path';

export const setupDirectories = () => {
    const projectRoot = process.cwd(); 

    const directories = [
        path.join(projectRoot, 'uploads'),
        path.join(projectRoot, 'uploads', 'perfil-img'),
        path.join(projectRoot, 'uploads', 'carrossel')
    ];

    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`✅ Pasta criada: ${path.relative(projectRoot, dir)}`);
            } catch (error) {
                console.error(`❌ Erro ao criar pasta: ${dir}`, error);
                process.exit(1); 
            }
        }
    });
};