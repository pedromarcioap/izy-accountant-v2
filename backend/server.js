// server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config(); // Carrega as variáveis de ambiente do arquivo .env

const app = express();
const port = process.env.PORT || 3001; // Define a porta do servidor, padrão 3001

// Middleware para permitir requisições de origens diferentes (CORS)
// Em um ambiente de produção, é crucial restringir 'origin' ao domínio do seu frontend
app.use(cors({
    origin: '*', // Permite todas as origens para desenvolvimento.
    methods: ['GET', 'POST', 'OPTIONS'], // Métodos HTTP permitidos
    allowedHeaders: ['Content-Type', 'Authorization'] // Cabeçalhos permitidos
}));

// Middleware para analisar o corpo das requisições como JSON
app.use(express.json());

// Rota GET para a URL raiz ('/')
// Útil para verificar se o servidor está online e funcionando
app.get('/', (req, res) => {
    res.status(200).send('Servidor backend de categorização está online!');
});

// Endpoint POST para categorizar despesas
// Recebe uma descrição da despesa e retorna uma categoria usando a API OpenRouter
app.post('/categorize', async (req, res) => {
    const { description } = req.body; // Extrai a descrição do corpo da requisição

    // Obtém a chave da API OpenRouter das variáveis de ambiente
    // É fundamental que esta chave seja armazenada de forma segura e não exposta no frontend
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    // Verifica se a chave da API está configurada
    if (!openRouterApiKey) {
        console.error("OPENROUTER_API_KEY não configurada nas variáveis de ambiente.");
        return res.status(500).json({ error: "Chave da API não configurada no servidor." });
    }

    try {
        const apiUrl = "https://openrouter.ai/api/v1/chat/completions";
        const model = "mistralai/mistral-7b-instruct"; // Define o modelo de IA a ser usado para categorização

        // Prompt para a IA categorizar a despesa
        const prompt = `Categorize a seguinte despesa em uma única palavra: "alimentação", "bebidas", "supermercado", "transporte", "moradia", "lazer", "saúde", "educação", "serviços", "compras", "outros". Despesa: "${description}"`;

        // Payload da requisição para a API OpenRouter
        const payload = {
            model: model,
            messages: [
                { role: "user", content: prompt } // Mensagem do usuário para a IA
            ],
            max_tokens: 10 // Limita a resposta da IA a uma palavra curta
        };

        // Faz a requisição POST para a API OpenRouter
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openRouterApiKey}`, // Autenticação com a chave da API
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload) // Converte o payload para JSON
        });

        // Verifica se a resposta da API foi bem-sucedida
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Erro na resposta da API OpenRouter: Status ${response.status}, Resposta: ${errorText}`);
            return res.status(response.status).json({ error: `Erro da API OpenRouter: ${errorText}` });
        }

        // Analisa a resposta JSON da API
        const result = await response.json();

        // Extrai e limpa a categoria da resposta da IA
        if (result.choices && result.choices.length > 0 && result.choices[0].message) {
            let category = result.choices[0].message.content.trim().toLowerCase();
            // Remove prefixos como "categoria:" se a IA os incluir
            if (category.includes('categoria:')) {
                category = category.split('categoria:')[1].trim();
            }
            // Remove caracteres não alfabéticos para garantir uma categoria limpa
            category = category.replace(/[^a-zà-ú\s]/g, '').trim();
            return res.json({ category: category }); // Retorna a categoria
        } else {
            return res.status(500).json({ error: "Resposta inesperada da API OpenRouter." });
        }

    } catch (error) {
        console.error("Erro ao categorizar despesa no backend:", error);
        res.status(500).json({ error: "Erro interno do servidor ao categorizar despesa." });
    }
});

// Inicia o servidor e o faz escutar na porta definida
app.listen(port, () => {
    console.log(`Servidor backend rodando em http://localhost:${port}`);
});