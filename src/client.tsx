import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';

interface Message {
  id: string;
  text: string | { response: string } | any;
  timestamp: number;
  isAI?: boolean;
}

interface ChatInitResponse {
  id: string;
}

interface ChatResponse {
  messages: Message[];
}

interface AIResponse {
  response: string;
}

// Keyframe animations
const sparkle = keyframes`
  0%, 100% { opacity: 0; transform: scale(0); }
  50% { opacity: 1; transform: scale(1); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(255, 140, 0, 0.5); }
  50% { box-shadow: 0 0 40px rgba(255, 140, 0, 0.8), 0 0 60px rgba(255, 69, 0, 0.6); }
`;

const bounce = keyframes`
  0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-5px); }
  60% { transform: translateY(-3px); }
`;

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, 
    #ff8c00 0%, 
    #ff6347 25%, 
    #ffd700 50%, 
    #ff4500 75%, 
    #ff8c00 100%);
  background-size: 400% 400%;
  animation: gradientShift 8s ease infinite;
  font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  overflow: hidden;

  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: 
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.3) 2px, transparent 2px),
      radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.4) 1px, transparent 1px),
      radial-gradient(circle at 40% 60%, rgba(255, 215, 0, 0.3) 3px, transparent 3px),
      radial-gradient(circle at 90% 20%, rgba(255, 255, 255, 0.2) 2px, transparent 2px),
      radial-gradient(circle at 10% 80%, rgba(255, 140, 0, 0.3) 2px, transparent 2px);
    background-size: 100px 100px, 150px 150px, 200px 200px, 120px 120px, 180px 180px;
    animation: sparkleMove 15s linear infinite;
  }

  @keyframes sparkleMove {
    0% { transform: translateY(0px); }
    100% { transform: translateY(-100px); }
  }
`;

const Header = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  padding: 15px;
  text-align: center;
  border-bottom: 2px solid rgba(255, 140, 0, 0.3);
  position: relative;
  
  h1 {
    color: white;
    font-size: 2rem;
    font-weight: bold;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    margin: 0;
    animation: ${bounce} 2s ease-in-out infinite;
  }
  
  .subtitle {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.9rem;
    margin-top: 5px;
    font-weight: 500;
  }
`;

const ChatContainer = styled.div`
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 15px;
  position: relative;
  z-index: 1;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 140, 0, 0.6);
    border-radius: 4px;
  }
`;

const MessageBubble = styled.div<{ isAI?: boolean }>`
  background: ${props => props.isAI 
    ? 'linear-gradient(135deg, rgba(255, 140, 0, 0.9) 0%, rgba(255, 69, 0, 0.9) 100%)'
    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 248, 220, 0.95) 100%)'
  };
  padding: 15px 20px;
  border-radius: 25px;
  max-width: 75%;
  align-self: ${props => props.isAI ? 'flex-end' : 'flex-start'};
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  border: 2px solid ${props => props.isAI ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 140, 0, 0.3)'};
  position: relative;
  animation: ${float} 3s ease-in-out infinite;
  
  &::before {
    content: ${props => props.isAI ? "'🏈✨'" : "'🎤💛'"};
    position: absolute;
    top: -10px;
    ${props => props.isAI ? 'right: -10px;' : 'left: -10px;'}
    font-size: 1.2rem;
    animation: ${sparkle} 2s ease-in-out infinite;
  }

  &:hover {
    animation: ${glow} 1.5s ease-in-out infinite;
    transform: scale(1.02);
    transition: transform 0.2s ease;
  }
`;

const MessageContent = styled.div<{ isAI?: boolean }>`
  white-space: pre-wrap;
  word-break: break-word;
  color: ${props => props.isAI ? 'white' : '#333'};
  font-weight: ${props => props.isAI ? '500' : '400'};
  text-shadow: ${props => props.isAI ? '1px 1px 2px rgba(0, 0, 0, 0.3)' : 'none'};
  line-height: 1.4;
`;

const LoadingDots = styled.div`
  @keyframes pulse {
    0% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.2); }
    100% { opacity: 0.3; transform: scale(1); }
  }
  animation: pulse 1.5s ease-in-out infinite;
  display: inline-block;
  color: white;
  font-size: 1.2rem;
  font-weight: bold;
`;

const InputContainer = styled.div`
  padding: 20px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(15px);
  border-top: 2px solid rgba(255, 140, 0, 0.4);
  display: flex;
  gap: 12px;
  position: relative;
  z-index: 2;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, 
      rgba(255, 140, 0, 0.1) 0%, 
      rgba(255, 69, 0, 0.1) 50%, 
      rgba(255, 140, 0, 0.1) 100%);
    animation: shimmer 3s ease-in-out infinite;
  }

  @keyframes shimmer {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
`;

const Input = styled.input`
  flex: 1;
  padding: 15px 20px;
  border: 3px solid rgba(255, 140, 0, 0.6);
  border-radius: 25px;
  outline: none;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  font-weight: 500;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  position: relative;
  z-index: 3;
  
  &:focus {
    border-color: #ff4500;
    box-shadow: 0 0 20px rgba(255, 69, 0, 0.4);
    transform: scale(1.01);
    transition: all 0.3s ease;
  }

  &::placeholder {
    color: rgba(255, 140, 0, 0.7);
    font-style: italic;
  }
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  padding: 15px 25px;
  background: ${props => props.variant === 'secondary' 
    ? 'linear-gradient(135deg, rgba(255, 140, 0, 0.8) 0%, rgba(255, 69, 0, 0.8) 100%)'
    : 'linear-gradient(135deg, #ff4500 0%, #ff6347 50%, #ff8c00 100%)'
  };
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  position: relative;
  z-index: 3;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  &:hover {
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 6px 20px rgba(255, 69, 0, 0.4);
    animation: ${glow} 1s ease-in-out infinite;
  }

  &:active {
    transform: translateY(0) scale(1.02);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    animation: none;
  }
`;

