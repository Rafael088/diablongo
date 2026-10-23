"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { proveedoresDisponibles, getProviderById } from "@/lib/providers";
import { DebateConfig, DebaterConfig, DebateRole, ProviderConfig } from "@/types";
import { getConfig, saveConfig, SavedConfig } from "@/lib/storage";
import { Settings2, Eye, EyeOff, Lock } from "lucide-react";
import Logo from "@/components/Logo";
import PixelSprite from "@/components/PixelSprite";
import { iniciarConexion, procesarVuelta, PROVEEDOR_OAUTH } from "@/lib/oauthOpenRouter";
import { AVISO_RECORDAR, estaRecordada, guardarKey, leerKey, olvidarKey } from "@/lib/keys";
import { MAX_TEMA } from "@/lib/topes";
import {
  EstadoContador,
  ModoConfig,
  OPENROUTER_DISPONIBLE,
  modoDelServidor,
  modoEfectivo,
  modoInicial,
  pedirCupo,
  proveedorDelModo,
  puedeIniciar,
  textoContador,
} from "@/lib/modoConfig";
import TurnstileWidget from "./TurnstileWidget";
import PanelAjustes from "./PanelAjustes";
import Cuenta, { type VistaCuenta } from "./Cuenta";
import FotoDilema from "./FotoDilema";
import { creditosDe, useCuenta } from "@/hooks/useCuenta";
import MisRetos from "./MisRetos";
import { configSupabase } from "@/lib/supabase/config";
import { CREDITOS_POR_DEBATE } from "@/lib/creditosDebate";
import { textoCreditos } from "@/lib/cuenta";
import { PERSONALIDAD_CLASICA, PERSONALIDADES, personalidadOClasica } from "@/lib/personalidades";

// «Con créditos» solo existe si hay cuentas (Supabase configurado).
const HAY_CUENTAS = configSupabase() !== null;

interface ConfigPanelProps {
  /** `turnstile` es el token de Cloudflare (de un solo uso); falta solo en desarrollo sin sitekey. */
  onStart: (config: DebateConfig, turnstile?: string) => void;
}

const SITEKEY_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
// Sin sitekey solo se puede empezar en desarrollo (el servidor también omite la verificación ahí).
const OMITIR_TURNSTILE = !SITEKEY_TURNSTILE && process.env.NODE_ENV === "development";

// Solo se llama al montar en el navegador (el formulario se monta tras hidratar).
function vieneDeOpenRouter(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code");
}

const subscribeVacio = () => () => {};

// Las preferencias guardadas viven en localStorage: solo existen en el navegador.
// En el servidor se pinta con valores por defecto y, al hidratar, se vuelve a montar
// el formulario con lo guardado (sin setState dentro de efectos).
export default function ConfigPanel({ onStart }: ConfigPanelProps) {
  const enNavegador = useSyncExternalStore(
    subscribeVacio,
    () => true,
    () => false
  );
  return (
    <ConfigForm
      key={enNavegador ? "navegador" : "servidor"}
      saved={enNavegador ? getConfig() : null}
      onStart={onStart}
    />
  );
}

// Si el modelo elegido no pertenece al proveedor, se usa el primero del proveedor.
function modeloValido(providerId: string, model: string): string {
  const p = getProviderById(providerId);
  return p && !p.models.includes(model) ? p.models[0] : model;
}

// Un proveedor guardado que ya no está disponible (p. ej. ollama en producción), o el modo gratis,
// cae al primero: el selector de proveedor solo existe en el modo «Mi key».
function proveedorValido(id: string | undefined, disponibles: ProviderConfig[]): string {
  return disponibles.find((p) => p.id === id)?.id ?? disponibles[0].id;
}

