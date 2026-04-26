// ============================================================
// src/client.tsx — 前端 React 介面
// 負責：
//   1. 渲染整個聊天視窗 UI（標題、公告區、對話氣泡、輸入列、頁尾）
//   2. 與後端 /chat/ API 溝通（傳送問題、取得回覆、清除歷史）
//   3. 醫院公告設定區（HOSPITAL_* 常數）—— 想修改顯示內容在此區塊
// ============================================================

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import styled from '@emotion/styled'; // CSS-in-JS 樣式庫

// ──────────────────────────────────────────────
// 型別定義
// ──────────────────────────────────────────────

// 單則訊息的資料結構
interface Message {
  id: string;
  text: string | { response: string } | any; // 允許多種 AI 回傳格式，由 getTextContent 統一解析
  timestamp: number;
  isAI?: boolean; // true = AI 回覆（右側藍色泡泡）；false/undefined = 使用者訊息（左側半透明泡泡）
}

// /chat/init 回傳的格式
interface ChatInitResponse {
  id: string;
}

// /chat/:id GET 回傳的格式
interface ChatResponse {
  messages: Message[];
}

// ──────────────────────────────────────────────
// 🔧 想修改介面上的文字嗎？在這裡改就好！
// ──────────────────────────────────────────────

// 公告區標題（顯示在對話區上方的說明卡片）
const HOSPITAL_INTRO_TITLE = '口腔顎面外科衛教查詢';

// 公告區說明文字
const HOSPITAL_INTRO_DESC =
  '輸入手術名稱、術後問題或相關症狀，AI 將根據本科臨床指引為您提供詳細衛教資訊。';

// 警示文字（黃色小字）
const HOSPITAL_INTRO_WARNING = '⚠️ 本系統僅供衛教參考，實際治療請諮詢您的主治醫師。';

// 公告連結按鈕（可加入醫院網站、掛號系統、衛教資料等）
// 格式：{ label: '按鈕文字', href: '連結網址', emoji: '圖示' }
// 取消下方範例的 // 前綴並填入正確網址即可啟用
const HOSPITAL_ANNOUNCEMENTS: { label: string; href: string; emoji: string }[] = [
  // 範例（取消註解並填入真實連結即可啟用）：
  // { label: '瀏覽所有衛教資料', href: 'https://www.ntuh.gov.tw/OMS/', emoji: '📋' },
  // { label: '門診預約掛號', href: 'https://reg.ntuh.gov.tw', emoji: '📅' },
  // { label: '術後照護說明', href: 'https://www.ntuh.gov.tw/OMS/care', emoji: '🦷' },
];

// ──────────────────────────────────────────────
// 🎨 樣式元件（Styled Components）
// 想改顏色、間距、字型大小？在對應區塊修改即可
// ──────────────────────────────────────────────

// 整個應用程式的最外層容器
// 背景是深藍星空漸層 + CSS 偽元素星點效果
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

// 頂部標題列（背景模糊玻璃效果）
// 修改 h1 內容 → 改標題；修改 .subtitle → 改副標題
const Header = styled.div`
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  padding: 18px 24px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  position: relative;

  &::before {
    content: '🦷';
    position: absolute;
    top: 50%;
    left: 20px;
    transform: translateY(-50%);
    font-size: 1.5rem;
    opacity: 0.7;
  }

  &::after {
    content: '⚕️';
    position: absolute;
    top: 50%;
    right: 20px;
    transform: translateY(-50%);
    font-size: 1.3rem;
    opacity: 0.4;
  }

  h1 {
    color: white;
    font-size: 1.7rem;
    font-weight: 700;
    margin: 0 0 4px 0;
    text-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }

  .subtitle {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.88rem;
    font-weight: 400;
  }
`;

// 公告區卡片（在對話上方顯示的說明+連結區塊）
// 內容由上方 HOSPITAL_* 常數控制
const IntroSection = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  margin: 16px 20px 0 20px;
  border-radius: 14px;
  padding: 18px 22px;
  border: 1px solid rgba(255, 255, 255, 0.2);
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
    color: white;
    font-size: 1rem;
    font-weight: 700;
    margin: 0 0 8px 0;
    text-align: center;
  }

  .desc {
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.88rem;
    line-height: 1.6;
    text-align: center;
    margin: 0 0 6px 0;
  }

  .warning {
    color: #ffd580;
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
    background: rgba(74, 158, 255, 0.35);
    color: white;
    padding: 7px 16px;
    border-radius: 20px;
    text-decoration: none;
    font-weight: 500;
    font-size: 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.25);
    transition: background 0.2s;

    &:hover {
      background: rgba(74, 158, 255, 0.55);
      text-decoration: none;
      color: white;
    }
  }
`;

// 對話訊息的捲動容器（佔滿剩餘高度，超出時可捲動）
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

// 單行訊息列（包含頭像 + 氣泡）
// isAI=true → 靠右對齊（AI）；isAI=false → 靠左（使用者）
const MessageRow = styled.div<{ isAI?: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 8px;
  justify-content: ${props => props.isAI ? 'flex-end' : 'flex-start'};
`;

// 訊息左側/右側的圓形頭像（🤖 or 👤）
const Avatar = styled.div<{ isAI?: boolean }>`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  background: ${props => props.isAI ? 'rgba(26, 86, 196, 0.7)' : 'rgba(255, 255, 255, 0.15)'};
  border: 1px solid rgba(255, 255, 255, 0.2);
  order: ${props => props.isAI ? 1 : 0};
`;

