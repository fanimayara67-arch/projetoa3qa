/**
 * CAMADA DE INFRAESTRUTURA (CIDADÃO) — GeolocationService.js
 * Encapsula a captura de coordenadas via satélite (`navigator.geolocation`)
 * e classifica a precisão em metros.
 */

export function classificarPrecisao(accMetros) {
  // Precisão ausente, inválida ou negativa é tratada como imprecisa (UC01, A3):
  // o cidadão vê o aviso e pode recapturar, em vez de ver "Excelente" por engano.
  if (typeof accMetros !== 'number' || !Number.isFinite(accMetros) || accMetros < 0) return 'poor';
  if (accMetros <= 10) return 'excellent';
  if (accMetros <= 25) return 'good';
  return 'poor';
}

export class GeolocationService {
  constructor(geolocationApi = typeof navigator !== 'undefined' ? navigator.geolocation : null) {
    this.geo = geolocationApi;
    this.watchId = null;
  }

  suportado() {
    return Boolean(this.geo && typeof this.geo.watchPosition === 'function');
  }

  iniciarCaptura({ onPosition, onError, timeoutMs = 30000 }) {
    if (!this.suportado()) {
      if (onError) onError({ code: 0, message: 'Seu navegador não suporta GPS.' });
      return;
    }
    this.pararCaptura();
    this.watchId = this.geo.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        onPosition({
          lat: latitude,
          lng: longitude,
          acc: accuracy,
          qualidade: classificarPrecisao(accuracy)
        });
      },
      (err) => {
        this.pararCaptura();
        if (onError) onError(err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    );
  }

  pararCaptura() {
    if (this.watchId !== null && this.geo) {
      this.geo.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
