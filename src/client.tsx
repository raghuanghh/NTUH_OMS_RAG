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

// Taylor Swift inspired keyframes
const sparkle = keyframes`
  0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
  50% { opacity: 1; transform: scale(1) rotate(180deg); }
`;

const heartBeat = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
`;

const eraShift = keyframes`
  0% { background-position: 0% 50%; }
  25% { background-position: 100% 50%; }
  50% { background-position: 100% 100%; }
  75% { background-position: 0% 100%; }
  100% { background-position: 0% 50%; }
`;

const jerseyBounce = keyframes`
  0%, 20%, 50%, 80%, 100% { transform: translateY(0) rotate(0deg); }
  40% { transform: translateY(-8px) rotate(5deg); }
  60% { transform: translateY(-4px) rotate(-3deg); }
`;

const enchanted = keyframes`
  0%, 100% { 
    opacity: 0.7; 
    transform: translateY(0px) scale(1); 
    filter: hue-rotate(0deg);
  }
  33% { 
    opacity: 1; 
    transform: translateY(-5px) scale(1.05); 
    filter: hue-rotate(60deg);
  }
  66% { 
    opacity: 0.9; 
    transform: translateY(2px) scale(0.98); 
    filter: hue-rotate(120deg);
  }
`;

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, 
    #FFD700 0%,    /* Gold (Fearless) */
    #FF8C00 15%,   /* Orange (Chiefs) */
    #DDA0DD 30%,   /* Plum (Speak Now) */
    #DC143C 45%,   /* Red (Red) */
    #FF1493 60%,   /* Deep Pink (Lover) */
    #9370DB 75%,   /* Medium Purple (Folklore) */
    #FF6347 90%,   /* Tomato (Chiefs) */
    #FFD700 100%   /* Gold */
  );
  background-size: 600% 600%;
  animation: ${eraShift} 15s ease infinite;
  font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: 
      radial-gradient(circle at 15% 25%, rgba(255, 215, 0, 0.4) 3px, transparent 3px),
      radial-gradient(circle at 85% 75%, rgba(255, 255, 255, 0.6) 2px, transparent 2px),
      radial-gradient(circle at 45% 60%, rgba(255, 20, 147, 0.3) 4px, transparent 4px),
      radial-gradient(circle at 75% 35%, rgba(147, 112, 219, 0.4) 2px, transparent 2px),
      radial-gradient(circle at 25% 85%, rgba(255, 140, 0, 0.5) 3px, transparent 3px);
    background-size: 120px 120px, 80px 80px, 200px 200px, 150px 150px, 100px 100px;
    animation: sparkleMove 20s linear infinite;
  }

  @keyframes sparkleMove {
    0% { transform: translateY(0px) rotate(0deg); }
    100% { transform: translateY(-150px) rotate(360deg); }
  }
`;

const Header = styled.div`
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  padding: 20px;
  text-align: center;
  border-bottom: 3px solid rgba(255, 215, 0, 0.5);
  position: relative;
  
  h1 {
    color: white;
    font-size: 2.5rem;
    font-weight: 900;
    text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.4);
    margin: 0;
    animation: ${heartBeat} 3s ease-in-out infinite;
    background: linear-gradient(45deg, #FFD700, #FF1493, #FFD700);
    background-size: 300% 300%;
    animation: ${heartBeat} 3s ease-in-out infinite, ${eraShift} 8s ease infinite;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .subtitle {
    color: rgba(255, 255, 255, 0.95);
    font-size: 1rem;
    margin-top: 8px;
    font-weight: 600;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3);
  }

  .jersey-numbers {
    position: absolute;
    top: 15px;
    right: 20px;
    display: flex;
    gap: 10px;
  }

  .jersey-number {
    background: linear-gradient(135deg, #DC143C 0%, #FF0000 100%);
    color: white;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 1.2rem;
    box-shadow: 0 4px 12px rgba(220, 20, 60, 0.4);
    animation: ${jerseyBounce} 4s ease-in-out infinite;
    border: 2px solid rgba(255, 255, 255, 0.3);
  }

  .taylor-thirteen {
    background: linear-gradient(135deg, #FFD700 0%, #FF1493 100%);
    animation-delay: 0.5s;
  }
`;

const IntroSection = styled.div`
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  padding: 20px 25px;
  margin: 0 20px 15px 20px;
  border-radius: 20px;
  border: 2px solid rgba(255, 215, 0, 0.4);
  position: relative;
  z-index: 1;

  h3 {
    color: white;
    font-size: 1.3rem;
    font-weight: 700;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.4);
    margin: 0 0 12px 0;
    text-align: center;
  }

  p {
    color: rgba(255, 255, 255, 0.95);
    font-size: 1rem;
    line-height: 1.5;
    margin: 0 0 15px 0;
    text-align: center;
    font-weight: 500;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3);
  }

  .source-links {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .source-link {
    background: linear-gradient(135deg, #FF1493 0%, #FFD700 100%);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
    transition: all 0.3s ease;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    border: 2px solid rgba(255, 255, 255, 0.3);

    &:hover {
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 5px 15px rgba(255, 20, 147, 0.4);
      text-decoration: none;
      color: white;
    }
  }
`;

