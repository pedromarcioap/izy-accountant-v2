import express from 'express';
import openrouterProxy from './routes/openrouterProxy';
import upload from './routes/upload';
import auth from './routes/auth';
import dotenv from 'dotenv';
import cors from 'cors';
import { authenticateToken } from './middleware/auth';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', auth);
app.use('/api', authenticateToken, openrouterProxy);
app.use('/api', authenticateToken, upload);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
