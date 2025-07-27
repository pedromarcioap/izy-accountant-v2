import express from 'express';
import axios from 'axios';

const router = express.Router();

router.post('/openrouter', async (req, res) => {
  const { prompt } = req.body;
  const apiKey = process.env.OPENROUTER_API_KEY;

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: "openai/gpt-3.5-turbo",
        messages: [
            {
                "role": "user",
                "content": prompt,
            }
        ]
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao consultar OpenRouter' });
  }
});

export default router;
