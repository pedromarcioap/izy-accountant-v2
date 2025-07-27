import React from 'react';
import './App.css';
import ImageUpload from './components/ImageUpload';
import AiChat from './components/AiChat';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Card Statement Uploader</h1>
      </header>
      <main>
        <ImageUpload />
        <AiChat />
      </main>
    </div>
  );
}

export default App;
