import { ChatState } from './chatState';

export interface Env {
	CHAT_STATE: DurableObjectNamespace;
	ASSETS: Fetcher;
	AI: {
		autorag: (name: string) => {
			aiSearch: (params: { query: string }) => Promise<string>;
		};
	};
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets
		if (url.pathname === '/' || url.pathname.startsWith('/bundle.js')) {
			return env.ASSETS.fetch(request);
		}

		// Handle chat routes
		if (url.pathname.startsWith('/chat/')) {
			const id = env.CHAT_STATE.idFromName('chat');
			const obj = env.CHAT_STATE.get(id);

			if (url.pathname === '/chat/init') {
				return new Response(JSON.stringify({ id: id.toString() }), {
					headers: { 'Content-Type': 'application/json' },
				});
			}

			return obj.fetch(request);
		}

		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;

export { ChatState };