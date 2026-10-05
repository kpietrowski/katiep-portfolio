// GET /api/families-checkout[?email=...]
// Sends the buyer to the Stripe payment link for Families 101 ($27), with her
// email prefilled when she came through the opt-in. Keeping the link in an env
// var means the pages never need editing if the price or link changes.
//
// Env: FAMILIES_PAYMENT_LINK (e.g. https://buy.stripe.com/xxxx)

export default function handler(req, res) {
  const link = process.env.FAMILIES_PAYMENT_LINK;
  if (!link) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(503).send('Checkout is opening soon. Please check back shortly.');
  }
  const url = new URL(link);
  const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) url.searchParams.set('prefilled_email', email);
  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(302, { Location: url.toString() });
  res.end();
}