function ConfigForm({ saved, onStart }: ConfigPanelProps & { saved: SavedConfig | null }) {
  const disponibles = proveedoresDisponibles();
  const porDefecto = disponibles[0];
  const hayKeys = disponibles.some((p) => leerKey(p.id) !== "");
  const [modoElegido, setModo] = useState<ModoConfig>(() => (vieneDeOpenRouter() ? "openrouter" : modoInicial(saved, hayKeys, HAY_CUENTAS)));
  // Cuenta: sin sesión, «Con créditos» no se puede elegir y un modo guardado así juega en Gratis.
  const cuenta = useCuenta();
  const creditos = creditosDe(cuenta.estado);
  const modo = modoEfectivo(modoElegido, creditos);
  const [vistaCuenta, setVistaCuenta] = useState<VistaCuenta>("nada");
  // Foto del dilema: solo con créditos y con sesión; nunca se guarda.
  const [foto, setFoto] = useState<string | null>(null);
  const conFoto = modo === "creditos" && typeof creditos === "number";
  const [topic, setTopic] = useState((saved?.topic ?? "").slice(0, MAX_TEMA));

  const [proProvider, setProProvider] = useState(proveedorValido(saved?.proProvider, disponibles));
  const [proModelRaw, setProModel] = useState(saved?.proModel ?? porDefecto.models[0]);

  const [conProvider, setConProvider] = useState(proveedorValido(saved?.conProvider, disponibles));
  const [conModelRaw, setConModel] = useState(saved?.conModel ?? porDefecto.models[1]);

  // Personalidades: solo se eligen (y solo se envían) en «Con créditos»; en el resto, la clásica.
  const [proPersonalidad, setProPersonalidad] = useState(() => personalidadOClasica("pro", saved?.proPersonalidad).id);
  const [conPersonalidad, setConPersonalidad] = useState(() => personalidadOClasica("con", saved?.conPersonalidad).id);

  // Una key por proveedor (si Ángel y Diablo usan el mismo, comparten key).
  const [keys, setKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(disponibles.map((p) => [p.id, leerKey(p.id)]))
  );
  const [recordar, setRecordar] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(disponibles.map((p) => [p.id, estaRecordada(p.id)]))
  );
  // En «Conectar OpenRouter» no se elige proveedor: siempre OpenRouter, con la key del OAuth.
  const enOpenRouter = modo === "openrouter";
  const proProv0 = enOpenRouter ? PROVEEDOR_OAUTH : proProvider;
  const conProv0 = enOpenRouter ? PROVEEDOR_OAUTH : conProvider;
  const proApiKey = keys[proProv0] ?? "";
  const conApiKey = keys[conProv0] ?? "";
  const conectado = (keys[PROVEEDOR_OAUTH] ?? "") !== "";
  const cambiarKey = (id: string, valor: string) => setKeys((k) => ({ ...k, [id]: valor }));
  const cambiarRecordar = (id: string, valor: boolean) => {
    setRecordar((r) => ({ ...r, [id]: valor }));
    // Si ya hay una key escrita, el cambio de almacén se aplica al momento.
    if (keys[id]) guardarKey(id, keys[id], { recordar: valor });
  };
  const desconectar = (id: string) => {
    olvidarKey(id);
    setKeys((k) => ({ ...k, [id]: "" }));
    setRecordar((r) => ({ ...r, [id]: false }));
  };

  // Vuelta de OpenRouter: ?code=... se canjea una sola vez y la key queda como cualquier otra (sesión).
  const [conexion, setConexion] = useState<{ estado: "libre" | "trabajando" | "error"; mensaje?: string }>(() => ({
    estado: vieneDeOpenRouter() ? "trabajando" : "libre",
  }));
  useEffect(() => {
    const canje = procesarVuelta(
      window.location,
      window.sessionStorage,
      (nueva) => window.history.replaceState(null, "", nueva)
    );
    if (!canje) return;
    let vivo = true;
    canje.then((r) => {
      if (!vivo) return;
      if (r.ok) {
        guardarKey(PROVEEDOR_OAUTH, r.key, { recordar: false });
        setKeys((k) => ({ ...k, [PROVEEDOR_OAUTH]: r.key }));
        setRecordar((x) => ({ ...x, [PROVEEDOR_OAUTH]: false }));
        setConexion({ estado: "libre" });
      } else {
        setConexion({ estado: "error", mensaje: r.error });
      }
    });
    return () => {
      vivo = false;
    };
  }, []);
  const conectar = async () => {
    setConexion({ estado: "trabajando" });
    try {
      window.location.assign(await iniciarConexion(window.location, window.sessionStorage));
    } catch {
      setConexion({ estado: "error", mensaje: "No pudimos empezar la conexión con OpenRouter en este navegador." });
    }
  };

  const [tokenTurnstile, setTokenTurnstile] = useState<string | null>(null);
  const verificado = OMITIR_TURNSTILE || tokenTurnstile !== null;

  // Contador de debates gratis de hoy: solo se pide en el modo Gratis y nunca rompe la pantalla.
  const [contadorPedido, setContadorPedido] = useState<EstadoContador | null>(null);
  useEffect(() => {
    if (modo !== "gratis") return;
    const ac = new AbortController();
    pedirCupo(fetch, ac.signal).then((e) => {
      if (!ac.signal.aborted) setContadorPedido(e);
    });
    return () => ac.abort();
  }, [modo]);
  const contador: EstadoContador = contadorPedido ?? { tipo: "cargando" };
  const puedeEmpezar = puedeIniciar({ modo, tema: topic, verificado, contador, conectadoOpenRouter: conectado, creditos });

  const proModel = modeloValido(proProv0, proModelRaw);
  const conModel = modeloValido(conProv0, conModelRaw);

  const handleStart = () => {
    if (!puedeEmpezar) return;
    const proProv = proveedorDelModo(modo, proProvider);
    const conProv = proveedorDelModo(modo, conProvider);
    const idsKey = enOpenRouter ? [PROVEEDOR_OAUTH] : [proProvider, conProvider];
    const gratis = modoDelServidor(modo);

    saveConfig({
      topic,
      modo,
      proProvider,
      proModel,
      conProvider,
      conModel,
      proPersonalidad,
      conPersonalidad,
    });
    for (const id of gratis ? [] : new Set(idsKey)) {
      if (getProviderById(id)?.requiresApiKey) {
        guardarKey(id, keys[id] ?? "", { recordar: recordar[id] ?? false });
      }
    }

    const pro: DebaterConfig = {
      role: "pro",
      provider: proProv,
      model: gratis ? "" : proModel,
      apiKey: gratis ? "" : proApiKey,
      name: "PRO",
      personalidad: modo === "creditos" ? proPersonalidad : PERSONALIDAD_CLASICA.pro,
    };

    const con: DebaterConfig = {
      role: "con",
      provider: conProv,
      model: gratis ? "" : conModel,
      apiKey: gratis ? "" : conApiKey,
      name: "CON",
      personalidad: modo === "creditos" ? conPersonalidad : PERSONALIDAD_CLASICA.con,
    };

    onStart({ topic: topic.trim(), pro, con, ...(conFoto && foto ? { foto } : {}) }, tokenTurnstile ?? undefined);
  };

  // Ajustes: se abre solo al volver de OpenRouter o de un login fallido, para ver el resultado.
  const [ajustes, setAjustes] = useState(
    () => vieneDeOpenRouter() || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cuenta") === "error")
  );
  const cerrarAjustes = useCallback(() => {
    setAjustes(false);
    setVistaCuenta("nada");
  }, [setVistaCuenta]);
  const abrirAjustes = (vista: VistaCuenta = "nada") => {
    setVistaCuenta(vista);
    setAjustes(true);
  };
  // «Con créditos» sin sesión: en vez de elegirlo, abre el login y lo enfoca.
  const pedirEntrada = () => {
    setVistaCuenta("entrar");
    requestAnimationFrame(() => {
      const google = document.getElementById("cuenta-google");
      google?.scrollIntoView({ block: "center", behavior: "smooth" });
      google?.focus({ preventScroll: true });
    });
  };

  return (
    <>
      <div className="inicio" inert={ajustes}>
        <header className="inicio-barra">
          <button type="button" className="inicio-ajustes" onClick={() => abrirAjustes()} aria-haspopup="dialog">
            <Settings2 className="w-5 h-5" aria-hidden />
            Ajustes
          </button>
        </header>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="inicio-columna"
        >
          <div className="marca-cabecera">
            <span className="marca-sprite" aria-hidden>
              <PixelSprite personaje="pro" escala={2} />
            </span>
            <Logo lema />
            <span className="marca-sprite" aria-hidden>
              <PixelSprite personaje="con" escala={2} />
            </span>
          </div>

          <div className="inicio-dilema">
            <label htmlFor="dilema" className="inicio-etiqueta">
              ¿Qué dilema tienes?
            </label>
            <textarea
              id="dilema"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="¿Le cambio los rines de 15 a 17 a mi carro?"
              maxLength={MAX_TEMA}
              rows={3}
              className="inicio-campo"
            />
            <p className="inicio-cuenta" aria-live="off">
              {topic.length}/{MAX_TEMA}
            </p>
            {conFoto && <FotoDilema foto={foto} onChange={setFoto} />}
          </div>

          <EstadoModo
            modo={modo}
            contador={contador}
            conectado={conectado}
            proveedor={getProviderById(proProvider)?.name ?? proProvider}
            creditos={creditos}
            onCambiar={(vista) => abrirAjustes(vista)}
          />

          {SITEKEY_TURNSTILE ? (
            <TurnstileWidget sitekey={SITEKEY_TURNSTILE} onToken={setTokenTurnstile} />
          ) : (
            !OMITIR_TURNSTILE && (
              <p role="alert" className="inicio-alerta">
                El servidor no está bien configurado: falta la comprobación de seguridad.
              </p>
            )
          )}

          <button onClick={handleStart} disabled={!puedeEmpezar} className="config-iniciar">
            Iniciar Debate
          </button>

          <p className="inicio-legal">
            Es un juego: lo que digan el Ángel y el Diablo lo inventa una IA y no es un consejo. Tú decides y
            respondes por lo que hagas. Al jugar aceptas los <Link href="/terminos">términos y condiciones</Link>.
          </p>
        </motion.div>
      </div>

      <PanelAjustes
        abierto={ajustes}
        onCerrar={cerrarAjustes}
        lateral={
          <>
            <SelectorModo modo={modo} creditos={creditos} onChange={setModo} onPedirEntrada={pedirEntrada} />
            <Cuenta
              estado={cuenta.estado}
              errorLogin={cuenta.errorLogin}
              recargar={cuenta.recargar}
              vista={vistaCuenta}
              onVista={setVistaCuenta}
            />
          </>
        }
      >
        <div className="ajustes-detalle-cabecera">
          <h3 className="ajustes-detalle-titulo">{TITULO_MODO[modo]}</h3>
          <p className="ajustes-detalle-texto">
            {modo === "openrouter"
              ? "Juegas con tu cuenta de OpenRouter y eliges el modelo de cada uno. La key que te da OpenRouter se guarda solo en esta pestaña y se borra al cerrarla; nunca pasa por nuestro servidor."
              : modo === "creditos"
              ? `Ángel y Diablo juegan con modelos de pago, eliges su personalidad y puedes mandarles una foto. Cada debate cuesta ${textoCreditos(CREDITOS_POR_DEBATE)}; si los modelos fallan antes de terminar, te lo devolvemos.`
              : modo === "key"
              ? "Usa tu propia API key para cada personaje. Se guarda solo en esta pestaña y se borra al cerrarla, salvo que marques «Recordar en este dispositivo». Nunca pasa por nuestro servidor."
              : "No necesitas key ni cuenta: el servidor pone los modelos y hay un límite de debates por día. No guardamos nada tuyo."}
          </p>
          {modo === "gratis" && <p className="config-aviso">{textoContador(contador)}</p>}
        </div>

        {modo === "creditos" && (
          <div className="ajustes-duelo">
            <SelectorPersonalidad rol="pro" valor={proPersonalidad} onChange={setProPersonalidad} />
            <SelectorPersonalidad rol="con" valor={conPersonalidad} onChange={setConPersonalidad} />
          </div>
        )}

        {modo === "openrouter" && (
          <ConexionOpenRouter
            conectado={conectado}
            estado={conexion.estado}
            mensaje={conexion.mensaje}
            onConectar={conectar}
            onDesconectar={() => desconectar(PROVEEDOR_OAUTH)}
          />
        )}

        {(modo === "key" || (modo === "openrouter" && conectado)) && (
          <div className="ajustes-duelo">
            <DebaterForm
              title="Ángel"
              color="pro"
              provider={proProv0}
              soloModelo={enOpenRouter}
              model={proModel}
              apiKey={proApiKey}
              recordar={recordar[proProv0] ?? false}
              onProviderChange={setProProvider}
              onModelChange={setProModel}
              onApiKeyChange={(v) => cambiarKey(proProv0, v)}
              onRecordarChange={(v) => cambiarRecordar(proProv0, v)}
              onDesconectar={() => desconectar(proProv0)}
            />
            <DebaterForm
              title="Diablo"
              color="con"
              provider={conProv0}
              soloModelo={enOpenRouter}
              model={conModel}
              apiKey={conApiKey}
              recordar={recordar[conProv0] ?? false}
              onProviderChange={setConProvider}
              onModelChange={setConModel}
              onApiKeyChange={(v) => cambiarKey(conProv0, v)}
              onRecordarChange={(v) => cambiarRecordar(conProv0, v)}
              onDesconectar={() => desconectar(conProv0)}
            />
          </div>
        )}

        {modo === "creditos" && <MisRetos />}
      </PanelAjustes>
    </>
  );
}