// 訊息氣泡本體
// AI 訊息：深藍色；使用者訊息：半透明白色
// white-space: pre-wrap → 保留換行符，讓列點正確顯示
const MessageBubble = styled.div<{ isAI?: boolean }>`
  background: ${props => props.isAI ? 'rgba(26, 86, 196, 0.85)' : 'rgba(255, 255, 255, 0.15)'};
  color: white;
  padding: 11px 16px;
  border-radius: ${props => props.isAI ? '18px 4px 18px 18px' : '4px 18px 18px 18px'};
  max-width: 72%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-size: 0.93rem;
  line-height: 1.7;
  word-break: break-word;
  white-space: pre-wrap;
  border: 1px solid ${props => props.isAI ? 'rgba(74, 158, 255, 0.4)' : 'rgba(255, 255, 255, 0.2)'};
  backdrop-filter: blur(6px);
`;

// AI 思考中的動畫泡泡（顯示「思考中...」動畫）
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

// 底部輸入列容器（文字框 + 查詢按鈕 + 清除按鈕）
const InputContainer = styled.div`
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  gap: 10px;
  align-items: center;
`;

// 文字輸入框（placeholder 可在 JSX 區塊修改）
const Input = styled.input`
  flex: 1;
  padding: 11px 18px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 24px;
  outline: none;
  font-size: 15px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-family: inherit;
  backdrop-filter: blur(6px);

  &:focus {
    border-color: rgba(74, 158, 255, 0.7);
    background: rgba(255, 255, 255, 0.15);
    box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.15);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.45);
  }
`;

// 按鈕（支援 variant='secondary' 樣式，用於「清除」按鈕）
const Button = styled.button<{ variant?: 'secondary' }>`
  padding: 11px 20px;
  background: ${props => props.variant === 'secondary' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(26, 86, 196, 0.85)'};
  color: white;
  border: 1px solid ${props => props.variant === 'secondary' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(74, 158, 255, 0.5)'};
  border-radius: 24px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.15s ease;
  font-family: inherit;
  backdrop-filter: blur(6px);

  &:hover:not(:disabled) {
    background: ${props => props.variant === 'secondary' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(26, 86, 196, 1)'};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

// 頁尾（顯示系統名稱與技術說明連結）
const Footer = styled.footer`
  text-align: center;
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(10px);
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);

  a {
    color: rgba(74, 158, 255, 0.9);
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }
`;

// ──────────────────────────────────────────────
// 主要 React 元件
// ──────────────────────────────────────────────
const App: React.FC = () => {
  // 對話歷史（含使用者與 AI 訊息）
  const [messages, setMessages] = useState<Message[]>([]);
  // 使用者輸入的文字
  const [newMessage, setNewMessage] = useState('');
  // Durable Object 的唯一 ID（由 /chat/init 取得，用於後續 API 呼叫）
  const [chatStateId, setChatStateId] = useState<string | null>(null);
  // 是否正在等待 AI 回覆（控制 loading 動畫與按鈕禁用狀態）
  const [isLoading, setIsLoading] = useState(false);

  // 頁面載入時：初始化對話 session 並載入歷史訊息
  useEffect(() => {
    fetch('/chat/init')   // GET：初始化 session，取得 Durable Object ID
      .then(res => res.json() as Promise<ChatInitResponse>)
      .then(data => {
        setChatStateId(data.id);
        return fetch(`/chat/${data.id}`); // 取得 Durable Object 中的歷史訊息
      })
      .then(res => res.json() as Promise<ChatResponse>)
      .then(data => setMessages(data.messages))
      .catch(console.error);
  }, []);

  // 發送訊息：先樂觀更新 UI，再呼叫 API 等待 AI 回覆
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

      // 立即將使用者訊息顯示到畫面上（不等待 AI 回覆）
      setMessages(prev => [...prev, userMessage]);
      setNewMessage('');

      // POST 到後端，觸發 RAG + AI 生成流程
      const response = await fetch(`/chat/${chatStateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMessage }),
      });
      const data = await response.json() as { messages: Message[] };

      // 後端回傳 [userMessage, aiMessage]，取 index 1 的 AI 回覆加入畫面
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

  // 清除所有對話歷史（呼叫 DELETE /chat/:id）
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

  // 按下 Enter 鍵時觸發發送（等同點擊「查詢」按鈕）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage();
  };

  // 訊息文字解析：將 AI 回傳的各種格式統一轉為字串
  // 防止 undefined、null、物件直接顯示造成錯誤
  const getTextContent = (msg: Message): string => {
    if (!msg || msg.text === undefined || msg.text === null) return '（無內容）';
    if (typeof msg.text === 'string') return msg.text || '（空回應）';
    if (typeof msg.text === 'object') {
      const obj = msg.text as any;
      return obj.response ?? obj.choices?.[0]?.message?.content ?? obj.text ?? obj.message ?? obj.content ?? JSON.stringify(obj);
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
        <a href="https://developers.cloudflare.com/workers-ai/">Workers AI</a>、
        <a href="https://developers.cloudflare.com/vectorize/">Vectorize</a> 及{' '}
        <a href="https://developers.cloudflare.com/durable-objects/">Durable Objects</a> 建置
      </Footer>
    </AppContainer>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
