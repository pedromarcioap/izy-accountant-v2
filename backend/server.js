// server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb'; // Importa MongoClient e ObjectId
import { v4 as uuidv4 } from 'uuid'; // Para gerar IDs de usuário únicos

dotenv.config(); // Carrega as variáveis de ambiente do arquivo .env

const app = express();
const port = process.env.PORT || 3001; // Define a porta do servidor, padrão 3001

// Configurações do MongoDB Atlas
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'izyaccountant'; // Nome do seu banco de dados no Atlas

// Cria um novo MongoClient
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db; // Variável para armazenar a instância do banco de dados

// Função para conectar ao MongoDB
async function connectToMongoDB() {
    try {
        await client.connect();
        db = client.db(dbName);
        console.log("Conectado ao MongoDB Atlas!");
    } catch (error) {
        console.error("Erro ao conectar ao MongoDB Atlas:", error);
        process.exit(1); // Encerra o processo se a conexão falhar
    }
}

// Conecta ao MongoDB ao iniciar o servidor
connectToMongoDB();

// Middleware para permitir requisições de origens diferentes (CORS)
app.use(cors({
    origin: '*', // Permite todas as origens para desenvolvimento.
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], // Métodos HTTP permitidos
    allowedHeaders: ['Content-Type', 'Authorization'] // Cabeçalhos permitidos
}));

// Middleware para analisar o corpo das requisições como JSON
app.use(express.json());

// Rota GET para a URL raiz ('/')
app.get('/', (req, res) => {
    res.status(200).send('Servidor backend de categorização e dados está online!');
});

// Endpoint para categorizar despesas com IA (permanece o mesmo)
app.post('/categorize', async (req, res) => {
    const { description } = req.body;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    if (!openRouterApiKey) {
        console.error("OPENROUTER_API_KEY não configurada nas variáveis de ambiente.");
        return res.status(500).json({ error: "Chave da API não configurada no servidor." });
    }

    try {
        const apiUrl = "https://openrouter.ai/api/v1/chat/completions";
        const model = "mistralai/mistral-7b-instruct";
        const prompt = `Categorize a seguinte despesa em uma única palavra: "alimentação", "bebidas", "supermercado", "transporte", "moradia", "lazer", "saúde", "educação", "serviços", "compras", "outros". Despesa: "${description}"`;

        const payload = {
            model: model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 10
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openRouterApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Erro na resposta da API OpenRouter: Status ${response.status}, Resposta: ${errorText}`);
            return res.status(response.status).json({ error: `Erro da API OpenRouter: ${errorText}` });
        }

        const result = await response.json();
        if (result.choices && result.choices.length > 0 && result.choices[0].message) {
            let category = result.choices[0].message.content.trim().toLowerCase();
            if (category.includes('categoria:')) {
                category = category.split('categoria:')[1].trim();
            }
            category = category.replace(/[^a-zà-ú\s]/g, '').trim();
            return res.json({ category: category });
        } else {
            return res.status(500).json({ error: "Resposta inesperada da API OpenRouter." });
        }

    } catch (error) {
        console.error("Erro ao categorizar despesa no backend:", error);
        res.status(500).json({ error: "Erro interno do servidor ao categorizar despesa." });
    }
});

// --- Rotas para Gerenciamento de Despesas (MongoDB) ---

// Endpoint para obter/criar um userId (para usuários anônimos)
app.get('/user-id', (req, res) => {
    let userId = req.headers['x-user-id']; // Tenta obter o userId do cabeçalho
    if (!userId) {
        userId = uuidv4(); // Gera um novo UUID se não houver
    }
    res.status(200).json({ userId: userId });
});

// Endpoint para adicionar múltiplas despesas
app.post('/expenses', async (req, res) => {
    const expensesToAdd = req.body; // Array de despesas
    const userId = req.headers['x-user-id']; // Obtém o userId do cabeçalho

    if (!userId) {
        return res.status(401).json({ error: "ID do usuário não fornecido." });
    }
    if (!Array.isArray(expensesToAdd) || expensesToAdd.length === 0) {
        return res.status(400).json({ error: "Nenhuma despesa válida para adicionar." });
    }

    try {
        const expensesCollection = db.collection('expenses');
        // Adiciona o user_id a cada despesa antes de inserir
        const expensesWithUserId = expensesToAdd.map(exp => ({ ...exp, user_id: userId }));
        const result = await expensesCollection.insertMany(expensesWithUserId);
        res.status(201).json({ message: `${result.insertedCount} despesa(s) adicionada(s) com sucesso!`, insertedIds: result.insertedIds });
    } catch (error) {
        console.error("Erro ao adicionar despesas:", error);
        res.status(500).json({ error: "Erro interno do servidor ao adicionar despesas." });
    }
});

// Endpoint para obter despesas de um usuário para um mês/ano específico
app.get('/expenses/:userId/:monthYear', async (req, res) => {
    const { userId, monthYear } = req.params;

    try {
        const expensesCollection = db.collection('expenses');
        const expenses = await expensesCollection.find({
            user_id: userId,
            monthYear: monthYear
        }).sort({ timestamp: -1 }).toArray(); // Ordena por timestamp decrescente
        res.status(200).json(expenses);
    } catch (error) {
        console.error("Erro ao obter despesas:", error);
        res.status(500).json({ error: "Erro interno do servidor ao obter despesas." });
    }
});

// Endpoint para excluir uma única despesa
app.delete('/expenses/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.headers['x-user-id']; // Obtém o userId do cabeçalho

    if (!userId) {
        return res.status(401).json({ error: "ID do usuário não fornecido." });
    }

    try {
        const expensesCollection = db.collection('expenses');
        const result = await expensesCollection.deleteOne({ _id: new ObjectId(id), user_id: userId });

        if (result.deletedCount === 1) {
            res.status(200).json({ message: "Despesa removida com sucesso!" });
        } else {
            res.status(404).json({ error: "Despesa não encontrada ou não pertence ao usuário." });
        }
    } catch (error) {
        console.error("Erro ao remover despesa:", error);
        res.status(500).json({ error: "Erro interno do servidor ao remover despesa." });
    }
});

// Endpoint para limpar todas as despesas de um usuário para um mês/ano específico
app.delete('/expenses/clear/:userId/:monthYear', async (req, res) => {
    const { userId, monthYear } = req.params;
    const requestUserId = req.headers['x-user-id']; // Obtém o userId do cabeçalho

    if (!requestUserId || requestUserId !== userId) {
        return res.status(403).json({ error: "Ação não autorizada para este usuário." });
    }

    try {
        const expensesCollection = db.collection('expenses');
        const result = await expensesCollection.deleteMany({
            user_id: userId,
            monthYear: monthYear
        });
        res.status(200).json({ message: `${result.deletedCount} despesa(s) limpa(s) com sucesso para ${monthYear}!` });
    } catch (error) {
        console.error("Erro ao limpar despesas:", error);
        res.status(500).json({ error: "Erro interno do servidor ao limpar despesas." });
    }
});

// Inicia o servidor e o faz escutar na porta definida
app.listen(port, () => {
    console.log(`Servidor backend rodando em http://localhost:${port}`);
});
