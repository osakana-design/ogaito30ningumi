// Googleアナリティクス（サイト共通）
(function () {
  var ID = 'G-9F5SB6Y8SP';

  // 本番ドメイン以外（file://、localhost、127.0.0.1、LAN内の実機確認など）では計測しない
  if (location.hostname !== 'osakana-design.github.io') return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', ID);

  // data-ga の付いたリンクのクリックを送る（Stripe行きは donate_click、それ以外は cta_click）
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-ga]');
    if (!a) return;
    var name = a.dataset.ga.indexOf('stripe_') === 0 ? 'donate_click' : 'cta_click';
    gtag('event', name, { cta: a.dataset.ga });
  });
})();