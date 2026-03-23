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

// ============================================================
// 🏥 醫院公告設定區 — 在此修改醫院推廣內容
// ============================================================
const HOSPITAL_INTRO_TITLE = '口腔顎面外科衛教查詢';

const HOSPITAL_INTRO_DESC =
  '輸入手術名稱、術後問題或相關症狀，AI 將根據本科臨床指引為您提供詳細衛教資訊。';

const HOSPITAL_INTRO_WARNING = '⚠️ 本系統僅供衛教參考，實際治療請諮詢您的主治醫師。';

const HOSPITAL_ANNOUNCEMENTS: { label: string; href: string; emoji: string }[] = [
  // 範例（取消註解並填入真實連結即可啟用）：
  // { label: '瀏覽所有衛教資料', href: 'https://www.ntuh.gov.tw/OMS/', emoji: '📋' },
  // { label: '門診預約掛號', href: 'https://reg.ntuh.gov.tw', emoji: '📅' },
  // { label: '術後照護說明', href: 'https://www.ntuh.gov.tw/OMS/care', emoji: '🦷' },
];
// ============================================================

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, #0a1628 0%, #0d2b5e 50%, #1a3a6b 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
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
  background: white;
  padding: 18px 24px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  position: relative;

  &::before {
    content: '🦷';
    position: absolute;
    top: 50%;
    left: 20px;
    transform: translateY(-50%);
    font-size: 1.5rem;
  }

  &::after {
    content: '⚕️';
    position: absolute;
    top: 50%;
    right: 20px;
    transform: translateY(-50%);
    font-size: 1.3rem;
    opacity: 0.5;
  }

  h1 {
    color: #1a56c4;
    font-size: 1.7rem;
    font-weight: 700;
    margin: 0 0 4px 0;
  }

  .subtitle {
    color: #6b7a99;
    font-size: 0.88rem;
    font-weight: 400;
  }
