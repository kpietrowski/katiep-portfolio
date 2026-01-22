import { OpenAI } from 'openai';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the multipart form data
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Extract the audio file from multipart data
    const boundary = req.headers['content-type'].split('boundary=')[1];
    const parts = buffer.toString('binary').split(`--${boundary}`);

    let audioData = null;
    for (const part of parts) {
      if (part.includes('filename=')) {
        const dataStart = part.indexOf('\r\n\r\n') + 4;
        const dataEnd = part.lastIndexOf('\r\n');
        audioData = Buffer.from(part.slice(dataStart, dataEnd), 'binary');
        break;
      }
    }

    if (!audioData) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Create OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create a File object for the API
    const file = new File([audioData], 'audio.webm', { type: 'audio/webm' });

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });

    return res.status(200).json({ text: transcription.text });

  } catch (error) {
    console.error('Transcription error:', error);
    return res.status(500).json({ error: 'Transcription failed', details: error.message });
  }
}
