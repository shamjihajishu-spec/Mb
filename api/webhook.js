const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

// Environment Variables (Vercel থেকে আসবে)
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Gemini Initialize
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// System Prompt (আপনার চ্যাটবটের নিয়ম ও রিপ্লাই ফরম্যাট)
const SYSTEM_PROMPT = `
তুমি আমাদের ব্র্যান্ডের একজন কাস্টমার সাপোর্ট প্রতিনিধি। 
খুবই নম্র, প্রফেশনাল ও বন্ধুবৎসল ভাষায় বাংলায় উত্তর দেবে।

তোমার প্রধান কাজ:
১. কাস্টমারের প্রশ্নের সংক্ষিপ্ত ও স্পষ্ট উত্তর দেওয়া।
২. কাস্টমার কোনো প্রোডাক্ট অর্ডার করতে চাইলে বা নিতে আগ্রহী হলে তার থেকে এই ৩টি তথ্য চেয়ে নেবে:
   - নাম
   - মোবাইল নম্বর (১১ ডিজিট)
   - ডেলিভারি ঠিকানা
৩. অনর্থক বা অপ্রাসঙ্গিক কথা বলবে না।
`;

// ১. Webhook Verification (Meta-র সার্ভার চেক)
app.get('/api/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// ২. Incoming Message Event Handling
app.post('/api/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    // Meta-কে সাথে সাথে ২০০ ওকে সংকেত পাঠানো
    res.status(200).send('EVENT_RECEIVED');

    for (const entry of body.entry) {
      const webhook_event = entry.messaging[0];
      if (!webhook_event) continue;

      const sender_psid = webhook_event.sender.id;

      // কাস্টমার যদি টেক্সট মেসেজ পাঠায়
      if (webhook_event.message && webhook_event.message.text) {
        const userMessage = webhook_event.message.text;

        // Gemini API থেকে রিপ্লাই জেনারেট করা
        const aiReply = await getGeminiReply(userMessage);

        // কাস্টমারকে মেসেঞ্জারে উত্তর পাঠানো
        await sendMessengerMessage(sender_psid, aiReply);
      }
    }
  } else {
    res.sendStatus(404);
  }
});

// Gemini API Call Function
async function getGeminiReply(userMessage) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `${SYSTEM_PROMPT}\n\nCustomer Message: "${userMessage}"\nReply:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
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
      `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      request_body
    );
  } catch (error) {
    console.error('Messenger Send Error:', error.response ? error.response.data : error.message);
  }
}

module.exports = app;
