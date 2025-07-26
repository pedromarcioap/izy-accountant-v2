import React, { useState } from 'react';
import { Button, TextField, Paper, Typography } from '@mui/material';
import axios from 'axios';

const AiChat = () => {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePromptChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPrompt(event.target.value);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await axios.post('/api/openrouter', { prompt });
      setResponse(res.data.choices[0].message.content);
    } catch (error) {
      console.error('Error querying OpenRouter:', error);
      setResponse('Error querying OpenRouter.');
    }
    setLoading(false);
  };

  return (
    <Paper style={{ padding: '20px', marginTop: '20px' }}>
      <Typography variant="h6">AI Chat</Typography>
      <TextField
        fullWidth
        label="Ask the AI about your transactions"
        value={prompt}
        onChange={handlePromptChange}
        margin="normal"
      />
      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={loading || !prompt}
      >
        {loading ? 'Loading...' : 'Ask'}
      </Button>
      {response && (
        <Typography style={{ marginTop: '20px' }}>{response}</Typography>
      )}
    </Paper>
  );
};

export default AiChat;
