import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, User, Bot } from 'lucide-react';
import { createChatSession, sendMessageToChat } from '../services/geminiService';
import { ChatMessage } from '../types';
import { Chat } from "@google/genai";

interface ChatBotProps {
  variant?: 'floating' | 'embedded';
}

export const ChatBot: React.FC<ChatBotProps> = ({ variant = 'floating' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Olá! Sou o assistente virtual da EntregaFast. Como posso ajudar você hoje?', timestamp: Date.now() }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatSessionRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isEmbedded = variant === 'embedded';

  useEffect(() => {
    // Initialize chat session on mount
    chatSessionRef.current = createChatSession();
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, isEmbedded]);

  const handleSend = async () => {
    if (!inputText.trim() || !chatSessionRef.current || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const responseText = await sendMessageToChat(chatSessionRef.current, userMsg.text);
      setMessages(prev => [...prev, { role: 'model', text: responseText, timestamp: Date.now() }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', text: "Desculpe, tive um problema ao processar sua mensagem.", timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // If embedded, we treat it as always "open" conceptually, 
  // but we render a different container structure.
  if (isEmbedded) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <div className="bg-purple-600 p-4 text-white flex justify-between items-center shadow-md shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={24} />
            <h3 className="font-bold text-lg">Central de Ajuda IA</h3>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`max-w-[85%] p-3 rounded-xl text-sm shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white self-end rounded-br-none'
                    : 'bg-white border border-gray-100 text-gray-800 self-start rounded-bl-none'
                }`}
              >
                <div className={`flex items-center gap-1 mb-1 opacity-70 text-[10px] font-bold uppercase ${msg.role === 'user' ? 'text-purple-100' : 'text-gray-400'}`}>
                  {msg.role === 'user' ? <User size={10} /> : <Bot size={10} />}
                  {msg.role === 'user' ? 'Você' : 'Assistente'}
                </div>
                {msg.text}
              </div>
            ))}
            {isLoading && (
              <div className="self-start bg-white p-3 rounded-xl rounded-bl-none border border-gray-100 shadow-sm">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-t border-gray-200 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Digite sua dúvida..."
                className="flex-1 bg-gray-100 border-0 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isLoading}
                className="bg-purple-600 text-white p-3 rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-purple-200"
              >
                <Send size={20} />
              </button>
            </div>
        </div>
      </div>
    );
  }

  // FLOATING VARIANT (Original)
  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 p-4 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 transition-all z-50 flex items-center justify-center"
          aria-label="Abrir Chat"
        >
          <MessageCircle size={28} />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden" style={{ maxHeight: 'calc(100vh - 100px)', height: '500px' }}>
          <div className="bg-purple-600 p-4 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Bot size={20} />
              <h3 className="font-semibold">Suporte IA</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-purple-700 p-1 rounded transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col gap-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`max-w-[85%] p-3 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? 'bg-purple-100 text-purple-900 self-end rounded-br-none'
                    : 'bg-white border border-gray-200 text-gray-800 self-start rounded-bl-none'
                }`}
              >
                <div className="flex items-center gap-1 mb-1 opacity-50 text-xs font-medium">
                  {msg.role === 'user' ? <User size={10} /> : <Bot size={10} />}
                  {msg.role === 'user' ? 'Você' : 'Assistente'}
                </div>
                {msg.text}
              </div>
            ))}
            {isLoading && (
              <div className="self-start bg-gray-100 p-3 rounded-lg rounded-bl-none">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t bg-white flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Digite sua dúvida..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};