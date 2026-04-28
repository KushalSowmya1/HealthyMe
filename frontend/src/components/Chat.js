import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from './AppShell';
import { sendChatMessage } from '../services/api';

export default function Chat() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState([
    {
      role: 'bot',
      text: 'HealthyMe Pro is ready. Ask about sleep, water, exercise, calories, or healthy routines.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!message.trim()) {
      setError('Please type a message first.');
      return;
    }

    const currentMessage = message.trim();
    setLoading(true);
    setError('');

    try {
      const response = await sendChatMessage(currentMessage);
      setConversation((current) => [
        ...current,
        { role: 'user', text: currentMessage },
        { role: 'bot', text: response.response || 'No data available' },
      ]);
      setMessage('');
    } catch (submitError) {
      if (submitError.message === 'Missing authentication token') {
        navigate('/login');
        return;
      }
      setError(submitError.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell
      title="Health Chatbot"
      subtitle="Use the built-in assistant for quick lifestyle guidance based on your health topics."
    >
      <section className="panel-card">
        <div className="chat-window">
          {conversation.length === 0 ? <div className="empty-state">No data available</div> : null}
          {conversation.map((entry, index) => (
            <div key={`${entry.role}-${index}`} className={`chat-bubble ${entry.role}`}>
              {entry.text}
            </div>
          ))}
          {loading ? <div className="chat-bubble bot">Loading...</div> : null}
        </div>

        <form className="chat-form" onSubmit={handleSubmit}>
          <input
            className="chat-input"
            type="text"
            placeholder="Ask a health question"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button className="primary-btn" type="submit" disabled={loading}>
            Send
          </button>
        </form>

        <span className={`status-text ${error ? 'error-text' : ''}`}>{error || ' '}</span>
      </section>
    </AppShell>
  );
}