/** Personalidad de un personaje (solo en «Con créditos»). El servidor vuelve a validarla. */
function SelectorPersonalidad(props: { rol: DebateRole; valor: string; onChange: (id: string) => void }) {
  const { rol, valor, onChange } = props;
  const idCampo = `personalidad-${rol}`;
  const elegida = personalidadOClasica(rol, valor);
  return (
    <div className={`config-seccion config-seccion-${rol}`}>
      <label htmlFor={idCampo} className="config-seccion-titulo">
        {rol === "pro" ? "Personalidad del Ángel" : "Personalidad del Diablo"}
      </label>
      <div className="config-personalidad">
        {/* Vista previa: el sprite del personaje con la personalidad elegida (decorativo; el nombre ya está en el selector). */}
        <span aria-hidden="true" className="config-personalidad-vista">
          <PixelSprite personaje={rol} fotograma="reposo" escala={2} personalidad={elegida.id} />
        </span>
        <select id={idCampo} value={elegida.id} onChange={(e) => onChange(e.target.value)} className="config-campo">
          {PERSONALIDADES[rol].map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>
      <p className="config-nota">{elegida.descripcion}</p>
    </div>
  );
}

/** Una línea bajo el dilema que dice cómo vas a jugar; «Cambiar» abre Ajustes. */
function EstadoModo(props: {
  modo: ModoConfig;
  contador: EstadoContador;
  conectado: boolean;
  proveedor: string;
  creditos: number | null | undefined;
  onCambiar: (vista?: VistaCuenta) => void;
}) {
  const { modo, contador, conectado, proveedor, creditos, onCambiar } = props;
  const sinSaldo = modo === "creditos" && typeof creditos === "number" && creditos < CREDITOS_POR_DEBATE;
  const alerta = (modo === "gratis" && contador.tipo === "agotado") || (modo === "openrouter" && !conectado) || sinSaldo;
  const texto =
    modo === "gratis"
      ? textoContador(contador)
      : modo === "openrouter"
      ? conectado
        ? "Juegas con tu cuenta de OpenRouter."
        : "Falta conectar tu cuenta de OpenRouter."
      : modo === "key"
      ? `Juegas con tu propia key (${proveedor}).`
      : creditos === undefined
      ? "Mirando tu cuenta…"
      : sinSaldo
      ? "No te quedan créditos para este debate."
      : `Juegas con créditos: te quedan ${textoCreditos(creditos ?? 0)}.`;
  return (
    <p className={`inicio-estado${alerta ? " inicio-estado-alerta" : ""}`} role="status" aria-live="polite">
      <span>{texto}</span>
      <button type="button" className="inicio-cambiar" onClick={() => onCambiar(sinSaldo ? "comprar" : "nada")}>
        {alerta && modo === "openrouter" ? "Conectar" : sinSaldo ? "Comprar" : "Cambiar"}
      </button>
    </p>
  );
}

interface DebaterFormProps {
  title: string;
  color: "pro" | "con";
  provider: string;
  /** En «Conectar OpenRouter» el proveedor y la key ya están resueltos: solo se elige el modelo. */
  soloModelo?: boolean;
  model: string;
  apiKey: string;
  recordar: boolean;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (apiKey: string) => void;
  onRecordarChange: (recordar: boolean) => void;
  onDesconectar: () => void;
}

function DebaterForm({
  title,
  color,
  provider,
  soloModelo,
  model,
  apiKey,
  recordar,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  onRecordarChange,
  onDesconectar,
}: DebaterFormProps) {
  const providerConfig = getProviderById(provider);
  const [verKey, setVerKey] = useState(false);

  return (
    <div className={`config-seccion config-seccion-${color}`}>
      <div className="config-seccion-cabeza">
        <span aria-hidden="true" className="config-seccion-sprite">
          <PixelSprite personaje={color} fotograma="reposo" escala={1} />
        </span>
        <h4 className="config-seccion-titulo">{title}</h4>
      </div>

      {!soloModelo && (
      <div>
        <label className="config-etiqueta">Proveedor</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          className="config-campo"
        >
          {proveedoresDisponibles().map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      )}

      <div>
        <label className="config-etiqueta">Modelo</label>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="config-campo"
        >
          {providerConfig?.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {!soloModelo && providerConfig?.requiresApiKey && (
        <div>
          <label className="config-etiqueta">API Key</label>
          <div className="flex gap-2">
            <input
              type={verKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={`Tu key de ${providerConfig.name}`}
              autoComplete="off"
              spellCheck={false}
              className="config-campo"
            />
            <button
              type="button"
              onClick={() => setVerKey((v) => !v)}
              aria-label={verKey ? "Ocultar la key" : "Mostrar la key"}
              aria-pressed={verKey}
              className="config-campo"
              style={{ width: "auto", flexShrink: 0 }}
            >
              {verKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => onRecordarChange(e.target.checked)}
            />
            Recordar en este dispositivo
          </label>
          <p className="text-sm opacity-70 mt-1">{AVISO_RECORDAR}</p>
          <button
            type="button"
            onClick={onDesconectar}
            className="text-sm underline opacity-70 mt-2"
          >
            Desconectar
          </button>
        </div>
      )}
    </div>
  );
}

const OPCIONES_MODO: { id: ModoConfig; titulo: string; detalle: string }[] = [
  { id: "gratis", titulo: "Gratis", detalle: "Sin key, con un límite por día" },
  { id: "openrouter", titulo: "Conectar OpenRouter", detalle: OPENROUTER_DISPONIBLE ? "Con tu cuenta, sin copiar keys" : "Próximamente" },
  { id: "key", titulo: "Mi key", detalle: "Usa tu propia API key" },
  { id: "creditos", titulo: "Con créditos", detalle: `Personalidades y fotos, ${textoCreditos(CREDITOS_POR_DEBATE)} por debate` },
];

const TITULO_MODO = Object.fromEntries(OPCIONES_MODO.map((o) => [o.id, o.titulo])) as Record<ModoConfig, string>;

function SelectorModo(props: {
  modo: ModoConfig;
  creditos: number | null | undefined;
  onChange: (m: ModoConfig) => void;
  onPedirEntrada: () => void;
}) {
  const { modo, creditos, onChange, onPedirEntrada } = props;
  return (
    <div>
      <h3 id="modo-etiqueta" className="ajustes-seccion">¿Cómo quieres jugar?</h3>
      <div role="radiogroup" aria-labelledby="modo-etiqueta" className="config-modos">
        {OPCIONES_MODO.filter((o) => o.id !== "creditos" || HAY_CUENTAS).map((o) => {
          // «Con créditos» necesita sesión: sin ella la opción se ve con candado y al tocarla abre el login.
          const bloqueada = o.id === "creditos" && typeof creditos !== "number";
          const detalle =
            o.id !== "creditos"
              ? o.detalle
              : creditos === undefined
              ? "Mirando tu cuenta…"
              : creditos === null
              ? "Entra a tu cuenta para usarlo"
              : `${o.detalle} · tienes ${textoCreditos(creditos)}`;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={modo === o.id}
              aria-disabled={bloqueada || undefined}
              onClick={() => {
                if (!bloqueada) onChange(o.id);
                else if (creditos === null) onPedirEntrada();
              }}
              className={`config-modo${modo === o.id ? " config-modo-activo" : ""}${bloqueada ? " config-modo-bloqueado" : ""}`}
            >
              <span className="config-modo-titulo">
                {o.titulo}
                {bloqueada && <Lock className="config-modo-candado" aria-hidden />}
              </span>
              <span className="config-modo-detalle">{detalle}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConexionOpenRouter(props: {
  conectado: boolean;
  estado: "libre" | "trabajando" | "error";
  mensaje?: string;
  onConectar: () => void;
  onDesconectar: () => void;
}) {
  const { conectado, estado, mensaje, onConectar, onDesconectar } = props;
  if (estado === "trabajando") {
    return (
      <p className="config-aviso" role="status" aria-live="polite">
        Conectando con OpenRouter…
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {estado === "error" && (
        <p className="config-aviso config-aviso-alerta" role="alert">
          {mensaje}
        </p>
      )}
      {conectado ? (
        <p className="config-aviso" role="status">
          Conectado con OpenRouter.{" "}
          <button type="button" onClick={onDesconectar} className="underline">
            Desconectar
          </button>
        </p>
      ) : (
        <button type="button" onClick={onConectar} className="config-iniciar">
          Conectar con OpenRouter
        </button>
      )}
    </div>
  );
}
