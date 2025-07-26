import React, { useState } from 'react';
import { Button, Input } from '@mui/material';
import EditableTable from './EditableTable';
import axios from 'axios';
import { createHash } from 'crypto';

const ImageUpload = () => {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [transactionHashes, setTransactionHashes] = useState<Set<string>>(new Set());

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(event.target.files);
  };

  const categorizeTransaction = async (transaction: string) => {
    try {
      const res = await axios.post('/api/openrouter', {
        prompt: `Categorize the following transaction: "${transaction}". Possible categories are: Food, Transport, Shopping, Utilities, Entertainment, Health, Other.`,
      });
      return res.data.choices[0].message.content;
    } catch (error) {
      console.error('Error categorizing transaction:', error);
      return 'Other';
    }
  };

  const handleUpload = async () => {
    if (!selectedFiles) {
      return;
    }

    const formData = new FormData();
    for (let i = 0; i < selectedFiles.length; i++) {
      formData.append('images', selectedFiles[i]);
    }

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Upload successful:', data);

        const newTransactions: any[] = [];
        const newHashes = new Set(transactionHashes);

        for (const [index, text] of data.extractedData.entries()) {
          const transaction = text.split('\n')[0]; // a very basic parsing
          const amount = text.split('\n')[1];
          const hash = createHash('sha256').update(transaction + amount).digest('hex');

          if (!newHashes.has(hash)) {
            newHashes.add(hash);
            const category = await categorizeTransaction(transaction);
            newTransactions.push({
              id: extractedData.length + index,
              transaction,
              amount,
              category,
            });
          }
        }

        setExtractedData([...extractedData, ...newTransactions]);
        setTransactionHashes(newHashes);

      } else {
        console.error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading files:', error);
    }
  };

  const columns = [
    { id: 'transaction', label: 'Transaction' },
    { id: 'amount', label: 'Amount' },
    { id: 'category', label: 'Category' },
  ];

  return (
    <div>
      <Input
        type="file"
        inputProps={{ multiple: true, accept: 'image/*' }}
        onChange={handleFileChange}
      />
      <Button variant="contained" onClick={handleUpload} disabled={!selectedFiles}>
        Upload
      </Button>
      {extractedData.length > 0 && (
        <EditableTable initialData={extractedData} columns={columns} />
      )}
    </div>
  );
};

export default ImageUpload;