const Footer = styled.footer`
  text-align: center;
  padding: 15px;
  background: rgba(0, 0, 0, 0.2);
  color: white;
  font-size: 14px;
  font-weight: 500;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
  position: relative;
  z-index: 2;

  .heart {
    color: #ff1493;
    animation: ${bounce} 1.5s ease-in-out infinite;
    display: inline-block;
    margin: 0 3px;
  }

  .bridge {
    color: #ffd700;
    font-weight: bold;
  }
`;

const FloatingEmoji = styled.div`
  position: absolute;
  font-size: 2rem;
  animation: floatUp 8s linear infinite;
  pointer-events: none;
  z-index: 0;

  @keyframes floatUp {
    0% {
      opacity: 0;
      transform: translateY(100vh) rotate(0deg);
    }
    10% {
      opacity: 1;
    }
    90% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(-100px) rotate(360deg);
    }
  }
`;

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatStateId, setChatStateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Initialize chat state
    fetch('/chat/init', { method: 'POST' })
      .then(res => res.json() as Promise<ChatInitResponse>)
      .then(data => {
        setChatStateId(data.id);
        return fetch(`/chat/${data.id}`);
      })
      .then(res => res.json() as Promise<ChatResponse>)
      .then(data => setMessages(data.messages))
      .catch(console.error);
  }, []);

  // Floating emojis effect
  useEffect(() => {
    const emojis = ['🏈', '✨', '🎤', '💛', '🧡', '⭐', '🔥', '💫', '🏆', '🎵'];
    const interval = setInterval(() => {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const left = Math.random() * 90 + 5; // 5% to 95%
      const delay = Math.random() * 2; // 0 to 2 seconds
      
      const emojiElement = document.createElement('div');
      emojiElement.textContent = emoji;
      emojiElement.style.cssText = `
        position: absolute;
        left: ${left}%;
        font-size: 2rem;
        animation: floatUp 8s linear infinite;
        animation-delay: ${delay}s;
        pointer-events: none;
        z-index: 0;
      `;
      
      document.body.appendChild(emojiElement);
      
      setTimeout(() => {
        document.body.removeChild(emojiElement);
      }, 8000 + delay * 1000);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const sendMessage = async () => {
    if (!newMessage.trim() || !chatStateId) return;

    try {
      setIsLoading(true);
      const userMessage: Message = {
        id: crypto.randomUUID(),
        text: newMessage,
        timestamp: Date.now(),
        isAI: false
      };
      
      // Add user message immediately
      setMessages(prev => [...prev, userMessage]);
      setNewMessage('');

      console.log('Sending message:', newMessage);
      const response = await fetch(`/chat/${chatStateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMessage }),
      });
      const data = await response.json() as { messages: Message[] };
      console.log('Raw response data:', data);
      
      if (data.messages && Array.isArray(data.messages)) {
        // Only add the AI message (skip the user message since we already added it)
        const aiMessage = data.messages[1];
        if (aiMessage) {
          setMessages(prev => [...prev, aiMessage]);
        }
      } else {
        console.error('Invalid response format:', data);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = async () => {
    if (!chatStateId) return;

    try {
      await fetch(`/chat/${chatStateId}`, { method: 'DELETE' });
      setMessages([]);
    } catch (error) {
      console.error('Error clearing chat:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  return (
    <AppContainer>
      <Header>
        <h1>🏈 Taylor & Travis Chat ✨</h1>
        <div className="subtitle">Chat with the New Heights podcast & GQ insights!</div>
      </Header>
      
      <ChatContainer>
        {messages.map(message => {
          let content: string;
          if (typeof message.text === 'string') {
            content = message.text;
          } else if (message.text && typeof message.text === 'object') {
            const obj = message.text as any;
            if (obj.response) {
              content = obj.response;
            } else if (obj.text) {
              content = obj.text;
            } else if (obj.message) {
              content = obj.message;
            } else {
              content = JSON.stringify(obj);
            }
          } else {
            content = String(message.text);
          }
          
          return (
            <MessageBubble key={message.id} isAI={message.isAI}>
              <MessageContent isAI={message.isAI}>{content}</MessageContent>
            </MessageBubble>
          );
        })}
        {isLoading && (
          <MessageBubble isAI>
            <MessageContent isAI>
              <LoadingDots>🏈 Thinking like a champion... ✨</LoadingDots>
            </MessageContent>
          </MessageBubble>
        )}
      </ChatContainer>
      
      <InputContainer>
        <Input
          value={newMessage}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Ask about Taylor, Travis, football, or New Heights... 🎤🏈"
          disabled={isLoading}
        />
        <Button onClick={sendMessage} disabled={isLoading}>
          Send 🚀
        </Button>
        <Button variant="secondary" onClick={clearChat} disabled={isLoading}>
          Clear 🗑️
        </Button>
      </InputContainer>
      
      <Footer>
        made with <span className="heart">❤️</span> in SF<span className="bridge">🌉</span> w/ Cloudflare <a href="https://developers.cloudflare.com/autorag/">AutoRAG</a>, <a href="https://developers.cloudflare.com/durable-objects/get-started/">Durable Objects</a>, <a href="https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/">OpenAI-OSS-120b</a> on Workers AI. Code on GitHub <a href="https://github.com/elizabethsiegle/chat-w-taylor-on-newheights-and-travis-gq-autorag-openaioss.git">here</a>
      </Footer>
    </AppContainer>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}