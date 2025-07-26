import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, addDoc, deleteDoc, doc, writeBatch, getDocs, where } from 'firebase/firestore';

// Define Firebase configuration and app ID (provided by the environment)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// URL do seu servidor backend.
// Se estiver rodando localmente, será algo como 'http://localhost:3001'.
// Em produção, será o domínio do seu servidor.
const BACKEND_URL = 'http://localhost:3001'; // Altere para a URL do seu servidor em produção

// Initialize Firebase (will be done once inside useEffect)
let app;
let db;
let auth;

// Main App component
const App = () => {
    // State variables
    const [statementText, setStatementText] = useState(''); // Text from the statement
    const [expenses, setExpenses] = useState([]); // List of extracted expenses
    const [totalExpenses, setTotalExpenses] = useState(0); // Total sum of expenses
    const [userId, setUserId] = useState(null); // Current user ID
    const [isAuthReady, setIsAuthReady] = useState(false); // Flag to check if Firebase auth is ready
    const [message, setMessage] = useState(''); // User feedback messages
    const [isLoading, setIsLoading] = useState(false); // Loading state for image processing or AI categorization

    // State for month/year selection
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // Current month (1-12)
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()); // Current year

    // Initialize Firebase and set up authentication listener
    useEffect(() => {
        try {
            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);

            // Sign in anonymously or with custom token
            const signIn = async () => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Erro ao autenticar no Firebase:", error);
                    setMessage("Erro ao conectar ao sistema de armazenamento.");
                }
            };

            // Listen for auth state changes
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                if (user) {
                    setUserId(user.uid);
                    setMessage("Conectado ao sistema de armazenamento.");
                } else {
                    setUserId(null);
                    setMessage("Não autenticado. Não é possível acessar despesas salvas.");
                }
                setIsAuthReady(true); // Auth state has been checked
            });

            signIn(); // Call sign-in
            return () => unsubscribe(); // Cleanup auth listener
        } catch (error) {
            console.error("Erro ao inicializar Firebase:", error);
            setMessage("Erro ao inicializar o Firebase. Verifique a configuração.");
        }
    }, []);

    // Load expenses from Firestore when auth is ready, userId is set, and month/year change
    useEffect(() => {
        if (isAuthReady && userId) {
            const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/expenses`);
            const monthYearFilter = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
            const q = query(expensesCollectionRef, where("monthYear", "==", monthYearFilter));

            // Set up real-time listener for expenses
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const loadedExpenses = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setExpenses(loadedExpenses);
                calculateTotal(loadedExpenses);
            }, (error) => {
                console.error("Erro ao carregar despesas:", error);
                setMessage("Erro ao carregar despesas. Tente novamente.");
            });

            return () => unsubscribe(); // Cleanup snapshot listener
        } else {
            setExpenses([]); // Clear expenses if not authenticated or no userId
            setTotalExpenses(0);
        }
    }, [isAuthReady, userId, selectedMonth, selectedYear]); // Re-run when month/year changes

    // Function to calculate the total expenses
    const calculateTotal = (currentExpenses) => {
        const total = currentExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
        setTotalExpenses(total);
    };

    // Function to categorize an expense using your backend API
    const categorizeExpense = async (description) => {
        try {
            const response = await fetch(`${BACKEND_URL}/categorize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ description: description })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`Erro ao categorizar despesa via backend: Status ${response.status}, Erro: ${errorData.error}`);
                setMessage(`Erro ao categorizar: ${errorData.error || 'Erro desconhecido'}`);
                return "Não categorizado";
            }

            const result = await response.json();
            return result.category || "Não categorizado";

        } catch (error) {
            console.error("Erro ao chamar o backend para categorização:", error);
            setMessage("Erro ao conectar com o servidor de categorização.");
            return "Não categorizado";
        }
    };

    // Function to check for duplicate expenses
    const isDuplicateExpense = async (description, amount, monthYear) => {
        const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/expenses`);
        const q = query(
            expensesCollectionRef,
            where("description", "==", description),
            where("amount", "==", amount),
            where("monthYear", "==", monthYear)
        );
        const snapshot = await getDocs(q);
        return !snapshot.empty; // If snapshot is not empty, a duplicate exists
    };

    // Function to process the statement text and extract expenses
    const processStatement = async (textToProcess) => {
        if (!userId) {
            setMessage("Aguarde a conexão com o sistema de armazenamento ou autentique-se.");
            return;
        }

        setIsLoading(true);
        setMessage("Processando despesas e categorizando com IA...");

        const lines = textToProcess.split('\n');
        const newExpenses = [];
        const monthYear = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

        // Regex to find potential expense lines:
        const expenseRegex = /^(.*?)\s+([\d.,]+)(?:\s+(?:no crédito|no debito|no débito|no credito))?$/i;

        // Keywords to identify and exclude total lines
        const totalKeywords = [
            /COMPRAS À VISTA/i, /EM PROCESSAMENTO/i, /PAGAR FATURA/i, /TOTAL/i,
            /SALDO/i, /CRÉDITO/i, /DÉBITO/i, /VALOR TOTAL/i
        ];

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue; // Skip empty lines

            // Check if the line contains any total keywords
            const isTotalLine = totalKeywords.some(keyword => keyword.test(trimmedLine));
            if (isTotalLine) {
                console.log("Ignorando linha de total:", trimmedLine);
                continue; // Skip lines identified as totals
            }

            const match = trimmedLine.match(expenseRegex);
            if (match) {
                let description = match[1].trim();
                let amountStr = match[2].replace('.', '').replace(',', '.'); // Convert to dot decimal

                // Try to clean up description if it contains dates or card numbers
                description = description.replace(/\d{2}\/\d{2}\/\d{4}(?:\s+às\s+\d{2}:\d{2}:\d{2})?/, ''); // Remove dates like 19/07/2025 às 12:25:19
                description = description.replace(/Ourocard Elo Nanquim \d{4}/, ''); // Remove card number reference
                description = description.replace(/Br$/, '').trim(); // Remove "Br" at the end if present
                description = description.replace(/Palmas|Porto|Osasco|Sao|Taquarucu/i, '').trim(); // Remove cities if present

                const amount = parseFloat(amountStr);

                if (!isNaN(amount) && amount > 0) {
                    // Check for duplicate before categorizing and adding
                    const isDuplicate = await isDuplicateExpense(description, amount, monthYear);
                    if (isDuplicate) {
                        console.log(`Despesa duplicada ignorada: ${description} ${amount}`);
                        continue;
                    }

                    const category = await categorizeExpense(description); // Categorize with AI via backend

                    newExpenses.push({
                        description: description,
                        amount: amount,
                        category: category,
                        monthYear: monthYear, // Add month and year to expense
                        timestamp: new Date() // Add timestamp for ordering
                    });
                }
            }
        }

        if (newExpenses.length > 0) {
            try {
                const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/expenses`);
                const batch = writeBatch(db); // Use batch for efficient writes
                newExpenses.forEach(expense => {
                    const docRef = doc(expensesCollectionRef); // Auto-generate ID
                    batch.set(docRef, expense);
                });
                await batch.commit();

                setMessage(`Extrato processado e ${newExpenses.length} despesa(s) adicionada(s)!`);
                setStatementText(''); // Clear textarea after processing
            } catch (error) {
                console.error("Erro ao salvar despesas no Firestore:", error);
                setMessage("Erro ao salvar despesas. Tente novamente.");
            }
        } else {
            setMessage("Nenhuma despesa válida encontrada ou todas são duplicadas.");
        }
        setIsLoading(false);
    };

    // Function to handle image upload and OCR for multiple files
    const handleImageUpload = async (event) => {
        const files = Array.from(event.target.files); // Convert FileList to Array
        if (files.length === 0) return;

        setIsLoading(true);
        setMessage(`Processando ${files.length} imagem(ns)... Isso pode levar alguns segundos.`);

        let combinedExtractedText = '';

        for (const file of files) {
            await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64ImageData = reader.result.split(',')[1]; // Get base64 string without prefix

                    try {
                        // Call Gemini API for image understanding
                        const prompt = "Extraia todas as transações de despesas desta imagem. Para cada transação, forneça a descrição e o valor. Ignore quaisquer linhas que representem totais, saldos, pagamentos de fatura ou valores em processamento. Formate a saída como uma lista de linhas, onde cada linha é 'Descrição Valor'. Por exemplo: 'DL Panificadora 63,50'.";
                        let chatHistory = [];
                        chatHistory.push({ role: "user", parts: [{ text: prompt }] });

                        const payload = {
                            contents: [
                                {
                                    role: "user",
                                    parts: [
                                        { text: prompt },
                                        {
                                            inlineData: {
                                                mimeType: file.type,
                                                data: base64ImageData
                                            }
                                        }
                                    ]
                                }
                            ],
                        };

                        const apiKey = ""; // Canvas will automatically provide it in runtime
                        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            console.error(`Erro na resposta da API Gemini para ${file.name}: Status ${response.status}, Resposta: ${errorText}`);
                            setMessage(`Erro ao processar imagem ${file.name}: ${response.statusText || 'Erro desconhecido'}.`);
                            resolve();
                            return;
                        }

                        let result;
                        try {
                            result = await response.json();
                        } catch (jsonError) {
                            console.error(`Erro ao analisar JSON da API Gemini para ${file.name}:`, jsonError);
                            const rawResponseText = await response.text();
                            console.error(`Resposta bruta:`, rawResponseText);
                            setMessage(`Erro ao analisar resposta da API para ${file.name}.`);
                            resolve();
                            return;
                        }

                        if (result.candidates && result.candidates.length > 0 &&
                            result.candidates[0].content && result.candidates[0].content.parts &&
                            result.candidates[0].content.parts.length > 0) {
                            const extractedText = result.candidates[0].content.parts[0].text;
                            combinedExtractedText += (combinedExtractedText ? '\n' : '') + extractedText;
                        } else {
                            setMessage(`Não foi possível extrair texto da imagem ${file.name}. Tente uma imagem mais clara.`);
                        }
                    } catch (error) {
                        console.error(`Erro ao processar imagem ${file.name} com Gemini API:`, error);
                        setMessage(`Erro ao processar imagem ${file.name}. Verifique o console para mais detalhes.`);
                    } finally {
                        resolve();
                    }
                };
                reader.readAsDataURL(file);
            });
        }
        setStatementText(combinedExtractedText); // Set the combined text to the textarea
        await processStatement(combinedExtractedText); // Process the combined text
        setIsLoading(false);
    };


    // Function to delete an expense
    const deleteExpense = async (id) => {
        if (!userId) {
            setMessage("Aguarde a conexão com o sistema de armazenamento ou autentique-se.");
            return;
        }
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/expenses`, id));
            setMessage("Despesa removida!");
        } catch (error) {
            console.error("Erro ao remover despesa:", error);
            setMessage("Erro ao remover despesa. Tente novamente.");
        }
    };

    // Function to clear all expenses for the selected month
    const clearAllExpenses = async () => {
        if (!userId) {
            setMessage("Aguarde a conexão com o sistema de armazenamento ou autentique-se.");
            return;
        }
        try {
            const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/expenses`);
            const monthYearFilter = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
            const q = query(expensesCollectionRef, where("monthYear", "==", monthYearFilter));
            const snapshot = await getDocs(q);

            const batch = writeBatch(db);
            snapshot.docs.forEach((d) => {
                batch.delete(d.ref);
            });
            await batch.commit();

            setMessage(`Todas as despesas para ${monthYearFilter} foram limpas!`);
        } catch (error) {
            console.error("Erro ao limpar todas as despesas:", error);
            setMessage("Erro ao limpar todas as despesas. Tente novamente.");
        }
    };

    // Helper to format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
    };

    // Function to export expenses to CSV
    const exportData = () => {
        if (expenses.length === 0) {
            setMessage("Não há dados para exportar.");
            return;
        }

        const headers = ["Descrição", "Categoria", "Valor", "Mês/Ano"];
        const rows = expenses.map(expense => [
            `"${expense.description.replace(/"/g, '""')}"`, // Escape double quotes
            `"${expense.category.replace(/"/g, '""')}"`,
            expense.amount.toFixed(2).replace('.', ','), // Use comma for decimal for PT-BR CSV
            expense.monthYear
        ]);

        const csvContent = [
            headers.join(";"), // Use semicolon as separator for PT-BR CSV
            ...rows.map(e => e.join(";"))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `despesas_${selectedYear}-${String(selectedMonth).padStart(2, '0')}.csv`);
        link.click();
        setMessage("Dados exportados com sucesso!");
    };


    const months = [
        { value: 1, label: 'Janeiro' }, { value: 2, label: 'Fevereiro' },
        { value: 3, label: 'Março' }, { value: 4, label: 'Abril' },
        { value: 5, label: 'Maio' }, { value: 6, label: 'Junho' },
        { value: 7, label: 'Julho' }, { value: 8, label: 'Agosto' },
        { value: 9, label: 'Setembro' }, { value: 10, label: 'Outubro' },
        { value: 11, label: 'Novembro' }, { value: 12, label: 'Dezembro' },
    ];

    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i); // Last 5 years, current, next 4

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 font-sans">
            <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-2xl">
                <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">Gerenciador de Despesas</h1>

                {/* User ID display for multi-user context */}
                {userId && (
                    <div className="text-sm text-gray-600 mb-4 text-center">
                        ID do Usuário: <span className="font-mono bg-gray-200 px-2 py-1 rounded">{userId}</span>
                    </div>
                )}

                {/* Message display */}
                {message && (
                    <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded relative mb-4" role="alert">
                        <span className="block sm:inline">{message}</span>
                    </div>
                )}

                {/* Month and Year Selector */}
                <div className="flex justify-center space-x-4 mb-6">
                    <div>
                        <label htmlFor="month-select" className="block text-gray-700 text-sm font-bold mb-2">
                            Mês de Referência:
                        </label>
                        <select
                            id="month-select"
                            className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            disabled={isLoading}
                        >
                            {months.map(month => (
                                <option key={month.value} value={month.value}>{month.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="year-select" className="block text-gray-700 text-sm font-bold mb-2">
                            Ano de Referência:
                        </label>
                        <select
                            id="year-select"
                            className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            disabled={isLoading}
                        >
                            {years.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Image Upload Input */}
                <div className="mb-6">
                    <label htmlFor="image-upload" className="block text-gray-700 text-sm font-bold mb-2">
                        Envie uma ou mais imagens do seu extrato:
                    </label>
                    <input
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        multiple // Allow multiple file selection
                        onChange={handleImageUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        disabled={isLoading || !isAuthReady}
                    />
                    {isLoading && (
                        <div className="flex items-center justify-center mt-4 text-blue-600">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processando...
                        </div>
                    )}
                </div>

                {/* Statement Input */}
                <div className="mb-6">
                    <label htmlFor="statement" className="block text-gray-700 text-sm font-bold mb-2">
                        Ou cole o texto do seu extrato aqui:
                    </label>
                    <textarea
                        id="statement"
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline h-40 resize-y"
                        placeholder="Ex: DL Panificadora Br Palmas 63,50 no crédito&#10;Acaiteriacom Porto 44,50 no crédito&#10;COMPRAS À VISTA R$ 2.115,47"
                        value={statementText}
                        onChange={(e) => setStatementText(e.target.value)}
                        disabled={isLoading}
                    ></textarea>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-center space-x-4 mb-6">
                    <button
                        onClick={() => processStatement(statementText)}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full focus:outline-none focus:shadow-outline transition duration-300 ease-in-out transform hover:scale-105"
                        disabled={!isAuthReady || isLoading || !statementText.trim()}
                    >
                        Processar Texto
                    </button>
                    <button
                        onClick={clearAllExpenses}
                        className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-full focus:outline-none focus:shadow-outline transition duration-300 ease-in-out transform hover:scale-105"
                        disabled={!isAuthReady || isLoading || expenses.length === 0}
                    >
                        Limpar Despesas do Mês
                    </button>
                    <button
                        onClick={exportData}
                        className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-full focus:outline-none focus:shadow-outline transition duration-300 ease-in-out transform hover:scale-105"
                        disabled={!isAuthReady || isLoading || expenses.length === 0}
                    >
                        Exportar Dados
                    </button>
                </div>

                {/* Expenses Table */}
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Despesas Detalhadas ({months.find(m => m.value === selectedMonth)?.label} de {selectedYear})</h2>
                    {expenses.length === 0 ? (
                        <p className="text-gray-600 text-center">Nenhuma despesa adicionada para este mês ainda.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg shadow">
                            <table className="min-w-full bg-white border border-gray-200">
                                <thead>
                                    <tr className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                        <th className="py-3 px-6 text-left">Descrição</th>
                                        <th className="py-3 px-6 text-left">Categoria</th>
                                        <th className="py-3 px-6 text-right">Valor</th>
                                        <th className="py-3 px-6 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-700 text-sm">
                                    {expenses
                                        .sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0)) // Sort by timestamp descending
                                        .map((expense) => (
                                            <tr key={expense.id} className="border-b border-gray-200 hover:bg-gray-100">
                                                <td className="py-3 px-6 text-left whitespace-nowrap">{expense.description}</td>
                                                <td className="py-3 px-6 text-left">{expense.category}</td>
                                                <td className="py-3 px-6 text-right">{formatCurrency(expense.amount)}</td>
                                                <td className="py-3 px-6 text-center">
                                                    <button
                                                        onClick={() => deleteExpense(expense.id)}
                                                        className="text-red-600 hover:text-red-800 font-bold py-1 px-2 rounded-full transition duration-300 ease-in-out"
                                                    >
                                                        Remover
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Total Expenses */}
                <div className="text-center mt-8 p-4 bg-blue-50 rounded-lg shadow-inner">
                    <h2 className="text-2xl font-bold text-blue-800">
                        Total de Despesas: <span className="text-blue-600">{formatCurrency(totalExpenses)}</span>
                    </h2>
                </div>
            </div>
            {/* Tailwind CSS Script */}
            <script src="https://cdn.tailwindcss.com"></script>
            {/* Inter Font */}
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
            <style>
                {`
                body {
                    font-family: 'Inter', sans-serif;
                }
                `}
            </style>
        </div>
    );
};

export default App;
