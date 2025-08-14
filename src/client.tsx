import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import styled from '@emotion/styled';

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

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, #ff8c00 0%, #ff6347 50%, #ffd700 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`;

const Header = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  padding: 20px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  
  h1 {
    color: white;
    font-size: 1.8rem;
    font-weight: 700;
    margin: 0 0 5px 0;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  }
  
  .subtitle {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .jersey-numbers {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    gap: 8px;
  }

  .jersey-number {
    background: #dc143c;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .taylor-thirteen {
    background: #ffd700;
    color: #333;
  }
`;

const IntroSection = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  padding: 16px 20px;
  margin: 16px 20px 0 20px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);

  h3 {
    color: white;
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 8px 0;
    text-align: center;
  }

  p {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.9rem;
    line-height: 1.4;
    margin: 0 0 12px 0;
    text-align: center;
  }

  .source-links {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .source-link {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    padding: 6px 12px;
    border-radius: 16px;
    text-decoration: none;
    font-weight: 500;
    font-size: 0.85rem;
    transition: background-color 0.2s ease;
    border: 1px solid rgba(255, 255, 255, 0.3);

    &:hover {
      background: rgba(255, 255, 255, 0.3);
      text-decoration: none;
      color: white;
    }
  }
`;

const ChatContainer = styled.div`
  flex: 1;
  padding: 16px 20px 20px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }
`;

const MessageBubble = styled.div<{ isAI?: boolean }>`
  background: ${props => props.isAI 
    ? 'rgba(220, 20, 60, 0.9)'
    : 'rgba(255, 255, 255, 0.95)'
  };
  padding: 12px 16px;
  border-radius: 18px;
  max-width: 75%;
  align-self: ${props => props.isAI ? 'flex-end' : 'flex-start'};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid ${props => props.isAI 
    ? 'rgba(255, 255, 255, 0.2)' 
    : 'rgba(0, 0, 0, 0.1)'
  };
`;

const MessageContent = styled.div<{ isAI?: boolean }>`
  color: ${props => props.isAI ? 'white' : '#333'};
  font-size: 0.95rem;
  line-height: 1.4;
  word-break: break-word;
`;

const LoadingMessage = styled(MessageBubble)`
  background: rgba(220, 20, 60, 0.9);
  align-self: flex-end;
  
  .loading-text {
    color: white;
    font-size: 0.95rem;
    
    &::after {
      content: '...';
      animation: dots 1.5s steps(4, end) infinite;
    }
  }

  @keyframes dots {
    0%, 20% { color: rgba(255, 255, 255, 0.4); }
    40% { color: white; }
    100% { color: rgba(255, 255, 255, 0.4); }
  }
`;

const InputContainer = styled.div`
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  gap: 10px;
`;

const Input = styled.input`
  flex: 1;
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  outline: none;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  
  &:focus {
    border-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
  }

  &::placeholder {
    color: rgba(0, 0, 0, 0.5);
  }
`;

const Button = styled.button<{ variant?: 'secondary' }>`
  padding: 12px 20px;
  background: ${props => props.variant === 'secondary' 
    ? 'rgba(255, 140, 0, 0.8)'
    : '#dc143c'
  };
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  transition: opacity 0.2s ease;
  
  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Footer = styled.footer`
  position: sticky;
  bottom: 0;
  text-align: center;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  color: white;
  font-size: 13px;
  font-weight: 500;
  border-top: 1px solid rgba(255, 255, 255, 0.1);

  .heart {
    color: #ff1493;
    margin: 0 2px;
  }

  .bridge {
    color: #ffd700;
    font-weight: 600;
  }
`;



const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatStateId, setChatStateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
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
      
      setMessages(prev => [...prev, userMessage]);
      setNewMessage('');

      const response = await fetch(`/chat/${chatStateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMessage }),
      });
      const data = await response.json() as { messages: Message[] };
      
      if (data.messages && Array.isArray(data.messages)) {
        const aiMessage = data.messages[1];
        if (aiMessage) {
          setMessages(prev => [...prev, aiMessage]);
        }
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
        <div className="jersey-numbers">
          <div className="jersey-number taylor-thirteen">13</div>
          <div className="jersey-number">12</div>
        </div>
        <h1>🏈 Chat w/ the Taylor Swift New Heights podcast and Travis GQ article ✨</h1>
        <div className="subtitle">✨ "It's a loaf story, baby just say yeast" to New Heights insights! 🏈</div>
      </Header>

      <IntroSection>
        <h3>Chat w/ the Sources</h3>
        <p>
        Ask a LLM anything about Taylor Swift's appearance on the New Heights podcast on August 12, 2025 or Travis Kelce's GQ interview! 
        I have access to both transcripts and can share insights about their conversations.
        </p>
        <div className="source-links">
          <a href="/transcript" className="source-link" target="_blank">
           New Heights Transcript (2 hour long!)🎤
          </a>
          <a href="/gq-article" className="source-link" target="_blank">
            Travis GQ Interview Article  📰 
          </a>
        </div>
      </IntroSection>
      
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
          <LoadingMessage isAI>
            <div className="loading-text">Thinking</div>
          </LoadingMessage>
        )}
      </ChatContainer>
      
      <InputContainer>
        <Input
          value={newMessage}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Ask about key quotes from the Taylor Swift New Heights podcast or Travis GQ article..."
          disabled={isLoading}
        />
        <Button onClick={sendMessage} disabled={isLoading}>
          Send
        </Button>
        <Button variant="secondary" onClick={clearChat} disabled={isLoading}>
          Clear
        </Button>
      </InputContainer>
      
      <Footer>
      <strong>made with <span className="heart">❤️</span> in SF<span className="bridge">🌉</span> w/ <span className="cloudflare-ref">Cloudflare <a href="https://developers.cloudflare.com/autorag/">AutoRAG</a>, <a href="https://developers.cloudflare.com/durable-objects/get-started/">Durable Objects</a>, <a href="https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/">OpenAI-OSS-120b</a> on Workers AI, <a href="https://developers.cloudflare.com/browser-rendering">Browser Rendering</a>, and <a href="https://developers.cloudflare.com/r2/">R2</a></span>. Code on GitHub <a href="https://github.com/elizabethsiegle/chat-w-taylor-on-newheights-and-travis-gq-autorag-openaioss.git">here</a></strong>
      </Footer>
    </AppContainer>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}