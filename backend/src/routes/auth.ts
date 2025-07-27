import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const router = express.Router();

const users: any[] = [];

const userSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6),
});

router.post('/register', async (req, res) => {
    try {
        const { username, password } = userSchema.parse(req.body);

        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ username, password: hashedPassword });

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(400).json({ error });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = userSchema.parse(req.body);

        const user = users.find((u) => u.username === username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ username }, process.env.JWT_SECRET || 'your_jwt_secret', {
            expiresIn: '1h',
        });

        res.json({ token });
    } catch (error) {
        res.status(400).json({ error });
    }
});

export default router;
