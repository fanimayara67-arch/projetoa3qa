/* ══════════════════════════════════════════════════════════════
   ILUMINA CORURIPE — CONFIG COMPARTILHADA
   Fonte única de verdade para os dois apps (cidadão e técnico).
   Carregado antes do script principal de cada index.html.

   Para trocar um deploy do Apps Script, edite SÓ este arquivo.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Deploys do Google Apps Script (backend / planilha)
  var ENDPOINT_CIDADAO = 'https://script.google.com/macros/s/AKfycbzl20HaEowLXnRHLKYEnfaqCLXquqGBWrgwy0mYPd5w02ceHcxmk7AmBvNoZOaqab9o/exec';
  var ENDPOINT_TECNICO = 'https://script.google.com/macros/s/AKfycbzw6SbTCLPf2GXN6c0dB9odjmBFnTROVdtX_eqtbYIIj6GWX9lvLgeiLBqQSZhZ6Xee/exec';

  // Caminhos dos apps dentro deste mesmo deploy.
  // Ambos rodam na mesma origem, então o QR do poste e o link
  // entre os painéis são resolvidos em runtime — sem domínio fixo.
  var origin   = global.location.origin;
  var APP_CIDADAO = origin + '/';
  var APP_TECNICO = origin + '/tecnico/';

  global.ILUMINA = {
    ENDPOINT_CIDADAO: ENDPOINT_CIDADAO,
    ENDPOINT_TECNICO: ENDPOINT_TECNICO,
    APP_CIDADAO: APP_CIDADAO,
    APP_TECNICO: APP_TECNICO,
    HUB_URL: 'https://hubcentralcrp.netlify.app',

    // URL do QR colado no poste: abre o app do cidadão já com o poste preenchido
    qrPoste: function (posteId) {
      return APP_CIDADAO + '?poste=' + encodeURIComponent(String(posteId || '').toUpperCase());
    }
  };
})(window);
