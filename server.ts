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
          authUrl: 'https://www.tiktok.com/auth/authorize/',
          tokenUrl: 'https://open-api.tiktok.com/oauth/access_token/',
          clientId: process.env.TIKTOK_CLIENT_ID,
          clientSecret: process.env.TIKTOK_CLIENT_SECRET,
          scope: 'user.info.basic,video.list'
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
      default:
        return null;
    }
  };

  // 1. Initial OAuth Redirect
  app.get('/api/auth/url/:platform', (req, res) => {
    const { platform } = req.params;
    const config = getOAuthConfig(platform);
    
    if (!config || !config.clientId) {
      // If not configured, show a helpful setup page instead of a raw error
      return res.status(404).json({ 
        error: 'Plataforma não configurada',
        message: `As chaves de API (Client ID) para ${platform} não foram encontradas nas definições da aplicação (Settings > Env Vars).`
      });
    }

    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const redirectUri = `${appUrl}/auth/callback/${platform}`;
    
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: config.scope,
      response_type: 'code',
      state: Math.random().toString(36).substring(7)
    });

    res.json({ url: `${config.authUrl}?${params.toString()}` });
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
      return res.status(400).send('Código ou configuração em falta.');
    }

    try {
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const redirectUri = `${appUrl}/auth/callback/${platform}`;

      // Exchange code for token
      const response = await axios.post(config.tokenUrl, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code
      });

      const accessToken = response.data.access_token;

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
      res.status(500).send(`Erro na troca de token: ${JSON.stringify(err.response?.data || err.message)}`);
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
