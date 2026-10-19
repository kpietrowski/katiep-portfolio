// Renders an App Idea Audit from /api/idea-report?id=…
// Everything from the report is inserted as text (never as HTML).
(function () {
  var root = document.getElementById('report');
  var id = new URLSearchParams(location.search).get('id');

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
  function section(cls, kids) { return el('section', { class: 'r-section ' + (cls || '') }, [el('div', { class: 'wrap narrow' }, kids)]); }
  function h2(plain, italic) { return el('h2', { class: 'display r-h2' }, [plain, italic ? el('em', { text: italic }) : null]); }
  function fail(msg) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'wrap narrow center report-loading' }, [
      el('p', { class: 'body', text: msg }),
      el('a', { class: 'pill-btn', href: '/idea', text: 'Grade an idea' })
    ]));
  }

  if (!id) return fail("This link is missing its report. Run your idea through the audit to get a new one.");

  fetch('/api/idea-report?id=' + encodeURIComponent(id))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function () { fail("I couldn't find this audit. It may have expired, or the link is incomplete."); });

  function grade(kind, g) {
    return el('div', { class: 'grade-card grade-' + String(g.grade || '').toLowerCase() }, [
      el('div', { class: 'grade-top' }, [
        el('span', { class: 'grade-kind', text: kind }),
        el('span', { class: 'grade-letter', text: g.grade || '–' })
      ]),
      el('div', { class: 'grade-label', text: g.label || '' }),
      el('p', { text: g.why || '' }),
      (g.needs && g.needs.length) ? el('p', { class: 'grade-needs', text: 'Moving parts: ' + g.needs.join(', ') }) : null
    ]);
  }

  function render(rep) {
    var a = rep.analysis;
    document.title = 'App Idea Audit: ' + a.idea_sentence;
    root.innerHTML = '';

    // Header + grades
    root.appendChild(el('section', { class: 'r-hero' }, [el('div', { class: 'wrap narrow' }, [
      el('p', { class: 'kicker', text: 'App Idea Audit' + (rep.first_name ? ' for ' + rep.first_name : '') }),
      el('h1', { class: 'display r-title', text: a.idea_sentence }),
      el('div', { class: 'grades' }, [grade('Build', a.build), grade('Compete', a.compete)]),
      el('p', { class: 'body verdict', text: a.verdict })
    ])]));

    // Competitors
    var comps = el('div', { class: 'comps' });
    function revenue(c) {
      var r = c.revenue;
      if (!r) return null;
      var how = r.basis === 'free' ? 'Nothing to buy in the app'
        : r.plan ? (r.basis === 'paid' ? 'Paid app, $' + r.plan.price : r.plan.name + ', $' + r.plan.price)
        : '';
      return el('div', { class: 'comp-rev' + (r.basis === 'free' ? ' none' : '') }, [
        el('span', { class: 'comp-rev-k', text: 'Est. revenue' }),
        el('span', { class: 'comp-rev-v', text: r.basis === 'free' ? '–' : r.label }),
        how ? el('span', { class: 'comp-rev-how', text: how }) : null
      ]);
    }
    rep.competitors.forEach(function (c) {
      var notes = (a.competitors || []).filter(function (x) { return x.name === c.name; })[0] || {};
      comps.appendChild(el('div', { class: 'comp' }, [
        el('div', { class: 'comp-head' }, [
          c.icon ? el('img', { src: c.icon, alt: '', width: '56', height: '56', loading: 'lazy' }) : null,
          el('div', {}, [
            el('a', { class: 'comp-name', href: c.url, target: '_blank', rel: 'noopener', text: c.name }),
            el('div', { class: 'comp-meta', text: (c.rating ? '★ ' + c.rating + ' · ' : '') + Number(c.ratings).toLocaleString('en-US') + ' ratings · ' + c.price })
          ]),
          revenue(c)
        ]),
        notes.loved_for ? el('p', {}, [el('strong', { text: 'Loved for: ' }), notes.loved_for]) : null,
        notes.complaints ? el('p', {}, [el('strong', { text: 'Complaints: ' }), notes.complaints]) : null
      ]));
    });
    var market = rep.market ? el('div', { class: 'market' }, [
      el('span', { class: 'market-k', text: 'What this space makes' }),
      el('div', { class: 'market-v', text: rep.market.label.replace('/mo', '') }),
      el('p', { text: 'a month, estimated, for the ' + (rep.market.apps === 1 ? 'app' : rep.market.apps + ' apps') + ' below on the US App Store. People are already paying for this. Your job is to make the one they\u2019d rather pay for.' })
    ]) : null;
    root.appendChild(section('', [h2('Your top ', 'competitors'), market, comps,
      rep.market ? el('p', { class: 'r-sub comp-note', text: 'Revenue is a rough estimate before Apple\u2019s cut, worked out from each app\u2019s ratings, time on the App Store and the prices on its App Store page. Apple doesn\u2019t publish real figures. New apps start smaller and grow with reviews and word of mouth.' }) : null]));

    // Love / hate
    function themes(list) { return el('ul', { class: 'themes' }, list.map(function (t) { return el('li', {}, [el('strong', { text: t.theme }), el('span', { text: t.detail })]); })); }
    root.appendChild(section('r-tint', [el('div', { class: 'two' }, [
      el('div', {}, [el('h3', { class: 'r-h3', text: 'What people love' }), el('p', { class: 'r-sub', text: "From 5-star reviews. Don't skip these." }), themes(a.love || [])]),
      el('div', {}, [el('h3', { class: 'r-h3', text: 'What people hate' }), el('p', { class: 'r-sub', text: 'From 1- and 2-star reviews. This is your opening.' }), themes(a.hate || [])])
    ])]));

    // Their words + opening
    var words = el('div', { class: 'words' }, (a.their_words || []).map(function (w) { return el('span', { class: 'word', text: '“' + w + '”' }); }));
    root.appendChild(section('', [h2('In their ', 'own words'), el('p', { class: 'r-sub', text: 'Use these phrases in your onboarding and your App Store listing.' }), words]));
    root.appendChild(section('r-dark', [el('p', { class: 'kicker light', text: 'The opening' }), el('p', { class: 'display r-opening', text: a.opening })]));

    // Opportunities + first version
    root.appendChild(section('', [
      h2('Your ', 'opportunities'),
      el('ol', { class: 'opps' }, (a.opportunities || []).map(function (o) { return el('li', {}, [el('h3', { text: o.title }), el('p', { text: o.why })]); })),
      el('div', { class: 'first' }, [
        el('h3', { class: 'r-h3', text: 'A first version you could build in 30 days' }),
        el('ul', { class: 'checks' }, (a.first_version || []).map(function (f) { return el('li', { text: f }); }))
      ]),
      el('div', { class: 'notes' }, [
        el('p', {}, [el('strong', { text: 'Pricing signals: ' }), a.price_signals || '']),
        el('p', {}, [el('strong', { text: 'Watch out for: ' }), a.watch_out || ''])
      ])
    ]));

    // Next step: the challenge
    root.appendChild(section('r-cta', [
      el('div', { class: 'center' }, [
        el('p', { class: 'kicker', text: "You're on the App in 30 Days waitlist" }),
        el('h2', { class: 'display r-h2' }, ['Ready to ', el('em', { text: 'build it?' })]),
        el('p', { class: 'body', text: "This report is Day 1 of the challenge. Download it, keep it somewhere safe, and on Day 1 Claude reads it so you start with your research already done. You'll hear from me first when doors open." }),
        el('div', { class: 'cta-row' }, [
          el('a', { class: 'pill-btn', href: '/api/idea-report?id=' + encodeURIComponent(rep.id) + '&format=md&download=1', text: 'Download for the challenge' }),
          el('a', { class: 'ghost-btn', href: '/app', text: 'About the challenge' })
        ])
      ])
    ]));

    // Next freebie: the App Design System, with this idea brought in
    root.appendChild(section('r-tint', [
      el('div', { class: 'center' }, [
        el('p', { class: 'kicker', text: 'Free next step' }),
        el('h2', { class: 'display r-h2' }, ['See what it could ', el('em', { text: 'look like.' })]),
        el('p', { class: 'body', text: 'Get name ideas, colours, fonts, an app icon and mockups of your launch screen, onboarding and paywall. Your idea is already filled in.' }),
        el('a', { class: 'pill-btn', href: '/design?idea=' + encodeURIComponent(rep.id), text: 'Design my app' })
      ])
    ]));

    root.appendChild(el('div', { class: 'wrap narrow' }, [el('p', { class: 'fineprint', text: 'Based on ' + rep.reviews_sampled + ' recent and most-helpful App Store reviews of the apps above. The grades are an informed estimate, not a promise. Not affiliated with Apple.' })]));
  }
})();
