import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Upload, Send, Bot, User, FileText,
  CheckCircle2, AlertCircle, Loader2, Trash2
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE || '') + '/rag';


export default function App() {
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello! I'm your AI assistant. Upload a PDF or ask me anything to get started.", isAi: true }
  ]);
  const [input, setInput] = useState('');
  const [ingestMode, setIngestMode] = useState('file'); // 'file' or 'text'
  const [textInput, setTextInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState({ type: '', msg: '' });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef  = useRef(null);

  // auto-scroll only inside the messages container
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  /* ── File upload ── */
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setUploadStatus({ type: 'error', msg: 'Only PDF files are supported.' });
      return;
    }

    setUploading(true);
    setUploadStatus({ type: '', msg: '' });

    const form = new FormData();
    form.append('file', file);

    try {
      await axios.post(`${API_BASE}/upload-pdf`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadStatus({ type: 'success', msg: `"${file.name}" ingested!` });
      addMessage(`PDF "${file.name}" has been ingested. You may now ask questions about it.`, true);
    } catch {
      setUploadStatus({ type: 'error', msg: 'Upload failed. Is the backend running?' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* ── Text ingestion ── */
  const handleTextIngest = async () => {
    if (!textInput.trim() || uploading) return;

    setUploading(true);
    setUploadStatus({ type: '', msg: '' });

    try {
      await axios.post(`${API_BASE}/ingest`, textInput, {
        headers: { 'Content-Type': 'text/plain' }
      });
      setUploadStatus({ type: 'success', msg: 'Text context ingested!' });
      addMessage("The provided text has been ingested into the knowledge base.", true);
      setTextInput('');
    } catch {
      setUploadStatus({ type: 'error', msg: 'Ingestion failed.' });
    } finally {
      setUploading(false);
    }
  };

  /* ── Ask question ── */
  /* ── Ask question (Streaming) ── */
  const handleAsk = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    addMessage(question, false);
    setInput('');
    setLoading(true);

    // Initial AI message placeholder
    const aiMessageId = Date.now() + Math.random();
    setMessages(prev => [...prev, { id: aiMessageId, text: '', isAi: true }]);

    try {
      const response = await fetch(`${API_BASE}/ask?question=${encodeURIComponent(question)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: true });
        
        // Handle potential SSE format or raw stream
        const lines = chunk.split('\n');
        lines.forEach(line => {
          if (line.trim().startsWith('data:')) {
            const content = line.trim().substring(5);
            if (content) {
              setMessages(prev => prev.map(msg => 
                msg.id === aiMessageId ? { ...msg, text: msg.text + content } : msg
              ));
            }
          } else if (!line.trim().startsWith('data:') && line.trim().length > 0) {
            // Fallback for non-SSE formatted streams
            setMessages(prev => prev.map(msg => 
              msg.id === aiMessageId ? { ...msg, text: msg.text + line } : msg
            ));
          }
        });
      }
    } catch (err) {
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, text: 'Sorry, something went wrong. ' + err.message } 
          : msg
      ));
    } finally {
      setLoading(false);
    }
  };


  const addMessage = (text, isAi) =>
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), text, isAi }]);

  const clearChat = () =>
    setMessages([{ id: 1, text: "Chat cleared. Ask me anything!", isAi: true }]);

  return (
    <div className="app-container">

      {/* ── Header ── */}
      <header className="header">
        <h1>NexusDoc AI</h1>
        <p>Instant Insights from Your PDF Documents</p>
      </header>

      {/* ── Main two-column grid ── */}
      <main className="main-content">

        {/* ── LEFT: Knowledge Base ── */}
        <div className="card sidebar-card">
          <h2>
            <Upload size={20} style={{ color: 'var(--accent)' }} />
            Knowledge Base
          </h2>

          <div className="mode-toggle">
            <button 
              className={`mode-btn ${ingestMode === 'file' ? 'active' : ''}`}
              onClick={() => setIngestMode('file')}
            >
              PDF File
            </button>
            <button 
              className={`mode-btn ${ingestMode === 'text' ? 'active' : ''}`}
              onClick={() => setIngestMode('text')}
            >
              Raw Text
            </button>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', flexShrink: 0 }}>
            {ingestMode === 'file' 
              ? 'Upload PDF documents to build the AI\'s knowledge base.'
              : 'Paste manual text context for the AI to learn from.'}
          </p>

          {ingestMode === 'file' ? (
            /* Upload drop zone */
            <div className={`upload-area ${uploading ? 'dragging' : ''}`}>
              <input
                type="file"
                accept=".pdf"
                ref={fileInputRef}
                onChange={handleFile}
                disabled={uploading}
              />
              {uploading ? (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem' }}>
                  <Loader2 className="spin" size={32} style={{ color:'var(--accent)' }} />
                  <span style={{ fontSize:'0.85rem', color:'var(--text-muted)' }}>Ingesting document…</span>
                </div>
              ) : (
                <>
                  <FileText size={36} style={{ color:'var(--accent)', opacity:0.6, marginBottom:'0.5rem' }} />
                  <p style={{ fontSize:'0.9rem' }}>Click or drag to upload PDF</p>
                  <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'0.25rem' }}>Max 10 MB</p>
                </>
              )}
            </div>
          ) : (
            /* Text Ingestion Area */
            <div className="text-ingest-container">
              <textarea
                className="ingest-textarea"
                placeholder="Paste your text content here..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={uploading}
              ></textarea>
              <button 
                className="btn-ingest-text" 
                onClick={handleTextIngest}
                disabled={uploading || !textInput.trim()}
              >
                {uploading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                Ingest Text
              </button>
            </div>
          )}

          {/* Status */}
          {uploadStatus.msg && (
            <div className={`status ${uploadStatus.type}`}>
              {uploadStatus.type === 'success'
                ? <CheckCircle2 size={15} />
                : <AlertCircle size={15} />}
              {uploadStatus.msg}
            </div>
          )}

          {/* Clear chat – pushed to bottom via margin-top:auto in css */}
          <button className="btn-clear" onClick={clearChat}>
            <Trash2 size={16} />
            Clear Conversation
          </button>
        </div>


        {/* ── RIGHT: AI Chat ── */}
        <div className="card chat-card">
          <h2>
            <Bot size={20} style={{ color: 'var(--accent)' }} />
            AI Assistant
          </h2>

          {/* Scrollable messages – ONLY this section scrolls */}
          <div className="chat-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`message-row ${msg.isAi ? 'ai' : 'user'}`}>
                <div className="bubble-icon">
                  {msg.isAi ? <Bot size={14} /> : <User size={14} />}
                </div>
                <div className="bubble">{msg.text}</div>
              </div>
            ))}

            {loading && (
              <div className="typing-indicator">
                <Loader2 size={15} className="spin" />
                AI is thinking…
              </div>
            )}

            {/* Anchor for auto-scroll */}
            <div ref={messagesEndRef} />
          </div>

          {/* Fixed input bar – always visible */}
          <form className="chat-input-area" onSubmit={handleAsk}>
            <input
              className="chat-input"
              type="text"
              placeholder="Ask a question about your documents…"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
            />
            <button className="btn-ask" type="submit" disabled={!input.trim() || loading}>
              <Send size={16} />
              Ask
            </button>
          </form>
        </div>

      </main>

      <footer className="footer">
        Built with Spring AI · React · Vite &nbsp;|&nbsp; Next-Gen RAG Architecture
      </footer>
    </div>
  );
}
