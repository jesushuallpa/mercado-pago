import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import path from 'path';
import mercadopago from 'mercadopago/dist/cjs/mercadopago.cjs.js';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Firebase
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_KEY_JSON)),
});

const app = express();
const PORT = process.env.PORT || 3000;
const db = admin.firestore();

// ✅ Necesario para parsear JSON en solicitudes POST
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('🚀 Servidor de Mercado Pago funcionando correctamente.');
});

// Ruta de callback OAuth
app.get('/oauth_callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state || null;

  if (!code) return res.status(400).send('Falta el código de autorización.');

  try {
    const tokenResponse = await axios.post('https://api.mercadopago.com/oauth/token', null, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code,
        redirect_uri: process.env.REDIRECT_URI,
      },
    });

    const { access_token, user_id, public_key } = tokenResponse.data;
    const uid = state;

    await db.collection('usuario').doc(uid).set({
      mp_connected: true,
      mp_access_token: access_token,
      mp_user_id: user_id,
      mp_public_key: public_key,
      metodoPagoRegistrado: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.send('✅ Tu cuenta de Mercado Pago ha sido conectada exitosamente.');
  } catch (error) {
    console.error('❌ Error al conectar con Mercado Pago:', error.response?.data || error.message);
    res.status(500).send('Error al conectar con Mercado Pago.');
  }
});

// Ruta para crear preferencia de pago
app.post('/create_preference', async (req, res) => {
  try {
    const { vendedorId, items } = req.body;

    console.log('📦 Datos recibidos en /create_preference');
    console.log('🧾 vendedorId:', vendedorId);
    console.log('📋 items:', items);

    if (!vendedorId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const vendedorDoc = await db.collection('usuario').doc(vendedorId).get();
    console.log('📄 vendedorDoc.exists:', vendedorDoc.exists);

    if (!vendedorDoc.exists) {
      return res.status(404).json({ error: 'Vendedor no encontrado' });
    }

    const data = vendedorDoc.data();
    console.log('🧑‍💼 Datos del vendedor:', data);

    if (!data || !data.mp_access_token) {
      return res.status(400).json({ error: 'El vendedor no tiene cuenta de Mercado Pago conectada' });
    }

    const accessToken = data.mp_access_token;
    console.log('🔐 Token de acceso:', accessToken);

    mercadopago.configure({ access_token: accessToken });

    const preference = {
      items: items.map(item => ({
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: 'PEN',
      })),
      back_urls: {
        success: 'https://tusitio.com/success',
        failure: 'https://tusitio.com/failure',
        pending: 'https://tusitio.com/pending',
      },
      auto_return: 'approved',
    };

    const result = await mercadopago.preferences.create(preference);
    console.log('✅ Preferencia creada:', result.body.id);

    res.json({ init_point: result.body.init_point });

  } catch (error) {
  const msg = error.response?.data || error.message || error;
  console.error('❌ Error al crear preferencia:', msg);
  res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