`;

const IntroSection = styled.div`
  background: white;
  margin: 16px 20px 0 20px;
  border-radius: 14px;
  padding: 18px 22px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.07);
  border: 1px solid #e4eaf7;
  position: relative;

  &::before {
    content: '📋';
    position: absolute;
    top: 14px;
    left: 16px;
    font-size: 1.1rem;
  }

  &::after {
    content: '✏️';
    position: absolute;
    top: 14px;
    right: 16px;
    font-size: 1rem;
    opacity: 0.4;
  }

  h3 {
    color: #1a56c4;
    font-size: 1rem;
    font-weight: 700;
    margin: 0 0 8px 0;
    text-align: center;
  }

  .desc {
    color: #444;
    font-size: 0.88rem;
    line-height: 1.6;
    text-align: center;
    margin: 0 0 6px 0;
  }

  .warning {
    color: #e67e22;
    font-size: 0.82rem;
    text-align: center;
    margin: 0 0 12px 0;
  }

  .source-links {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .source-link {
    background: #1a56c4;
    color: white;
    padding: 7px 16px;
    border-radius: 20px;
    text-decoration: none;
    font-weight: 500;
    font-size: 0.85rem;
    transition: background 0.2s;

    &:hover {
      background: #1445a3;
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
  gap: 14px;

  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: #c5cfe8;
    border-radius: 3px;
  }
`;

const MessageRow = styled.div<{ isAI?: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 8px;
  justify-content: ${props => props.isAI ? 'flex-end' : 'flex-start'};
`;

const Avatar = styled.div<{ isAI?: boolean }>`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  background: ${props => props.isAI ? '#1a56c4' : '#e4eaf7'};
  order: ${props => props.isAI ? 1 : 0};
`;

const MessageBubble = styled.div<{ isAI?: boolean }>`
  background: ${props => props.isAI ? '#1a56c4' : 'white'};
  color: ${props => props.isAI ? 'white' : '#2c3e50'};
  padding: 11px 16px;
  border-radius: ${props => props.isAI ? '18px 4px 18px 18px' : '4px 18px 18px 18px'};
  max-width: 72%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  font-size: 0.93rem;
  line-height: 1.6;
  word-break: break-word;
  border: ${props => props.isAI ? 'none' : '1px solid #e4eaf7'};
`;

const LoadingBubble = styled(MessageBubble)`
  background: #1a56c4;
  color: white;
  .loading-text::after {
    content: '...';
    animation: dots 1.2s steps(4, end) infinite;
  }
  @keyframes dots {
    0%, 20% { opacity: 0.3; }
    60% { opacity: 1; }
    100% { opacity: 0.3; }
  }
`;

const InputContainer = styled.div`
  padding: 14px 20px;
  background: white;
  border-top: 1px solid #e4eaf7;
  display: flex;
  gap: 10px;
  align-items: center;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
`;

const Input = styled.input`
  flex: 1;
  padding: 11px 18px;
  border: 1.5px solid #c5cfe8;
  border-radius: 24px;
  outline: none;
  font-size: 15px;
  background: #f7f9ff;
  color: #2c3e50;
  font-family: inherit;

  &:focus {
    border-color: #1a56c4;
    background: white;
    box-shadow: 0 0 0 3px rgba(26, 86, 196, 0.1);
  }

  &::placeholder {
    color: #a0adc4;
  }
`;

const Button = styled.button<{ variant?: 'secondary' }>`
  padding: 11px 20px;
  background: ${props => props.variant === 'secondary' ? '#f0f4ff' : '#1a56c4'};
  color: ${props => props.variant === 'secondary' ? '#1a56c4' : 'white'};
  border: ${props => props.variant === 'secondary' ? '1.5px solid #c5cfe8' : 'none'};
  border-radius: 24px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.15s ease;
  font-family: inherit;

  &:hover:not(:disabled) {
    background: ${props => props.variant === 'secondary' ? '#e4eaf7' : '#1445a3'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Footer = styled.footer`
  text-align: center;
  padding: 10px 20px;
  background: white;
  color: #8a95b0;
  font-size: 12px;
  border-top: 1px solid #e4eaf7;

  a {
    color: #1a56c4;
    text-decoration: none;
    &:hover { text-decoration: underline; }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage();
  };

  const getTextContent = (msg: Message): string => {
    if (typeof msg.text === 'string') return msg.text;
    if (msg.text && typeof msg.text === 'object') {
      const obj = msg.text as any;
      return obj.response ?? obj.text ?? obj.message ?? JSON.stringify(obj);
    }
    return String(msg.text);
  };

  return (
    <AppContainer>
      <Header>
        <h1>🦷 NTUH 口腔顎面外科 AI 助理</h1>
        <div className="subtitle">台大醫院口腔顎面外科衛教查詢系統 - AI 智慧問答</div>
      </Header>

      <IntroSection>
        <h3>{HOSPITAL_INTRO_TITLE}</h3>
        <p className="desc">{HOSPITAL_INTRO_DESC}</p>
        <p className="warning">{HOSPITAL_INTRO_WARNING}</p>
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
        {messages.map(message => (
          <MessageRow key={message.id} isAI={message.isAI}>
            <Avatar isAI={message.isAI}>
              {message.isAI ? '🤖' : '👤'}
            </Avatar>
            <MessageBubble isAI={message.isAI}>
              {getTextContent(message)}
            </MessageBubble>
          </MessageRow>
        ))}
        {isLoading && (
          <MessageRow isAI>
            <Avatar isAI>🤖</Avatar>
            <LoadingBubble isAI>
              <div className="loading-text">思考中</div>
            </LoadingBubble>
          </MessageRow>
        )}
      </ChatContainer>

      <InputContainer>
        <Input
          value={newMessage}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="請輸入您的問題，例如：拔牙後需要注意什麼？"
          disabled={isLoading}
        />
        <Button onClick={sendMessage} disabled={isLoading}>
          查詢 🔍
        </Button>
        <Button variant="secondary" onClick={clearChat} disabled={isLoading}>
          清除 🗑️
        </Button>
      </InputContainer>

      <Footer>
        NTUH OMS RAG - 台大醫院口腔顎面外科衛教系統 | 使用{' '}
        <a href="https://developers.cloudflare.com/autorag/">Cloudflare AutoRAG</a>、
        <a href="https://developers.cloudflare.com/workers/">Workers</a> 及{' '}
        <a href="https://developers.cloudflare.com/r2/">R2</a> 建置
      </Footer>
    </AppContainer>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
