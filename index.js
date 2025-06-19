import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

admin.initializeApp({
  credential: admin.credential.cert(
    path.resolve(__dirname, 'firebase-key.json') // 🔐 ← clave privada de Firebase
  ),
});

const app = express();
const PORT = process.env.PORT || 3000;
const db = admin.firestore();

// Ruta que recibe el code de Mercado Pago
app.get('/oauth_callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state || null;

  if (!code) {
    return res.status(400).send('Falta el código de autorización.');
  }

  try {
    const tokenResponse = await axios.post('https://api.mercadopago.com/oauth/token', null, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code: code,
        redirect_uri: process.env.REDIRECT_URI,
      },
    });

    const { access_token, user_id, public_key } = tokenResponse.data;
    const uid = state;

    await db.collection('usuario').doc(uid).set(
      {
        mp_connected: true,
        mp_access_token: access_token,
        mp_user_id: user_id,
        mp_public_key: public_key,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.send('✅ Tu cuenta de Mercado Pago ha sido conectada exitosamente.');
  } catch (error) {
    console.error('❌ Error al conectar con Mercado Pago:', error.response?.data || error.message);
    res.status(500).send('Error al conectar con Mercado Pago.');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
