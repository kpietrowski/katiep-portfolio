import { Resend } from 'resend';
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, message } = req.body;

    // Validate
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const submission = {
      id: Date.now().toString(),
      name,
      email,
      message,
      createdAt: new Date().toISOString(),
    };

    // Store in Vercel KV database
    try {
      await kv.lpush('submissions', JSON.stringify(submission));
    } catch (kvError) {
      console.error('KV storage error:', kvError);
      // Continue even if KV fails
    }

    // Send email notification via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: 'Katie P Website <onboarding@resend.dev>', // Update after verifying domain
      to: process.env.NOTIFICATION_EMAIL || 'hello@katiep.me',
      subject: `New inquiry from ${name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">New Project Inquiry</h2>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 0 0 10px;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          </div>

          <div style="background: #fff5f5; padding: 20px; border-radius: 8px; border-left: 4px solid #ff6b6b;">
            <p style="margin: 0 0 10px;"><strong>Project Idea:</strong></p>
            <p style="margin: 0; white-space: pre-wrap;">${message}</p>
          </div>

          <p style="color: #888; font-size: 14px; margin-top: 30px;">
            Sent from katiep.me contact form
          </p>
        </div>
      `,
    });

    return res.status(200).json({ success: true, id: submission.id });

  } catch (error) {
    console.error('Submission error:', error);
    return res.status(500).json({ error: 'Submission failed', details: error.message });
  }
}
