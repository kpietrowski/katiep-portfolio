// Renders an App Design Kit from /api/design-kit?id=…
// Everything from the kit is inserted as text (never as HTML); colours, fonts
// and icon names are checked against strict patterns before they reach CSS.
(function () {
  var root = document.getElementById('kit');
  var id = new URLSearchParams(location.search).get('id');
  var ICON_CDN = 'https://cdn.jsdelivr.net/npm/lucide-static@0.460.0/icons/';
  var HEX = /^#[0-9A-Fa-f]{6}$/;
  var FONT = /^[A-Za-z0-9 ]{2,40}$/;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function section(cls, kids) { return el('section', { class: 'r-section ' + (cls || '') }, [el('div', { class: 'wrap' }, kids)]); }
  function h2(plain, italic) { return el('h2', { class: 'display r-h2' }, [plain, italic ? el('em', { text: italic }) : null]); }
  function fail(msg) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'wrap narrow center report-loading' }, [
      el('p', { class: 'body', text: msg }),
      el('a', { class: 'pill-btn', href: '/design', text: 'Make a design kit' })
    ]));
  }

  if (!id) return fail('This link is missing its design kit. Make a new one in a minute.');

  fetch('/api/design-kit?id=' + encodeURIComponent(id))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function () { fail("I couldn't find this design kit. It may have expired, or the link is incomplete."); });

  // ---------- helpers ----------
  function safeHex(h, fallback) { return HEX.test(h || '') ? h : fallback; }
  function mix(hex, other, t) { // blend hex toward other by t (0..1)
    var a = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
    var b = [1, 3, 5].map(function (i) { return parseInt(other.slice(i, i + 2), 16); });
    return '#' + a.map(function (v, i) { return ('0' + Math.round(v + (b[i] - v) * t).toString(16)).slice(-2); }).join('');
  }
  function loadFont(name) {
    if (!FONT.test(name || '')) return;
    var fam = name.replace(/ /g, '+') + (name === 'DM Serif Display' ? '' : ':wght@400;600;700');
    document.head.appendChild(el('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=' + fam + '&display=swap' }));
  }
  function fontStack(name, serifish) { return FONT.test(name || '') ? "'" + name + "', " + (serifish ? 'Georgia, serif' : 'system-ui, sans-serif') : 'system-ui, sans-serif'; }
  var SERIFS = ['Fraunces', 'Lora', 'Playfair Display', 'DM Serif Display'];

  function applyTheme(node, p) {
    node.style.setProperty('--k-bg', p.background);
    node.style.setProperty('--k-card', p.card);
    node.style.setProperty('--k-text', p.text);
    node.style.setProperty('--k-sec', p.secondary);
    node.style.setProperty('--k-accent', p.accent);
    node.style.setProperty('--k-on', p.accentText);
    node.style.setProperty('--k-line', mix(p.card, p.text, 0.14));
    node.style.setProperty('--k-soft', mix(p.background, p.accent, 0.14));
  }

  function icon(glyph, brand, size, mode) {
    var p = brand.palette[mode || 'light'];
    var tile = el('span', { class: 'k-icon', role: 'img', 'aria-label': 'App icon' });
    tile.style.width = tile.style.height = size + 'px';
    tile.style.background = brand.icon.background === 'solid' ? p.accent
      : 'linear-gradient(150deg, ' + mix(p.accent, '#FFFFFF', 0.28) + ' 0%, ' + p.accent + ' 55%, ' + mix(p.accent, '#000000', 0.12) + ' 100%)';
    var g = el('span', { class: 'k-glyph' });
    if (/^[a-z0-9-]{2,40}$/.test(glyph || '')) {
      var url = 'url("' + ICON_CDN + glyph + '.svg")';
      g.style.webkitMaskImage = g.style.maskImage = url;
    }
    g.style.background = p.accentText;
    tile.appendChild(g);
    return tile;
  }

  function checkIcon() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M20 6 9 17l-5-5');
    s.appendChild(path);
    return s;
  }

  // ---------- phone mockups ----------
  function phone(caption, screen) {
    return el('figure', { class: 'k-phone-wrap' }, [
      el('div', { class: 'k-phone' }, [el('div', { class: 'k-notch' }), screen]),
      el('figcaption', { text: caption })
    ]);
  }

  function launchScreen(b, name, mode) {
    return el('div', { class: 'k-screen k-launch' }, [
      icon(b.icon.glyph, b, 84, mode),
      el('div', { class: 'k-h k-launch-name', text: name }),
      el('div', { class: 'k-sec-text', text: b.screens.launch.tagline || '' })
    ]);
  }

  function onboardingScreen(b) {
    var o = b.screens.onboarding;
    var answers = (o.answers || []).slice(0, 4).map(function (a, i) {
      return el('div', { class: 'k-answer' + (i === 1 ? ' on' : '') }, [el('span', { text: a }), i === 1 ? el('span', { class: 'k-tick' }, [checkIcon()]) : null]);
    });
    return el('div', { class: 'k-screen k-onb' }, [
      el('div', { class: 'k-progress' }, [el('span')]),
      el('div', { class: 'k-step', text: 'Step 2 of 5' }),
      el('div', { class: 'k-h k-q', text: o.question || '' }),
      el('div', { class: 'k-sec-text k-why', text: o.why || '' }),
      el('div', { class: 'k-answers' }, answers),
      el('div', { class: 'k-btn', text: 'Continue' })
    ]);
  }

  function paywallScreen(b, name, mode) {
    var pw = b.screens.paywall;
    var plans = (pw.plans || []).slice(0, 2).map(function (p, i) {
      return el('div', { class: 'k-plan' + (i === 0 ? ' on' : '') }, [
        i === 0 && p.note ? el('span', { class: 'k-badge', text: p.note }) : null,
        el('span', { class: 'k-plan-label', text: p.label || '' }),
        el('span', { class: 'k-plan-price', text: p.price || '' })
      ]);
    });
    return el('div', { class: 'k-screen k-pay' }, [
      el('div', { class: 'k-close', text: '×', 'aria-hidden': 'true' }),
      icon(b.icon.glyph, b, 52, mode),
      el('div', { class: 'k-h k-pay-h', text: pw.headline || '' }),
      el('ul', { class: 'k-benefits' }, (pw.benefits || []).slice(0, 3).map(function (x) {
        return el('li', {}, [el('span', { class: 'k-check' }, [checkIcon()]), el('span', { text: x })]);
      })),
      el('div', { class: 'k-plans' }, plans),
      el('div', { class: 'k-trial', text: pw.trial || '' }),
      el('div', { class: 'k-btn', text: pw.cta || 'Continue' }),
      el('div', { class: 'k-legal', text: 'Restore · Terms · Privacy' })
    ]);
  }

  // ---------- render ----------
  function render(kit) {
    var b = kit.brand;
    ['light', 'dark'].forEach(function (m) {
      var p = b.palette[m] || {};
      b.palette[m] = {
        background: safeHex(p.background, m === 'light' ? '#FBF8F4' : '#161618'),
        card: safeHex(p.card, m === 'light' ? '#FFFFFF' : '#222226'),
        text: safeHex(p.text, m === 'light' ? '#1A1A1A' : '#F5F2EE'),
        secondary: safeHex(p.secondary, m === 'light' ? '#5A5A5A' : '#B5B0AA'),
        accent: safeHex(p.accent, '#FF6B6B'),
        accentText: safeHex(p.accentText, '#FFFFFF')
      };
    });
    b.icon = b.icon || {};
    b.screens = b.screens || { launch: {}, onboarding: {}, paywall: {} };
    var name = (b.names && b.names[0] && b.names[0].name) || 'Your app';
    document.title = name + ': App Design Kit | Katie P.';

    loadFont(b.fonts.heading);
    if (b.fonts.body !== b.fonts.heading) loadFont(b.fonts.body);
    root.style.setProperty('--k-hfont', fontStack(b.fonts.heading, SERIFS.indexOf(b.fonts.heading) > -1));
    root.style.setProperty('--k-bfont', fontStack(b.fonts.body, SERIFS.indexOf(b.fonts.body) > -1));
    root.innerHTML = '';

    // Hero
    var hero = el('section', { class: 'k-hero' }, [el('div', { class: 'wrap narrow center' }, [
      el('p', { class: 'kicker', text: (kit.first_name ? kit.first_name + "'s" : 'Your') + ' App Design Kit' }),
      icon(b.icon.glyph, b, 128, 'light'),
      el('h1', { class: 'k-title', text: name }),
      el('p', { class: 'k-tagline', text: b.screens.launch.tagline || '' }),
      el('p', { class: 'body k-personality', text: b.personality || '' }),
      el('div', { class: 'k-chips' }, (b.adjectives || []).map(function (a) { return el('span', { class: 'k-chip', text: a }); })),
      el('p', { class: 'k-style', text: 'Style: ' + (kit.input.style_label || '') })
    ])]);
    applyTheme(hero, b.palette.light);
    root.appendChild(hero);

    // Screens
    var phones = el('div', { class: 'k-phones' });
    function drawPhones(mode) {
      phones.innerHTML = '';
      applyTheme(phones, b.palette[mode]);
      phones.appendChild(phone('Launch screen', launchScreen(b, name, mode)));
      phones.appendChild(phone('Onboarding question', onboardingScreen(b)));
      phones.appendChild(phone('Paywall', paywallScreen(b, name, mode)));
    }
    var toggle = el('div', { class: 'k-toggle', role: 'group', 'aria-label': 'Light or dark mode' });
    ['light', 'dark'].forEach(function (m) {
      var btn = el('button', { type: 'button', class: m === 'light' ? 'on' : '', 'aria-pressed': String(m === 'light'), text: m === 'light' ? 'Light mode' : 'Dark mode' });
      btn.addEventListener('click', function () {
        toggle.querySelectorAll('button').forEach(function (x) { x.className = ''; x.setAttribute('aria-pressed', 'false'); });
        btn.className = 'on'; btn.setAttribute('aria-pressed', 'true');
        drawPhones(m);
      });
      toggle.appendChild(btn);
    });
    drawPhones('light');
    root.appendChild(section('k-screens', [
      el('div', { class: 'center' }, [h2('Your key ', 'screens.'), el('p', { class: 'r-sub', text: "The words are written using Katie's method: questions people expect, then a paywall that names the outcome. Prices are examples only." }), toggle]),
      phones
    ]));

    // Names
    root.appendChild(section('r-tint', [
      h2('Name ', 'ideas.'),
      el('p', { class: 'r-sub', text: 'Each name was searched on the US App Store. This is a quick check, not a trademark search.' }),
      el('div', { class: 'k-names' }, (b.names || []).map(function (n) {
        var c = n.check || {};
        var status = c.taken ? el('span', { class: 'k-flag taken', text: 'Similar app: ' + (c.app || 'already taken') })
          : c.taken === false ? el('span', { class: 'k-flag free', text: 'No exact match on the App Store' })
          : el('span', { class: 'k-flag', text: "Couldn't check" });
        return el('div', { class: 'k-name' }, [el('div', { class: 'k-name-text', text: n.name }), el('p', { text: n.why || '' }), status]);
      }))
    ]));

    // Colours
    var KEYS = [['background', 'Background'], ['card', 'Cards'], ['text', 'Text'], ['secondary', 'Secondary text'], ['accent', 'Accent'], ['accentText', 'Text on accent']];
    function swatches(mode) {
      return el('div', { class: 'k-swatches' }, KEYS.map(function (k) {
        var hex = b.palette[mode][k[0]];
        var btn = el('button', { type: 'button', class: 'k-swatch', title: 'Copy ' + hex }, [
          el('span', { class: 'k-chip-color' }),
          el('span', { class: 'k-sw-label', text: k[1] }),
          el('span', { class: 'k-sw-hex', text: hex })
        ]);
        btn.firstChild.style.background = hex;
        btn.addEventListener('click', function () {
          try { navigator.clipboard.writeText(hex); } catch (e) {}
          var h = btn.querySelector('.k-sw-hex'); h.textContent = 'Copied'; setTimeout(function () { h.textContent = hex; }, 1200);
        });
        return btn;
      }));
    }
    root.appendChild(section('', [
      h2('Your ', 'colours.'),
      el('p', { class: 'r-sub', text: 'Tap a colour to copy it. Every pair was checked so the text is easy to read.' }),
      el('h3', { class: 'r-h3', text: 'Light mode' }), swatches('light'),
      el('h3', { class: 'r-h3 k-gap', text: 'Dark mode' }), swatches('dark')
    ]));

    // Inspiration: what the competitors look like, and how this look stands apart
    var insp = b.inspiration || {};
    if (insp.apps && insp.apps.length) {
      var inspSec = section('k-insp', [
        h2('Inspired by your ', 'space.'),
        insp.category ? el('p', { class: 'body k-insp-lead', text: insp.category }) : null,
        el('div', { class: 'k-insp-apps' }, insp.apps.map(function (a) {
          var img = /^https:\/\/[a-z0-9.-]+\.mzstatic\.com\//.test(a.icon || '') ? el('img', { src: a.icon, alt: '', width: '56', height: '56', loading: 'lazy' }) : null;
          var dots = el('span', { class: 'k-dots' }, (a.colors || []).filter(function (h) { return HEX.test(h); }).map(function (h) {
            var d = el('span', { class: 'k-dot', title: h }); d.style.background = h; return d;
          }));
          return el('div', { class: 'k-insp-app' }, [
            el('div', { class: 'k-insp-head' }, [img, el('div', {}, [el('div', { class: 'k-insp-name', text: a.name }), dots])]),
            el('p', { text: a.takeaway || '' })
          ]);
        })),
        insp.standout ? el('div', { class: 'k-standout' }, [
          icon(b.icon.glyph, b, 56, 'light'),
          el('div', {}, [el('span', { class: 'grade-kind', text: 'How yours stands apart' }), el('p', { text: insp.standout })])
        ]) : null,
        el('p', { class: 'r-sub k-gap', text: 'Inspiration only: your colours, name and icon are your own, not copied from these apps.' })
      ]);
      applyTheme(inspSec, b.palette.light);
      root.appendChild(inspSec);
    }

    // Fonts + icon
    var fontCard = function (role, fam, sample, big) {
      var s = el('div', { class: big ? 'k-font-sample big' : 'k-font-sample', text: sample });
      s.style.fontFamily = fontStack(fam, SERIFS.indexOf(fam) > -1);
      return el('div', { class: 'k-font' }, [el('span', { class: 'grade-kind', text: role }), el('div', { class: 'k-font-name', text: fam }), s]);
    };
    root.appendChild(section('r-tint', [el('div', { class: 'two' }, [
      el('div', {}, [
        h2('Your ', 'fonts.'),
        fontCard('Headings', b.fonts.heading, b.screens.paywall.headline || name, true),
        fontCard('Body text', b.fonts.body, b.personality || '', false),
        el('p', { class: 'r-sub k-gap', text: 'Both are free Google Fonts. Prefer to keep it simple? Use ' + (b.fonts.system_fallback || 'SF Pro Rounded') + ', which is built into every iPhone.' })
      ]),
      el('div', {}, [
        h2('Your ', 'app icon.'),
        el('div', { class: 'k-icon-row' }, [icon(b.icon.glyph, b, 120, 'light'), icon(b.icon.glyph, b, 76, 'light'), icon(b.icon.glyph, b, 60, 'dark')]),
        el('p', { class: 'body', text: b.icon.note || '' }),
        el('p', { class: 'r-sub', text: 'Symbol: "' + (b.icon.glyph || '') + '" from the free Lucide icon set. A simple symbol on your accent colour reads well at every size, from the App Store to the home screen.' })
      ])
    ])]));

    // Next step
    root.appendChild(section('r-dark k-next', [el('div', { class: 'narrow center' }, [
      el('p', { class: 'kicker', text: 'Next step' }),
      el('h2', { class: 'display r-h2' }, ['Now let’s ', el('em', { text: 'build it.' })]),
      el('p', { class: 'body', text: 'Download your kit as one file. On Day 3 of App in 30 Days, you drop it into your project and Claude turns it into your app’s colours, fonts and screens.' }),
      el('div', { class: 'k-actions' }, [
        el('a', { class: 'pill-btn', href: '/app', text: 'Join App in 30 Days' }),
        el('a', { class: 'pill-btn ghost', href: '/api/design-kit?id=' + encodeURIComponent(kit.id) + '&format=md&download=1', text: 'Download my kit (brand.md)' })
      ]),
      kit.input.idea ? null : el('p', { class: 'fine' }, ['Haven’t checked your idea yet? ', el('a', { href: '/idea', text: 'Get your App Idea Report Card' }), '.'])
    ])]));
  }
})();
