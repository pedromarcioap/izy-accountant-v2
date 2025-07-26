import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Button,
} from '@mui/material';
import * as XLSX from 'sheetjs-style';

interface Row {
  id: number;
  [key: string]: any;
}

interface EditableTableProps {
  initialData: Row[];
  columns: { id: string; label: string }[];
}

const EditableTable: React.FC<EditableTableProps> = ({ initialData, columns }) => {
  const [data, setData] = useState(initialData);

  const handleCellChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    rowId: number,
    columnId: string
  ) => {
    const newData = data.map((row) =>
      row.id === rowId ? { ...row, [columnId]: e.target.value } : row
    );
    setData(newData);
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, 'transactions.xlsx');
  };

  return (
    <div>
      <Button variant="contained" onClick={handleExport} style={{ marginBottom: '10px' }}>
        Export to XLSX
      </Button>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.id}>{column.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                {columns.map((column) => (
                  <TableCell key={column.id}>
                    <TextField
                      value={row[column.id] || ''}
                      onChange={(e) => handleCellChange(e, row.id, column.id)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

export default EditableTable;
