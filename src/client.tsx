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
  background: linear-gradient(135deg, #0a1628 0%, #0d2b5e 50%, #1a3a6b 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: 
      radial-gradient(circle at 20% 30%, rgba(74, 158, 255, 0.2) 2px, transparent 2px),
      radial-gradient(circle at 80% 70%, rgba(30, 100, 200, 0.3) 1px, transparent 1px),
      radial-gradient(circle at 40% 60%, rgba(74, 158, 255, 0.2) 3px, transparent 3px),
      radial-gradient(circle at 90% 20%, rgba(255, 255, 255, 0.1) 2px, transparent 2px),
      radial-gradient(circle at 10% 80%, rgba(30, 100, 200, 0.2) 2px, transparent 2px);
    background-size: 100px 100px, 150px 150px, 200px 200px, 120px 120px, 180px 180px;
    pointer-events: none;
  }
`;

const Header = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  padding: 20px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  position: relative;
  
  &::before {
    content: '🏥';
    position: absolute;
    top: 15px;
    left: 20px;
    font-size: 1.5rem;
    opacity: 0.7;
  }

  &::after {
    content: '⚕️';
    position: absolute;
    bottom: 15px;
    right: 70px;
    font-size: 1.2rem;
    opacity: 0.6;
  }
  
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
    background: #1e64c8;
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

`;

// ============================================================
// 🏥 醫院公告設定區 — 在此修改醫院推廣內容
// ============================================================
// 說明：
//   HOSPITAL_ANNOUNCEMENTS 陣列中，每一筆物件代表一個公告連結。
//   格式：{ label: '顯示文字', href: '連結網址', emoji: '圖示' }
//   留空陣列 [] 則不顯示任何連結按鈕。
// ============================================================
const HOSPITAL_INTRO_TITLE = '臺大醫院口腔顎面外科 AI 智能助理';

const HOSPITAL_INTRO_DESC =
  '您好！我是臺大醫院口腔顎面外科的 AI 衛教助理，' +
  '可協助您查詢術前術後照護、常見手術資訊及門診注意事項。' +
  '所有回答均依據本科臨床指引，如有急迫醫療問題請直接聯繫診間。';

const HOSPITAL_ANNOUNCEMENTS: { label: string; href: string; emoji: string }[] = [
  // 範例（取消註解並填入真實連結即可啟用）：
  // { label: '植牙衛教資訊', href: 'https://www.ntuh.gov.tw/OMS/...', emoji: '🦷' },
  // { label: '正顎手術說明', href: 'https://www.ntuh.gov.tw/OMS/...', emoji: '📋' },
  // { label: '門診預約掛號', href: 'https://reg.ntuh.gov.tw', emoji: '📅' },
];

const IntroSection = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  padding: 16px 20px;
  margin: 16px 20px 0 20px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  position: relative;

  &::before {
    content: '💫';
    position: absolute;
    top: 8px;
    left: 12px;
    font-size: 1.2rem;
    opacity: 0.8;
  }

  &::after {
    content: '🔥';
    position: absolute;
    top: 8px;
    right: 12px;
    font-size: 1.2rem;
    opacity: 0.8;
  }

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
    position: relative;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
      text-decoration: none;
      color: white;
    }

    &:first-of-type::before {
      content: '🎤';
      margin-right: 4px;
    }

    &:last-of-type::before {
      content: '🏈';
      margin-right: 4px;
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
  position: relative;

  &::before {
    content: '✨';
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 1.5rem;
    opacity: 0.3;
    z-index: 0;
  }

  &::after {
    content: '💫';
    position: absolute;
    bottom: 10px;
    left: 10px;
    font-size: 1.3rem;
    opacity: 0.3;
    z-index: 0;
  }

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
    ? 'rgba(13, 71, 161, 0.9)'
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
  position: relative;
  
  &::before {
    content: ${props => props.isAI ? "'🏥 ⚕️'" : "'👤 💬'"};
    position: absolute;
    top: -8px;
    ${props => props.isAI ? 'right: -8px;' : 'left: -8px;'}
    font-size: 1rem;
    background: ${props => props.isAI ? 'rgba(13, 71, 161, 0.9)' : 'rgba(74, 158, 255, 0.9)'};
    padding: 2px 6px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  &::after {
    content: ${props => props.isAI ? "''" : "'✨'"};
    position: absolute;
    bottom: -5px;
    ${props => props.isAI ? 'left: -5px;' : 'right: -5px;'}
    font-size: 1.2rem;
  }
`;

const MessageContent = styled.div<{ isAI?: boolean }>`
  color: ${props => props.isAI ? 'white' : '#333'};
  font-size: 0.95rem;
  line-height: 1.4;
  word-break: break-word;
`;

const LoadingMessage = styled(MessageBubble)`
  background: rgba(13, 71, 161, 0.9);
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
  position: relative;

  &::before {
    content: '💛';
    position: absolute;
    top: 8px;
    left: 8px;
    font-size: 1rem;
    opacity: 0.7;
  }

  &::after {
    content: '⚡';
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 1rem;
    opacity: 0.7;
  }
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
    ? 'rgba(74, 158, 255, 0.8)'
    : '#1e64c8'
  };
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  transition: opacity 0.2s ease;
  position: relative;
  
  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:first-of-type::after {
    content: '🚀';
    margin-left: 4px;
  }

  &:last-of-type::after {
    content: '🧹';
    margin-left: 4px;
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
  position: relative;

  &::before {
    content: '⭐';
    position: absolute;
    top: 5px;
    left: 15px;
    font-size: 1rem;
    opacity: 0.6;
  }

  &::after {
    content: '✨';
    position: absolute;
    top: 5px;
    right: 15px;
    font-size: 1rem;
    opacity: 0.6;
  }

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
        <h1>🏥 NTUH_OMS_RAG</h1>
        <div className="subtitle">台大醫院口腔顎面外科 AI 智能查詢系統 | Powered by Cloudflare AutoRAG</div>
      </Header>

      <IntroSection>
        <h3>{HOSPITAL_INTRO_TITLE}</h3>
        <p>{HOSPITAL_INTRO_DESC}</p>
        {HOSPITAL_ANNOUNCEMENTS.length > 0 && (
          <div className="source-links">
            {HOSPITAL_ANNOUNCEMENTS.map((item, idx) => (
              <a key={idx} href={item.href} className="source-link" target="_blank" rel="noreferrer">
                {item.emoji} {item.label}
              </a>
            ))}
          </div>
        )}
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
          placeholder="請輸入您的問題，例如：拔牙後需要注意什麼？"
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
        <strong>
          臺大醫院口腔顎面外科 AI 衛教助理 | Powered by{' '}
          <span className="cloudflare-ref">
            <a href="https://developers.cloudflare.com/autorag/">Cloudflare AutoRAG</a>、
            <a href="https://developers.cloudflare.com/durable-objects/get-started/">Durable Objects</a>、
            <a href="https://developers.cloudflare.com/workers-ai/">Workers AI</a>
          </span>
          。本助理僅供衛教參考，不可取代醫師專業診斷。
        </strong>
      </Footer>
    </AppContainer>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}