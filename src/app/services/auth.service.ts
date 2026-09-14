import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const SESSION_KEY = 'wt_session';
const LAST_USER_KEY = 'wt_last_user';

/** Recordatorio liviano de quién usó esta app por última vez — a propósito
 * NO se borra en clearSession(): sirve para personalizar el login ("¡Hola,
 * Elder!") aunque el usuario ya haya cerrado sesión, sin guardar el token. */
export interface LastUser {
  name: string;
  job?: string;
  /** Usuario/cédula del login, solo si la persona activó "Recordar mi usuario".
   * NUNCA se guarda la contraseña: quien tome el teléfono podría entrar sin
   * saberla, y en Preferences quedaría en texto plano. */
  usuario?: string;
}

/**
 * Sesión completa que devuelve /login — la vamos ampliando en caliente
 * (is_inside, hora_entrada, etc.) según lo que la app va sincronizando.
 */
export interface UserSession {
  token: string;
  employee_id: number;
  id_odoo: number;
  name: string;
  job?: string;
  role?: string;
  company?: string;
  pais?: string;
  cedula?: string;
  identificacion?: string;
  department?: string;
  is_inside?: boolean;
  day_completed?: boolean;
  hora_entrada?: string | null;
  hora_salida?: string | null;
  isSuperAdmin?: boolean;
  permisos?: Record<string, boolean>;
  [key: string]: any;
}

/**
 * Única fuente de verdad para la sesión del usuario en toda la app.
 *
 * Por qué existe: antes el token vivía en `localStorage` y el resto de la
 * sesión (permisos, nombre, etc.) en `sessionStorage` — dos storages con
 * vida distinta. `sessionStorage` no sobrevive un cierre real de la app
 * nativa (WebView), así que el usuario quedaba con un token técnicamente
 * válido pero sin sus datos, y la app lo mandaba a loguearse de nuevo sin
 * necesidad. Además, cerrar sesión solo limpiaba `sessionStorage`, dejando
 * el `auth_token` vivo en `localStorage` — un token con hasta 10h de vida
 * quedaba utilizable después de "cerrar sesión".
 *
 * Ahora TODO (token + datos) vive junto en Capacitor Preferences (persiste
 * entre reinicios de la app nativa), y se cachea en memoria para que el
 * interceptor HTTP pueda leer el token de forma síncrona sin await en cada
 * request. `init()` hidrata esa caché al arrancar la app (ver
 * APP_INITIALIZER en app.module.ts) antes de que corra cualquier guard o
 * request.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private cached: UserSession | null = null;
  private ready = false;

  /** Se llama UNA vez al bootstrap de la app (APP_INITIALIZER). */
  async init(): Promise<void> {
    if (this.ready) return;
    try {
      const { value } = await Preferences.get({ key: SESSION_KEY });
      this.cached = value ? JSON.parse(value) : null;
    } catch {
      this.cached = null;
    }
    this.ready = true;
  }

  /** Lectura síncrona — segura de llamar en cualquier momento tras init(). */
  get session(): UserSession | null {
    return this.cached;
  }

  get token(): string | null {
    return this.cached?.token ?? null;
  }

  isLoggedIn(): boolean {
    return !!this.cached?.token;
  }

  hasPermiso(slug: string): boolean {
    return !!(this.cached?.isSuperAdmin || this.cached?.permisos?.[slug]);
  }

  isSuperAdmin(): boolean {
    return !!this.cached?.isSuperAdmin;
  }

  /** Guarda la sesión completa (llamado tras un login exitoso). */
  async saveSession(data: UserSession): Promise<void> {
    this.cached = data;
    await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(data) });
    await this.rememberLastUser({ name: data.name, job: data.job });
  }

  /**
   * Guarda nombre + cargo para saludar en el login la próxima vez.
   * FUSIONA con lo ya guardado en vez de reemplazarlo: saveSession() llama acá
   * con solo {name, job} en cada login, y sobrescribir borraría el `usuario`
   * recordado en el primer inicio de sesión.
   */
  async rememberLastUser(user: Partial<LastUser>): Promise<void> {
    const actual = (await this.getLastUser()) ?? ({} as LastUser);
    await Preferences.set({
      key: LAST_USER_KEY,
      value: JSON.stringify({ ...actual, ...user }),
    });
  }

  /** Recuerda el usuario del login, o lo olvida si llega null. */
  async setUsuarioRecordado(usuario: string | null): Promise<void> {
    const next = { ...((await this.getLastUser()) ?? ({} as LastUser)) };
    if (usuario) next.usuario = usuario;
    else delete next.usuario;
    await Preferences.set({ key: LAST_USER_KEY, value: JSON.stringify(next) });
  }

  /** Lee el último usuario recordado (o null si nunca inició sesión aquí). */
  async getLastUser(): Promise<LastUser | null> {
    try {
      const { value } = await Preferences.get({ key: LAST_USER_KEY });
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  /** Actualiza SOLO algunos campos (ej: tras marcar entrada/salida) sin perder el resto. */
  async patchSession(partial: Partial<UserSession>): Promise<void> {
    if (!this.cached) return;
    this.cached = { ...this.cached, ...partial };
    await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(this.cached) });
  }

  /** Única forma de cerrar sesión — limpia memoria + storage persistente, siempre. */
  async clearSession(): Promise<void> {
    this.cached = null;
    await Preferences.remove({ key: SESSION_KEY });
    // Limpieza de las claves legacy por si quedó algo de versiones anteriores.
    try { localStorage.removeItem('auth_token'); } catch {}
    try { sessionStorage.removeItem('wt_session'); } catch {}
  }
}
