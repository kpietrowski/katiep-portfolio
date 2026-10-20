// Remembers who you are on katiep.me (first name + email, in this browser
// only), so after joining the waitlist or using one free tool you don't type
// your email again on the next one.
//
//   kpMe.save(firstName, email)   after any successful signup
//   kpMe.get()                    → { first_name, email } or null
//
// Forms with data-remember get filled in and collapse to
// "Sending it to you@email.com · Not you?". Waitlist forms
// (data-remember="waitlist") show "You're on the list" instead.
(function () {
  var KEY = 'kp_me';
  function get() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.email ? v : null; } catch (e) { return null; }
  }
  function save(first, email) {
    if (!email) return;
    try { localStorage.setItem(KEY, JSON.stringify({ first_name: first || '', email: email })); } catch (e) {}
  }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }
  window.kpMe = { get: get, save: save, forget: forget };

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function setup(form) {
    var me = get();
    if (!me || !form.email) return;
    form.email.value = me.email;
    if (form.first_name && me.first_name) form.first_name.value = me.first_name;
    var waitlist = form.getAttribute('data-remember') === 'waitlist';
    var note = document.createElement('p');
    note.className = 'known-as';
    note.innerHTML = waitlist
      ? "You're on the list" + (me.first_name ? ', ' + esc(me.first_name) : '') + ". I'll email <b>" + esc(me.email) + '</b> the moment doors open. <a href="#" class="not-you">Not you?</a>' +
        '<span class="known-next">While you wait: <a href="/idea">grade your app idea</a> or <a href="/design">design your app</a>, free.</span>'
      : 'Sending it to <b>' + esc(me.email) + '</b>. <a href="#" class="not-you">Not you?</a>';
    var row = form.querySelector('.row');
    form.insertBefore(note, row || form.firstChild);
    form.classList.add(waitlist ? 'known-waitlist' : 'known');
    note.querySelector('.not-you').addEventListener('click', function (e) {
      e.preventDefault();
      forget();
      form.classList.remove('known', 'known-waitlist');
      note.remove();
      form.email.value = '';
      if (form.first_name) form.first_name.value = '';
      (form.first_name || form.email).focus();
    });
  }

  function init() { document.querySelectorAll('form[data-remember]').forEach(setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
