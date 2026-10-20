const { GoogleGenAI } = require("@google/genai");
const axios = require('axios');
const express = require('express');

// আপনার সিস্টেম প্রম্পট বা বিজনেসের নিয়ম
const SYSTEM_PROMPT = "You are a helpful customer support assistant for Glama.";

// Gemini API ইনিশিয়ালাইজেশন (New SDK)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
app.use(express.json());

// 1. Webhook Verification (GET) - মেটা ভেরিফিকেশনের জন্য
app.get('/api/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log("GET Webhook Hit Received!");
  console.log("Mode:", mode);
  console.log("Token received from Meta:", token);

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED Successfully');
      return res.status(200).send(challenge);
    } else {
      console.log('Token mismatch!');
      return res.status(403).send('Forbidden: Token mismatch');
    }
  } else {
    console.log('Missing mode or token!');
    return res.status(400).send('Bad Request: Missing parameters');
  }
});

// 2. Incoming Messages Webhook (POST)
app.post('/api/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');

    for (const entry of body.entry) {
      if (!entry.messaging) continue;
      
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        const userMessage = webhook_event.message.text;

        // জেমিনাই থেকে উত্তর আনা
        const aiReply = await getGeminiReply(userMessage);

        // কাস্টমারকে মেসেঞ্জারে উত্তর পাঠানো
        await sendMessengerMessage(sender_psid, aiReply);
      }
    }
  } else {
    res.sendStatus(404);
  }
});

// Gemini API Call Function (New GoogleGenAI Syntax)
async function getGeminiReply(userMessage) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\nCustomer Message: "${userMessage}"` }] }
      ]
    });
    
    return response.text;
  } catch (error) {
    console.error('Gemini API Error:', error);
    return 'ধন্যবাদ আপনার মেসেজের জন্য। আমাদের প্রতিনিধি খুব দ্রুতই আপনার সাথে যোগাযোগ করবে।';
  }
}

// Send Reply Back to Messenger API
async function sendMessengerMessage(sender_psid, responseText) {
  const request_body = {
    recipient: { id: sender_psid },
    message: { text: responseText }
  };

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
      request_body
    );
  } catch (error) {
    console.error('Messenger Send Error:', error.response ? error.response.data : error.message);
  }
}

module.exports = app;
