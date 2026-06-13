import express from 'express';
import path from 'path';
import axios from 'axios';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Configuration helper
  const getOAuthConfig = (platform: string) => {
    switch (platform) {
      case 'Facebook':
        return {
          authUrl: 'https://www.facebook.com/v12.0/dialog/oauth',
          tokenUrl: 'https://graph.facebook.com/v12.0/oauth/access_token',
          clientId: process.env.FACEBOOK_CLIENT_ID,
          clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
          scope: 'public_profile,email,ads_management,business_management'
        };
      case 'Instagram':
        return {
          authUrl: 'https://api.instagram.com/oauth/authorize',
          tokenUrl: 'https://api.instagram.com/oauth/access_token',
          clientId: process.env.INSTAGRAM_CLIENT_ID,
          clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
          scope: 'user_profile,user_media'
        };
      case 'TikTok':
        return {
          authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
          tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
          clientId: process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_ID,
          clientSecret: process.env.TIKTOK_CLIENT_SECRET,
          scope: 'user.info.basic',
          redirectUri: 'https://aautoflow.vercel.app/dashboard'
        };
      case 'WhatsApp':
        // WhatsApp Business uses Facebook Login for Business
        return {
          authUrl: 'https://www.facebook.com/v12.0/dialog/oauth',
          tokenUrl: 'https://graph.facebook.com/v12.0/oauth/access_token',
          clientId: process.env.WHATSAPP_CLIENT_ID || process.env.FACEBOOK_CLIENT_ID,
          clientSecret: process.env.WHATSAPP_CLIENT_SECRET || process.env.FACEBOOK_CLIENT_SECRET,
          scope: 'whatsapp_business_management,whatsapp_business_messaging'
        };
      case 'YouTube':
        return {
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          clientId: process.env.YOUTUBE_CLIENT_ID,
          clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
          scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile',
          redirectUri: 'https://aautoflow.vercel.app/callback/youtube'
        };
      default:
        return null;
    }
  };

  // 1. Initial OAuth Redirect
  app.get('/api/auth/url/:platform', (req, res) => {
    const { platform } = req.params;
    const config = getOAuthConfig(platform);
    
    if (!config || !config.clientId) {
      const idLabel = platform === 'TikTok' ? 'Client Key' : 'Client ID';
      return res.status(404).json({ 
        error: 'Plataforma não configurada',
        message: `A chave de API (${idLabel}) para ${platform} não foi encontrada nas definições da aplicação.`
      });
    }

    const appUrl = process.env.APP_URL || `https://${req.get('host')}`;
    const redirectUri = config.redirectUri || `${appUrl}/auth/callback/${platform}`;
    
    console.log(`[OAuth Redirect Prep] Platform: ${platform}, Target RedirectURI: ${redirectUri}`);

    const params = new URLSearchParams();
    
    if (platform === 'TikTok') {
      params.append('client_key', config.clientId!);
    } else {
      params.append('client_id', config.clientId!);
    }

    params.append('redirect_uri', redirectUri);
    params.append('scope', config.scope!);
    params.append('response_type', 'code');
    params.append('state', Math.random().toString(36).substring(7));

    // Specific params for platforms
    if (platform === 'YouTube') {
      params.append('access_type', 'offline');
      params.append('prompt', 'consent');
    }

    res.json({ url: `${config.authUrl}?${params.toString()}` });
  });

  // Handle deep links and SPA routes
  const serveSPA = (req: any, res: any) => {
    const distPath = path.join(process.cwd(), 'dist');
    if (process.env.NODE_ENV === "production") {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      // In dev mode, we redirect to the root so Vite middleware can handle the SPA routing
      // BUT we preserve the path in the URL. Vite's spa handle should take over.
      // Actually, in development with middlewareMode: true and appType: 'spa', 
      // Vite should handle this automatically if we don't catch it.
      // So we just don't catch it and let it fall through to vite.middlewares.
      res.sendFile(path.join(process.cwd(), 'index.html'));
    }
  };

  // Specifically handle the /dashboard and other view paths requested for deep linking
  app.get(['/', '/dashboard', '/painel', '/perfil', '/conexoes', '/publicacoes', '/anuncios', '/integrações', '/robôs-automações', '/calendario', '/clientes', '/leads', '/relatórios', '/configurações', '/modelos', '/financeiro', '/plano-profissional', '/terms', '/privacy', '/callback/youtube', '/auth/callback/:platform'], async (req: any, res: any, next: any) => {
    const { code, error } = req.query;
    
    // Auth redirect handling
    if (code) {
      return res.redirect(`/?code=${code}&platform=TikTok`);
    }
    
    if (process.env.NODE_ENV === "production") {
      const distPath = path.join(process.cwd(), 'dist');
      return res.sendFile(path.join(distPath, 'index.html'));
    } else {
      // In dev mode, we MUST let Vite handle the index.html transformation
      // by calling next() and letting vite.middlewares (SPA mode) take over.
      next();
    }
  });

  // Old /callback handler - redirect to /dashboard to avoid broken links
  app.get('/callback', (req, res) => {
    const query = new URLSearchParams(req.query as any).toString();
    res.redirect(`/dashboard${query ? '?' + query : ''}`);
  });

  // Dedicated API route for frontend to request token exchange
  app.post('/api/auth/exchange', express.json(), async (req, res) => {
    const { code, platform } = req.body;
    const config = getOAuthConfig(platform);

    if (!code || !config || !config.clientId || !config.clientSecret) {
      return res.status(400).json({ error: 'Código ou configuração em falta.' });
    }

    try {
      const appUrl = process.env.APP_URL || `https://${req.get('host')}`;
      const redirectUri = config.redirectUri || `${appUrl}/auth/callback/${platform}`;

      console.log(`[OAuth Exchange Request]`);
      console.log(`- Platform: ${platform}`);
      console.log(`- Redirect URI used: ${redirectUri}`);
      console.log(`- App URL detected: ${appUrl}`);

      let tokenResponse;
      if (platform === 'TikTok' || platform === 'YouTube') {
        const bodyParams: any = {
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code: code as string,
          client_id: config.clientId!,
          client_secret: config.clientSecret!,
        };
        
        if (platform === 'TikTok') {
          bodyParams.client_key = config.clientId!;
          delete bodyParams.client_id;
        }

        const body = new URLSearchParams(bodyParams);
        console.log(`- Exchange URL: ${config.tokenUrl}`);
        
        try {
          tokenResponse = await axios.post(config.tokenUrl, body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });
          console.log(`- Exchange Success: ${tokenResponse.status}`);
        } catch (axiosErr: any) {
          console.error(`- Exchange Failure: ${axiosErr.response?.status}`);
          console.error(`- Error Data:`, JSON.stringify(axiosErr.response?.data || axiosErr.message));
          throw axiosErr;
        }
      } else {
        tokenResponse = await axios.post(config.tokenUrl, {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code: code
        });
      }

      // For TikTok, tokens might be in data.data or data
      const tokenData = tokenResponse.data;
      const accessToken = tokenData.access_token || tokenData.data?.access_token;
      const openId = tokenData.open_id || tokenData.data?.open_id;

      let userBasicInfo = null;
      if (platform === 'TikTok' && accessToken) {
        try {
          const infoRes = await axios.get('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          userBasicInfo = infoRes.data.data?.user;
        } catch (e) {
          console.error('Failed to fetch user info:', e);
        }
      }

      res.json({ 
        success: true, 
        token: accessToken, 
        openId: openId,
        user: userBasicInfo 
      });
    } catch (err: any) {
      console.error('Token exchange error:', err.response?.data || err.message);
      res.status(500).json({ error: 'Erro na troca de token', details: err.response?.data || err.message });
    }
  });

  // 2. OAuth Callback Handler
  app.get(['/auth/callback/:platform', '/auth/callback/:platform/'], async (req, res) => {
    const { platform } = req.params;
    const { code, error } = req.query;
    const config = getOAuthConfig(platform);

    if (error) {
      return res.send(`
        <html><body>
          <script>
            window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', platform: '${platform}', error: '${error}' }, '*');
            window.close();
          </script>
        </body></html>
      `);
    }

    if (!code || !config || !config.clientId || !config.clientSecret) {
      return res.status(400).json({ 
        error: 'Configuração incompleta', 
        details: 'Código, ID de Cliente ou Segredo de Cliente em falta para esta plataforma.' 
      });
    }

    try {
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const redirectUri = `${appUrl}/auth/callback/${platform}`;

      // Exchange code for token
      let tokenResponse;
      if (platform === 'TikTok') {
        const body = new URLSearchParams({
          client_key: config.clientId!,
          client_secret: config.clientSecret!,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code: code as string
        });
        tokenResponse = await axios.post(config.tokenUrl, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
      } else {
        tokenResponse = await axios.post(config.tokenUrl, {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code: code
        });
      }

      const accessToken = tokenResponse.data.access_token;

      // Send success message and close popup
      res.send(`
        <html>
          <body style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:white;font-family:sans-serif;">
            <div style="text-align:center;">
              <h2 style="color:#10b981;">Conectado com sucesso!</h2>
              <p>A fechar janela...</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  platform: '${platform}',
                  token: '${accessToken}'
                }, '*');
                setTimeout(() => window.close(), 1000);
              } else {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('OAuth exchange error:', err.response?.data || err.message);
      res.status(500).json({ 
        error: 'Erro na troca de token OAuth', 
        details: err.response?.data || err.message 
      });
    }
  });

  // Keep the old mock endpoint for OLX or as fallback
  app.get('/platform/login/:platform', (req, res) => {
    const { platform } = req.params;
    res.send(`
      <html><body>
        <div style="padding:40px;text-align:center;font-family:sans-serif;">
          <h2>Login Simulado: ${platform}</h2>
          <button onclick="auth()" style="padding:10px 20px;cursor:pointer;">Autorizar</button>
        </div>
        <script>
          function auth() {
            window.opener.postMessage({ 
              type: 'OAUTH_AUTH_SUCCESS', 
              platform: '${platform}',
              token: 'mock_token_' + Math.random().toString(36).substring(7)
            }, '*');
            window.close();
          }
        </script>
      </body></html>
    `);
  });

  // 3. Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // No catch-all '*' handler here - only predefined routes will serve index.html
    // This follows the user requirement: "apenas os links definidos devem servir sem excessão"
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
