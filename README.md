- Chat with LLM about [Taylor Swift's New Heights podcast appearance](https://www.youtube.com/watch?v=M2lX9XESvDE&t=6297s) ([transcript here](https://www.youtube-transcript.io/videos?id=M2lX9XESvDE))
- Discuss [Travis Kelce's GQ magazine interview](https://www.gq.com/story/travis-kelce-september-cover-2025-interview-super-bowl-taylor-swift)

## Tech Stack (Cloudflare products)

| Product | Purpose | Documentation |
|---------|---------|---------------|
| **Cloudflare Workers** | Serverless backend & API | [Docs](https://developers.cloudflare.com/workers/) |
| **Durable Objects** | Stateful chat session management | [Docs](https://developers.cloudflare.com/durable-objects/) |
| **R2 Storage** | Object storage for transcript & article | [Docs](https://developers.cloudflare.com/r2/) |
| **Workers AI** | AI inference w/ openai gpt-oss-120b | [Docs](https://developers.cloudflare.com/workers-ai/) |
| **AutoRAG** | Retrieval Augmented Generation | [Docs](https://developers.cloudflare.com/autorag/) |
| **Browser Rendering** | Scraped GQ article | [Docs](https://developers.cloudflare.com/browser-rendering) |

### Frontend

- React 18
- Emotion/Styled for CSS-in-JS
- esbuild for bundling
- TypeScript

### AI Model

- [OpenAI OSS 120B on Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/) (`@cf/openai/gpt-oss-120b`)

### Prereqs

- Node.js 18+ and npm
- Cloudflare account with Workers plan
- Wrangler CLI installed globally

```bash
npm install -g wrangler
```

#### Installation
1. Clone and install dependencies:
```bash
git clone https://github.com/elizabethsiegle/chat-w-taylor-on-newheights-and-travis-gq-autorag-openaioss
cd taylor-newheights-rag
npm install
npm install --save-dev esbuild @types/react @types/react-dom
```

2. Configure wrangler.jsonc (see mine)

3. Auth with Cloudflare/login 
```bash
wrangler login
```

4. Set up R2 bucket with scraped GQ article and New Heights transcript
```bash
wrangler r2 bucket create taylor-rag-articles
wrangler r2 object put taylor-rag-articles/travisgq.txt --file ./path/to/travisgq.txt
wrangler r2 object put "taylor-rag-articles/Taylor Swift on Reclaiming Her Masters, Wrapping The Eras Tour, and The Life of a Showgirl  NHTV.txt" --file ./path/to/transcript.txt
```

5. Configure AutoRAG in your Cloudflare dashboard under AI
Point to your taylor-rag-articles R2 bucket

6. Build and deploy:
```bash
npm run build
wrangler publish
```