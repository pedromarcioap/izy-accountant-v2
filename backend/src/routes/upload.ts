import express from 'express';
import multer from 'multer';
import Tesseract from 'tesseract.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.array('images'), async (req, res) => {
    try {
        if (!req.files) {
            return res.status(400).json({ error: 'No files were uploaded.' });
        }

        const files = req.files as Express.Multer.File[];
        const extractedData = [];

        for (const file of files) {
            const { data: { text } } = await Tesseract.recognize(file.path, 'eng');
            extractedData.push(text);
        }

        res.json({ extractedData });
    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).json({ error: 'Error processing files' });
    }
});

export default router;
