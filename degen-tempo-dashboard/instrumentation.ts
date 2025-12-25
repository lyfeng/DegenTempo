
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only import undici on the server side
    const { setGlobalDispatcher, ProxyAgent } = await import('undici');
    
    // Use environment variable or default to common local proxy port
    const proxyUrl = process.env.http_proxy || process.env.HTTP_PROXY || 'http://127.0.0.1:7890';
    
    if (proxyUrl) {
      try {
        const dispatcher = new ProxyAgent(proxyUrl);
        setGlobalDispatcher(dispatcher);
        console.log(`[Instrumentation] Global Proxy Configured: ${proxyUrl}`);
      } catch (error) {
        console.error('[Instrumentation] Failed to configure proxy:', error);
      }
    }
  }
}