const ChatContainer = styled.div`
  flex: 1;
  padding: 0 25px 25px 25px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  z-index: 1;
  max-height: calc(100vh - 380px); /* Adjust based on header + intro + input heights */

  &::-webkit-scrollbar {
    width: 10px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 5px;
  }

  &::-webkit-scrollbar-thumb {
    background: linear-gradient(45deg, #FFD700, #FF1493);
    border-radius: 5px;
  }
`;

const MessageBubble = styled.div<{ isAI?: boolean }>`
  background: ${props => props.isAI 
    ? 'linear-gradient(135deg, rgba(220, 20, 60, 0.95) 0%, rgba(255, 69, 0, 0.95) 50%, rgba(255, 140, 0, 0.95) 100%)'
    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 248, 220, 0.98) 50%, rgba(255, 215, 0, 0.1) 100%)'
  };
  padding: 18px 25px;
  border-radius: 30px;
  max-width: 80%;
  align-self: ${props => props.isAI ? 'flex-end' : 'flex-start'};
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(15px);
  border: 3px solid ${props => props.isAI ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 215, 0, 0.6)'};
  position: relative;
  animation: ${enchanted} 6s ease-in-out infinite;
  
  &::before {
    content: ${props => props.isAI ? "'🏈 #12'" : "'🎤 ✨'"};
    position: absolute;
    top: -12px;
    ${props => props.isAI ? 'right: -15px;' : 'left: -15px;'}
    font-size: 1.3rem;
    animation: ${sparkle} 3s ease-in-out infinite;
    background: ${props => props.isAI ? 'rgba(220, 20, 60, 0.9)' : 'rgba(255, 215, 0, 0.9)'};
    padding: 4px 8px;
    border-radius: 15px;
    border: 2px solid rgba(255, 255, 255, 0.5);
  }

  &::after {
    content: ${props => props.isAI ? "''" : "'💛'"};
    position: absolute;
    bottom: -8px;
    ${props => props.isAI ? 'left: -8px;' : 'right: -8px;'}
    font-size: 1.5rem;
    animation: ${heartBeat} 2s ease-in-out infinite;
    animation-delay: 1s;
  }

  &:hover {
    transform: scale(1.03);
    transition: transform 0.3s ease;
    box-shadow: 0 8px 35px rgba(255, 20, 147, 0.4);
  }
`;

const MessageContent = styled.div<{ isAI?: boolean }>`
  white-space: pre-wrap;
  word-break: break-word;
  color: ${props => props.isAI ? 'white' : '#2C1810'};
  font-weight: ${props => props.isAI ? '600' : '500'};
  text-shadow: ${props => props.isAI ? '2px 2px 4px rgba(0, 0, 0, 0.4)' : '1px 1px 2px rgba(255, 215, 0, 0.3)'};
  line-height: 1.5;
  font-size: 1.05rem;
`;

const LoadingDots = styled.div`
  @keyframes taylorPulse {
    0% { opacity: 0.4; transform: scale(1) rotate(0deg); }
    33% { opacity: 1; transform: scale(1.2) rotate(120deg); }
    66% { opacity: 0.7; transform: scale(1.1) rotate(240deg); }
    100% { opacity: 0.4; transform: scale(1) rotate(360deg); }
  }
  animation: taylorPulse 2s ease-in-out infinite;
  display: inline-block;
  color: white;
  font-size: 1.3rem;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
`;

const InputContainer = styled.div`
  padding: 25px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  border-top: 3px solid rgba(255, 215, 0, 0.6);
  display: flex;
  gap: 15px;
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
      rgba(255, 215, 0, 0.1) 0%, 
      rgba(255, 20, 147, 0.1) 25%,
      rgba(147, 112, 219, 0.1) 50%,
      rgba(255, 20, 147, 0.1) 75%,
      rgba(255, 215, 0, 0.1) 100%);
    animation: ${eraShift} 5s ease-in-out infinite;
  }
`;

const Input = styled.input`
  flex: 1;
  padding: 18px 25px;
  border: 4px solid rgba(255, 215, 0, 0.7);
  border-radius: 30px;
  outline: none;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.95);
  color: #2C1810;
  font-weight: 600;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  position: relative;
  z-index: 3;
  
  &:focus {
    border-color: #FF1493;
    box-shadow: 
      0 0 25px rgba(255, 20, 147, 0.5),
      0 0 50px rgba(255, 215, 0, 0.3);
    transform: scale(1.02);
    transition: all 0.4s ease;
  }

  &::placeholder {
    color: rgba(255, 20, 147, 0.7);
    font-style: italic;
    font-weight: 500;
  }
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  padding: 18px 30px;
  background: ${props => props.variant === 'secondary' 
    ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.9) 0%, rgba(255, 140, 0, 0.9) 100%)'
    : 'linear-gradient(135deg, #FF1493 0%, #DC143C 50%, #FF4500 100%)'
  };
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 800;
  transition: all 0.4s ease;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  position: relative;
  z-index: 3;
  text-transform: uppercase;
  letter-spacing: 1px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  
  &:hover {
    transform: translateY(-3px) scale(1.08);
    box-shadow: 
      0 10px 30px rgba(255, 20, 147, 0.5),
      0 0 40px rgba(255, 215, 0, 0.3);
    animation: ${heartBeat} 0.8s ease-in-out infinite;
  }

  &:active {
    transform: translateY(-1px) scale(1.05);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    animation: none;
  }
`;

const Footer = styled.footer`
  position: sticky;
  bottom: 0;
  text-align: center;
  padding: 15px 20px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(15px);
  color: white;
  font-size: 14px;
  font-weight: 600;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
  z-index: 10;
  border-top: 2px solid rgba(255, 215, 0, 0.3);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);

  .heart {
    color: #FF1493;
    animation: ${heartBeat} 2s ease-in-out infinite;
    display: inline-block;
    margin: 0 3px;
    font-size: 1.1rem;
  }

  .bridge {
    color: #FFD700;
    font-weight: 900;
  }

  .cloudflare-ref {
    background: linear-gradient(45deg, #FFD700, #FF1493, #9370DB);
    background-size: 300% 300%;
    animation: ${eraShift} 8s ease infinite;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-weight: 700;
  }
`;

const FloatingNumber = styled.div<{ delay: number }>`
  position: absolute;
  font-size: 3rem;
  font-weight: 900;
  color: rgba(220, 20, 60, 0.3);
  animation: floatNumber 12s linear infinite;
  animation-delay: ${props => props.delay}s;
  pointer-events: none;
  z-index: 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);

  @keyframes floatNumber {
    0% {
      opacity: 0;
      transform: translateY(100vh) rotate(0deg) scale(0.5);
    }
    10% {
      opacity: 0.7;
      transform: translateY(90vh) rotate(36deg) scale(1);
    }
    90% {
      opacity: 0.7;
      transform: translateY(10vh) rotate(324deg) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(-10vh) rotate(360deg) scale(0.5);
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

  // Enhanced floating effects
  useEffect(() => {
    const emojis = ['🏈', '✨', '🎤', '💛', '🧡', '⭐', '🔥', '💫', '🏆', '🎵', '💝', '🦋', '🐍', '👑', '💎'];
    const interval = setInterval(() => {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const left = Math.random() * 90 + 5;
      const delay = Math.random() * 3;
      
      const emojiElement = document.createElement('div');
      emojiElement.textContent = emoji;
      emojiElement.style.cssText = `
        position: absolute;
        left: ${left}%;
        font-size: 2.5rem;
        animation: floatUp 10s linear infinite;
        animation-delay: ${delay}s;
        pointer-events: none;
        z-index: 0;
      `;
      
      document.body.appendChild(emojiElement);
      
      setTimeout(() => {
        if (document.body.contains(emojiElement)) {
          document.body.removeChild(emojiElement);
        }
      }, 10000 + delay * 1000);
    }, 2500);

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
      {/* Floating jersey numbers */}
      <FloatingNumber delay={0}>12</FloatingNumber>
      <FloatingNumber delay={4}>13</FloatingNumber>
      <FloatingNumber delay={8}>12</FloatingNumber>
      
      <Header>
        <div className="jersey-numbers">
          <div className="jersey-number taylor-thirteen">13</div>
          <div className="jersey-number">12</div>
        </div>
        <h1>🏈 Chat with the Taylor Swift New Heights podcast and Travis GQ article ✨</h1>
        <div className="subtitle">✨ "It's a loaf story, baby just say yeast" to New Heights insights! 🏈</div>
      </Header>

      <IntroSection>
        <h3>💫 Chat w/ the Sources ✨</h3>
        <p>
          Ask a LLM anything about Taylor Swift's appearance on the New Heights podcast on August 12, 2025 or Travis Kelce's GQ interview! 
          I have access to both transcripts and can share insights about their conversations.
        </p>
        <div className="source-links">
          <a href="/transcript" className="source-link" target="_blank">
            🎤 New Heights Transcript
          </a>
          <a href="/gq-article" className="source-link" target="_blank">
            📰 Travis GQ Article
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
          <MessageBubble isAI>
            <MessageContent isAI>
              <LoadingDots>✨ This is gonna be enchanting! 💫</LoadingDots>
            </MessageContent>
          </MessageBubble>
        )}
      </ChatContainer>
      
      <InputContainer>
        <Input
          value={newMessage}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="✨ Ask about the 2 hour-long Taylor Swift New Heights podcast or Travis GQ article..."
          disabled={isLoading}
        />
        <Button onClick={sendMessage} disabled={isLoading}>
          Send 💫
        </Button>
        <Button variant="secondary" onClick={clearChat} disabled={isLoading}>
          Clear 🧹
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