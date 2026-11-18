import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  SeismoAxis,
  SeismoChart,
  alertLevelName,
  clipOf,
  demo,
  history,
  type HAlert,
  type Win,
  eventsIn,
  fmtTime,
  nowS,
  pgaOf,
  sevOf,
  scaleLabel,
  viewNow,
  WINDOW_S,
} from "./seismo";
import { DEFAULTS, P, loadPrefs, motionReduced, pgaStr, pgaText, savePrefs, type Prefs } from "./prefs";
import { startI18n } from "./i18n";
import { useLive, startLive, control, pulsar, msParaNivel, type Srv, type Suceso, type LogEntry } from "./live";

type Page = "Panorama" | "Sismógrafos" | "Alertas" | "Clúster Raft" | "Detectores" | "Registros" | "Configuración";
type Scenario = "Normal" | "Nodo 2 caído" | "Sin quórum" | "Elección";
type IconName =
  | "overview"
  | "wave"
  | "alert"
  | "cluster"
  | "detector"
  | "logs"
  | "search"
  | "sun"
  | "moon"
  | "chevron"
  | "crown"
  | "check"
  | "clock"
  | "download"
  | "wifi"
  | "server"
  | "command"
  | "sync"
  | "close"
  | "filter"
  | "pause"
  | "play"
  | "settings";

type ScenarioData = {
  term: number;
  leader: number | null;
  connected: number[];
  candidates: number[];
  quorum: boolean;
  label: string;
  /** Solo en modo en vivo (foto real del clúster). */
  real?: boolean;
  commit?: number;
  logLen?: number;
  servers?: Srv[];
  log?: LogEntry[];
  timeline?: Suceso[];
  sourceNode?: number | null;
};

const scenarios: Record<Scenario, ScenarioData> = {
  Normal: {
    term: 739,
    leader: 1,
    connected: [1, 2, 3],
    candidates: [],
    quorum: true,
    label: "Todos los sistemas operativos",
  },
  "Nodo 2 caído": {
    term: 739,
    leader: 1,
    connected: [1, 3],
    candidates: [],
    quorum: true,
    label: "Operando con redundancia reducida",
  },
  "Sin quórum": {
    term: 740,
    leader: null,
    connected: [2],
    candidates: [],
    quorum: false,
    label: "Consenso no disponible",
  },
  Elección: {
    term: 740,
    leader: null,
    connected: [1, 2, 3],
    candidates: [1, 3],
    quorum: true,
    label: "Elección de líder en curso",
  },
};

const navGroups: { label: string; items: { page: Page; icon: IconName }[] }[] = [
  {
    label: "MONITOREO",
    items: [
      { page: "Panorama", icon: "overview" },
      { page: "Sismógrafos", icon: "wave" },
      { page: "Alertas", icon: "alert" },
    ],
  },
  {
    label: "INFRAESTRUCTURA",
    items: [
      { page: "Clúster Raft", icon: "cluster" },
      { page: "Detectores", icon: "detector" },
      { page: "Registros", icon: "logs" },
    ],
  },
];

const eventData = [
  { node: 1, severity: "Moderado", intensity: 4, pga: "0.127 g", time: "18:23:41" },
  { node: 3, severity: "Fuerte", intensity: 6, pga: "0.188 g", time: "18:23:43" },
  { node: 2, severity: "Leve", intensity: 2, pga: "0.071 g", time: "18:22:10" },
  { node: 1, severity: "Moderado", intensity: 4, pga: "0.099 g", time: "18:20:02" },
];

function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  const p: Record<IconName, ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="3" width="8" height="5" rx="2" />
        <rect x="13" y="10" width="8" height="11" rx="2" />
        <rect x="3" y="13" width="8" height="8" rx="2" />
      </>
    ),
    wave: <path d="M2 13h4l2-8 4 14 3-10 3 6h4" />,
    alert: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 6-3 7-3 8h18c0-1-3-2-3-8" />
        <path d="M10 21h4" />
      </>
    ),
    cluster: (
      <>
        <circle cx="12" cy="5" r="3" />
        <circle cx="5" cy="18" r="3" />
        <circle cx="19" cy="18" r="3" />
        <path d="m10.5 7.6-4 7.8m7-7.8 4 7.8M8 18h8" />
      </>
    ),
    detector: (
      <>
        <path d="M5 9a8 8 0 0 1 14 0M8 12a4.5 4.5 0 0 1 8 0" />
        <circle cx="12" cy="16" r="2" />
        <path d="M12 18v3" />
      </>
    ),
    logs: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    crown: <path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4" />
        <path d="M4 20h16" />
      </>
    ),
    wifi: (
      <>
        <path d="M4 10a12 12 0 0 1 16 0M7 14a7 7 0 0 1 10 0" />
        <circle cx="12" cy="19" r="1" fill="currentColor" />
      </>
    ),
    server: (
      <>
        <rect x="3" y="4" width="18" height="6" rx="2" />
        <rect x="3" y="14" width="18" height="6" rx="2" />
        <path d="M7 7h.01M7 17h.01" />
      </>
    ),
    command: (
      <>
        <path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 8a7 7 0 0 1 12-2l2 6M4 12l2 6a7 7 0 0 0 12-2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    pause: (
      <>
        <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      </>
    ),
    play: <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {p[name]}
    </svg>
  );
}

/** Icono de VYBRA: el mismo pulso que usa la app de cliente. */
function BrandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
  );
}

function Dot({ state }: { state: "good" | "warn" | "bad" | "blue" }) {
  return <i className={`status-dot ${state}`} />;
}

function Pill({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "green" | "amber" | "red" | "blue" | "purple";
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`surface ${className}`}>{children}</section>;
}

function Topology({ data, large = false }: { data: ScenarioData; large?: boolean }) {
  const nodes = [
    { id: 1, x: 50, y: 17 },
    { id: 2, x: 23, y: 73 },
    { id: 3, x: 77, y: 73 },
  ];
  const link = (a: number, b: number) =>
    !data.connected.includes(a) || !data.connected.includes(b)
      ? "failed"
      : data.candidates.includes(a) || data.candidates.includes(b)
        ? "vote"
        : data.leader === a || data.leader === b
          ? "replicate"
          : "heartbeat";
  // Bolitas que viajan por los enlaces activos: replicación (líder → seguidores),
  // latido (ida y vuelta) y voto (elección). Los enlaces caídos no tienen tráfico.
  const reduce = motionReduced();
  const pos = (id: number) => nodes.find((n) => n.id === id)!;
  const packets = reduce
    ? null
    : (
        [
          [1, 2],
          [1, 3],
          [2, 3],
        ] as [number, number][]
      ).flatMap(([a, b], li) => {
        const kind = link(a, b);
        if (kind === "failed") return [];
        const dir: [number, number][] =
          kind === "replicate"
            ? data.leader === a
              ? [[a, b]]
              : [[b, a]]
            : [
                [a, b],
                [b, a],
              ];
        const dur = kind === "heartbeat" ? 3.2 : kind === "vote" ? 1.8 : 1.6;
        return dir.flatMap(([from, to], di) =>
          [0, 1].map((k) => {
            const f = pos(from),
              t = pos(to);
            return (
              <circle key={`${li}-${di}-${k}`} r={kind === "heartbeat" ? 1.1 : 1.5} className={`packet ${kind}`}>
                <animateMotion
                  dur={`${dur}s`}
                  begin={`${-(dur / 2) * k - di * 0.6}s`}
                  repeatCount="indefinite"
                  path={`M${f.x} ${f.y} L${t.x} ${t.y}`}
                />
              </circle>
            );
          }),
        );
      });
  return (
    <div className={`topology ${large ? "large" : ""}`}>
      <svg viewBox="0 0 100 94">
        <line x1="50" y1="17" x2="23" y2="73" className={`topo-link ${link(1, 2)}`} />
        <line x1="50" y1="17" x2="77" y2="73" className={`topo-link ${link(1, 3)}`} />
        <line x1="23" y1="73" x2="77" y2="73" className={`topo-link ${link(2, 3)}`} />
        {packets}
        {nodes.map(({ id, x, y }) => {
          const online = data.connected.includes(id),
            leader = data.leader === id,
            candidate = data.candidates.includes(id);
          return (
            <g key={id} transform={`translate(${x} ${y})`} className="topo-node">
              {leader && <path d="M-5-11l3 3 2-5 2 5 3-3-1 6h-8z" className="topo-crown" />}
              <circle
                r="11"
                className={`node-halo ${online ? (candidate ? "candidate" : leader ? "leader" : "online") : "down"}`}
              />
              <circle r="7.5" className="node-core" />
              <text y="1.5" className="node-name">
                S{id}
              </text>
              <text y="16" className="node-caption">
                {!online ? "Desconectado" : leader ? "Líder" : candidate ? "Candidato" : "Seguidor"}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="topo-legend">
        <span>
          <i className="replicate" />
          Replicación
        </span>
        <span>
          <i className="heartbeat" />
          Latido
        </span>
        <span>
          <i className="vote" />
          Voto
        </span>
        <span>
          <i className="failed" />
          Sin respuesta
        </span>
      </div>
    </div>
  );
}

function Sidebar({
  page,
  setPage,
  collapsed,
  setCollapsed,
  dark,
  setDark,
  data,
  alertCount,
  onSettings,
  settingsActive,
}: {
  onSettings: () => void;
  settingsActive: boolean;
  alertCount: number;
  page: Page;
  setPage: (p: Page) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
  data: ScenarioData;
}) {
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand-block">
        <div className="app-icon">
          <BrandIcon />
        </div>
        <div>
          <strong>VYBRA</strong>
          <span>ADMIN</span>
        </div>
      </div>
      <nav>
        {navGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <label>{group.label}</label>
            {group.items.map((item) => (
              <button
                key={item.page}
                className={page === item.page ? "active" : ""}
                onClick={() => setPage(item.page)}
                title={item.page}
              >
                <Icon name={item.icon} />
                <span>{item.page}</span>
                {item.page === "Alertas" && <b>{alertCount}</b>}
              </button>
            ))}
          </div>
        ))}
        <div className="nav-group">
          <label>PERSONALIZACIÓN</label>
          <button className={settingsActive ? "active" : ""} onClick={onSettings} title="Configuración">
            <Icon name="settings" />
            <span>Configuración</span>
          </button>
        </div>
      </nav>
      <div className="sidebar-bottom">
        <div className="side-health">
          <Dot state={data.quorum ? "good" : "bad"} />
          <span>
            <strong>{data.quorum ? "Clúster conectado" : "Sin quórum"}</strong>
            <small>{data.connected.length} de 3 servidores</small>
          </span>
        </div>
        <button
          className="side-row theme-btn"
          onClick={() => setDark(!dark)}
          title={dark ? "Apariencia clara" : "Apariencia oscura"}
        >
          <Icon name={dark ? "sun" : "moon"} />
          <span>{dark ? "Apariencia clara" : "Apariencia oscura"}</span>
        </button>
        <button className="side-row collapse-control" onClick={() => setCollapsed(!collapsed)}>
          <Icon name="chevron" />
          <span>Contraer barra lateral</span>
          <small>Ctrl B</small>
        </button>
        <div className="version">
          <span>VYBRA 2.0</span>
          <span>{data.real ? "En vivo" : "Entorno de demostración"}</span>
        </div>
      </div>
    </aside>
  );
}

function Toolbar({
  page,
  scenario,
  setScenario,
  data,
  time,
}: {
  page: Page;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  data: ScenarioData;
  time: Date;
}) {
  const descriptions: Record<Page, string> = {
    Panorama: "Salud del sistema y actividad sísmica",
    Sismógrafos: "Espacio de trabajo de señales sincronizadas",
    Alertas: "Eventos de coincidencia e investigaciones",
    "Clúster Raft": "Infraestructura de consenso y replicación",
    Detectores: "Gestión de detectores ESP32",
    Registros: "Historial de eventos replicado",
    Configuración: "Preferencias de la interfaz de ADMIN",
  };
  return (
    <header className="toolbar">
      <div className="title-area">
        <h1>{page}</h1>
        <p>{descriptions[page]}</p>
      </div>
      <div className="toolbar-actions">
        {!data.real && (
          <div className="scenario-control">
            <span>Escenario</span>
            <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
              {Object.keys(scenarios).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="toolbar-health">
          <Dot state={data.quorum ? "good" : "bad"} />
          <span>{data.quorum ? "Quórum" : "Sin quórum"}</span>
        </div>
        <div className="toolbar-leader">
          <Icon name="crown" size={14} />
          <span>{data.leader ? `S${data.leader}` : "Eligiendo"}</span>
        </div>
        <div className="toolbar-term" title="Término Raft">
          <span>Término</span>
          <b>{data.term}</b>
        </div>
        <div className="toolbar-conn" title={data.real && !data.servers?.some((x) => x.reach) ? "Sin conexión con los servidores" : "Conectado"}>
          <span>{data.real && !data.servers?.some((x) => x.reach) ? "Sin conexión," : "Conectado,"}</span>
          <time>{fmtTime(time.getTime() / 1000)}</time>
        </div>
      </div>
    </header>
  );
}

function Metric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={color}>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

type EvRow = { node: number; severity: string; intensity: number; pga: string; time: string; pending?: boolean };
const toRows = (data: ScenarioData, hist: ReturnType<typeof history>): EvRow[] =>
  data.real
    ? [...hist.events]
        .sort((a, b) => b.idx - a.idx)
        .map((e) => ({ node: e.det, severity: sevOf(e.level).name, intensity: e.level, pga: `${e.pga.toFixed(3)} g`, time: fmtTime(e.t), pending: !e.committed }))
    : eventData;

function Overview({ data, hist, setPage }: { data: ScenarioData; hist: ReturnType<typeof history>; setPage: (p: Page) => void }) {
  const rows = toRows(data, hist);
  const lastAlert = hist.alerts[0];
  const real = !!data.real;
  const pendCount = real ? Math.max(0, (data.logLen ?? 0) - (data.commit ?? 0)) : 0;
  const rowOf = (id: number) => (real ? rows.find((r) => r.node === id) : rows[id - 1]);
  return (
    <div className="screen overview-screen">
      <div className="hero-status">
        <div className="hero-copy">
          <span className="overline">ESTADO DEL SISTEMA · {real ? "EN VIVO" : "DEMOSTRACIÓN"}</span>
          <h2>{data.label}</h2>
          <p>
            {data.quorum && !data.leader
              ? "Hay quórum de nodos, pero aún no hay líder elegido: no se confirman entradas hasta que se elija uno."
              : data.quorum
              ? `El consenso Raft está disponible en ${data.connected.length} servidores conectados.`
              : "El clúster no puede confirmar entradas nuevas hasta que se restablezca la conectividad."}
          </p>
          <div className="hero-metrics">
            <Metric
              label="QUÓRUM"
              value={data.quorum ? "Disponible" : "No disponible"}
              sub={`${data.connected.length}/3 conectados`}
              color={data.quorum ? "green-text" : "red-text"}
            />
            <Metric
              label="LÍDER"
              value={data.leader ? `Servidor ${data.leader}` : "Ninguno"}
              sub={`Término ${data.term}`}
            />
            <Metric
              label="ÍNDICE DE CONFIRMACIÓN"
              value={real ? String(data.commit ?? 0) : data.leader ? "24" : "23"}
              sub={real ? (pendCount ? `${pendCount} pendiente${pendCount > 1 ? "s" : ""}` : "Totalmente replicado") : data.leader ? "Totalmente replicado" : "1 pendiente"}
            />
          </div>
        </div>
        <div className="hero-topology">
          <Topology data={data} />
        </div>
      </div>
      <div className="overview-lower">
        <Surface className="activity-panel">
          <div className="section-head">
            <div>
              <h3>Actividad de señal</h3>
              <p>Últimos 60 segundos · {real ? "trazas ilustrativas de los eventos reales" : "canales simulados"}</p>
            </div>
            <button onClick={() => setPage("Sismógrafos")}>
              Abrir espacio <Icon name="chevron" size={13} />
            </button>
          </div>
          <div className="mini-channels">
            {[1, 2, 3].map((id) => (
              <div key={id}>
                <div className="channel-meta">
                  <span>
                    <Dot state={data.connected.includes(id) ? "good" : "bad"} />
                    Detector {id}
                  </span>
                  <code>{data.connected.includes(id) && rowOf(id) ? pgaStr(rowOf(id)!.pga) : "—"}</code>
                </div>
<div className="sx-box compact">
                  <SeismoChart det={id} online={data.connected.includes(id)} win={60} />
                </div>
              </div>
            ))}
          </div>
        </Surface>
        <div className="overview-rail">
          <Surface className="recent-panel">
            <div className="section-head">
              <div>
                <h3>Eventos recientes</h3>
                <p>Flujo de eventos del clúster</p>
              </div>
              <button onClick={() => setPage("Registros")}>Ver todo</button>
            </div>
            {rows.slice(0, 3).map((e, i) => (
              <EventRow key={`${e.time}${i}`} event={e} data={data} />
            ))}
            {rows.length === 0 && (
              <div className="al-empty-list">
                <strong>Sin eventos todavía</strong>
                <span>Aparecen cuando un detector reporta una pulsación.</span>
              </div>
            )}
          </Surface>
          <Surface className="alert-glance">
            <div className="alert-icon">
              <Icon name="alert" />
            </div>
            <div>
              <span>ÚLTIMA ALERTA</span>
              <strong>{real ? (lastAlert ? `Coincidencia · ${alertLevelName(lastAlert.level).toLowerCase()}` : "Sin alertas emitidas") : "Coincidencia moderada"}</strong>
              <p>
                {real
                  ? lastAlert
                    ? `${lastAlert.dets.map(nodeName).join(" y ")} · ${fmtTime(lastAlert.t)}`
                    : "Aparece cuando 2 detectores coinciden en 10 s"
                  : "nodo-1 y nodo-3 · ventana de 10 s"}
              </p>
            </div>
            <button onClick={() => setPage("Alertas")}>
              <Icon name="chevron" />
            </button>
          </Surface>
        </div>
      </div>
      <div className="sync-strip">
        <span>
          <Icon name="sync" size={14} /> Última sincronización
        </span>
        {[1, 2, 3].map((id) => (
          <div key={id}>
            <Dot state={data.connected.includes(id) ? "good" : "bad"} />
            <strong>S{id}</strong>
            <small>
              {data.connected.includes(id)
                ? real
                  ? `Término ${data.servers![id - 1].term} · log ${data.servers![id - 1].logLen}`
                  : id === 3
                    ? "hace 38 ms"
                    : "hace 12 ms"
                : "Error de conexión"}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Seismographs({ data }: { data: ScenarioData }) {
  const [win, setWin] = useState<string>(P.defaultWindow),
    [scale, setScale] = useState<string>(P.defaultYScale),
    [paused, setPaused] = useState(false),
    [show, setShow] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true }),
    [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = win === "30 s" ? 30 : win === "1 min" ? 60 : 300;
  const togglePause = () => {
    demo.pauseAt = nowS();
    demo.paused = !paused;
    setPaused(!paused);
  };
  useEffect(() => () => void (demo.paused = false), []);
  const t1 = viewNow(),
    t0 = t1 - seconds;
  const shown = [1, 2, 3].filter((id) => show[id]);
  const evs = eventsIn(t0, t1).sort((a, b) => b.t - a.t);
  const lastReport = (id: number) => {
    const e = eventsIn(t1 - 300, t1).filter((x) => x.det === id).sort((a, b) => b.t - a.t)[0];
    return e ? `hace ${Math.max(0, Math.round(t1 - e.t))} s` : "sin reportes";
  };
  return (
    <div className="screen seismo-screen">
      <p className="sx-lead">
        Las tres trazas comparten el mismo eje de tiempo. La franja sombreada marca la ventana de coincidencia de una alerta:
        los reportes dentro de ella cuentan como el mismo sismo.
      </p>
      <p className="sx-note">
        <Icon name="server" size={13} />{" "}
        {data.real
          ? "Trazas ilustrativas dibujadas con la hora y el nivel de los eventos reales; los detectores no tienen sensor ni envían una señal continua."
          : "DEMOSTRACIÓN: trazas generadas a partir de eventos simulados; los detectores no tienen sensor."}
      </p>
      <div className="workspace-controls">
        <button className={`sx-pause ${paused ? "on" : ""}`} onClick={togglePause} aria-pressed={paused}>
          <Icon name={paused ? "play" : "pause"} size={16} />
          {paused ? "Reanudar" : "Pausar"}
        </button>
        <Segmented label="Ventana" values={["30 s", "1 min", "5 min"]} value={win} onChange={setWin} />
        <Segmented label="Escala" values={["Común", "Por canal"]} value={scale} onChange={setScale} />
        <div className="sx-checks">
          {[1, 2, 3].map((id) => (
            <label key={id} className={`det-chip c${id} ${show[id] ? "on" : ""}`}>
              <input type="checkbox" checked={show[id]} onChange={(e) => setShow({ ...show, [id]: e.target.checked })} />
              <i className="tick">{show[id] && <Icon name="check" size={11} />}</i>
              Detector {id}
            </label>
          ))}
        </div>
        <div className="stream-state">
          <Dot state="blue" /> {data.real ? "Eventos en vivo" : "Flujo simulado"} <span>{data.connected.length}/3 canales</span>
        </div>
      </div>
      <Surface className="sx-card">
        {shown.map((id) => (
          <div className="sx-channel" key={id}>
            <div className="sx-chead">
              <strong>Detector {id}</strong> · nodo-{id} ·{" "}
              {data.connected.includes(id) ? `último reporte ${lastReport(id)}` : "sin conexión"}
              {null}
            </div>
            <SeismoChart
              det={id}
              online={data.connected.includes(id)}
              win={seconds}
              labels
              yLabels
              yMode={scale === "Común" ? "comun" : "canal"}
              commonDets={shown}
            />
          </div>
        ))}
        {shown.length === 0 && <div className="empty-log"><strong>Sin canales visibles</strong><span>Activa al menos un detector.</span></div>}
        {shown.length > 0 && <SeismoAxis win={seconds} />}
        <div className="sx-legend">
          <span><i className="trace-key" /> Traza del detector</span>
          <span><i className="dash-key" /> Sin reportes</span>
          <span><i className="sev-key leve" /> Leve</span>
          <span><i className="sev-key moderado" /> Moderado</span>
          <span><i className="sev-key fuerte" /> Fuerte</span>
          <span><i className="sev-key severo" /> Severo</span>
          <span><i className="band-key" /> Ventana de coincidencia {WINDOW_S} s</span>
          <small>Hora local, formato 24 h</small>
        </div>
      </Surface>
      <details className="sx-details">
        <summary>Ver los eventos de la ventana como tabla</summary>
        <div className="sx-table">
          <div className="sx-row head">
            <span>Detector</span>
            <span>Intensidad</span>
            <span>PGA</span>
            <span>Estado</span>
            <span>Hora</span>
          </div>
          {evs.map((e, i) => {
            const sv = sevOf(e.level);
            return (
              <div className="sx-row" key={`${e.det}${e.t}${i}`}>
                <span>nodo-{e.det}</span>
                <span>
                  <i className={`severity-mark ${sv.key}`} /> {scaleLabel(e.level)} · {sv.name} <small>nivel {e.level}</small>
                </span>
                <code>{(e.pga && e.pga > 0 ? e.pga : pgaOf(e.level)).toFixed(3)} g</code>
                <span>
                  <Pill tone={e.committed ? "green" : "amber"}>{e.committed ? "Confirmado" : "Pendiente"}</Pill>
                </span>
                <time>{fmtTime(e.t)}</time>
              </div>
            );
          })}
          {evs.length === 0 && <div className="empty-log"><strong>Sin eventos en la ventana</strong></div>}
        </div>
      </details>
    </div>
  );
}

function Segmented({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="segmented-wrap">
      <label>{label}</label>
      <div className="segmented">
        {values.map((v) => (
          <button key={v} className={value === v ? "active" : ""} onClick={() => onChange(v)}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function ServerInspector({
  id,
  data,
  hist,
  onAction,
}: {
  id: number;
  data: ScenarioData;
  hist: ReturnType<typeof history>;
  onAction: (id: number) => void | Promise<unknown>;
}) {
  const online = data.connected.includes(id),
    leader = data.leader === id,
    candidate = data.candidates.includes(id);
  const sv = data.servers?.find((x) => x.id === id);
  const [armed, setArmed] = useState(false),
    [busy, setBusy] = useState(false);
  // Mismo cálculo que Registros: entradas del log y cuántas están confirmadas por mayoría.
  const total = sv ? Math.max(1, sv.logLen) : Math.max(1, hist.events[hist.events.length - 1]?.idx ?? 1),
    commit = sv ? sv.commit : data.leader && data.quorum ? total : 1,
    pend = sv ? sv.pend : total - commit;
  return (
    <Surface className={`server-inspector ${!online ? "disabled" : ""}`}>
      <div className="server-title">
        <div className="server-glyph">
          <Icon name="server" />
        </div>
        <div>
          <h3>Servidor {id}</h3>
          <span>nodo-{id} · ESP32{sv?.ip ? ` · ${sv.ip}` : ""}</span>
        </div>
        <Pill tone={!online ? "red" : candidate ? "purple" : leader ? "blue" : "gray"}>
          {!online ? "Desconectado" : candidate ? "Candidato" : leader ? "Líder" : "Seguidor"}
        </Pill>
      </div>
      <div className="replication">
        <div>
          <span>Replicación del log</span>
          <code>{online ? `${commit} / ${total}` : "—"}</code>
        </div>
        <i>
          <b style={{ width: online ? `${Math.round((commit / total) * 100)}%` : "0%" }} />
        </i>
      </div>
      <dl>
        <div>
          <dt>Término</dt>
          <dd>{online ? (sv ? sv.term : data.term) : "—"}</dd>
        </div>
        <div>
          <dt>Log / confirmadas</dt>
          <dd>{online ? `${total} / ${commit}` : "—"}</dd>
        </div>
        <div>
          <dt>Pendientes</dt>
          <dd>{online ? pend : "—"}</dd>
        </div>
        <div>
          <dt>Señal WiFi</dt>
          <dd>{online ? (sv ? (sv.rssi ? `${sv.rssi} dBm` : "—") : `${-41 - id * 7} dBm`) : "Sin señal"}</dd>
        </div>
      </dl>
      {data.real ? (
        !sv?.reach ? (
          <button disabled title="El PC no recibe respuesta de este nodo">
            <Icon name="wifi" size={14} />
            Sin conexión
          </button>
        ) : sv.caido ? (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onAction(id);
              setBusy(false);
            }}
          >
            <Icon name="sync" size={14} />
            {busy ? "Enviando…" : "Recuperar"}
          </button>
        ) : armed ? (
          <button
            className="danger-confirm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onAction(id);
              setBusy(false);
              setArmed(false);
            }}
            onBlur={() => setArmed(false)}
            autoFocus
          >
            <Icon name="sync" size={14} />
            {busy ? "Enviando…" : `Confirmar: simular caída de S${id}`}
          </button>
        ) : (
          <button onClick={() => setArmed(true)}>
            <Icon name="sync" size={14} />
            Simular caída
          </button>
        )
      ) : (
        <button onClick={() => onAction(id)}>
          <Icon name="sync" size={14} />
          {!online
            ? "Restaurar nodo de demostración"
            : id === 1
              ? "Provocar elección"
              : id === 2
                ? "Simular caída"
                : "Simular partición"}
        </button>
      )}
    </Surface>
  );
}

function TimelineItem({
  tone,
  icon,
  title,
  detail,
}: {
  tone: string;
  icon: IconName;
  title: string;
  detail: string;
}) {
  return (
    <div className="timeline-item">
      <i className={tone}>
        <Icon name={icon} size={14} />
      </i>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

const TL_KIND: Record<string, { tone: string; icon: IconName }> = {
  postulo: { tone: "purple", icon: "sync" },
  voto: { tone: "purple", icon: "check" },
  gano: { tone: "blue", icon: "crown" },
  perdio_lider: { tone: "gray", icon: "clock" },
  cayo: { tone: "red", icon: "wifi" },
  recupero: { tone: "green", icon: "wifi" },
  log_lleno: { tone: "red", icon: "logs" },
  resincroniza: { tone: "green", icon: "sync" },
  movido: { tone: "amber", icon: "alert" },
};

function Cluster({
  data,
  hist,
  onAction,
}: {
  data: ScenarioData;
  hist: ReturnType<typeof history>;
  onAction: (id: number) => void | Promise<unknown>;
}) {
  useTick();
  return (
    <div className="screen cluster-screen">
      <div className="cluster-stage">
        <Surface className="topology-stage">
          <div className="stage-title">
            <div>
              <span>RED RAFT · TÉRMINO {data.term}</span>
              <h2>
                {data.leader
                  ? `El servidor ${data.leader} lidera`
                  : data.quorum
                    ? "Elección en curso"
                    : "Consensus unavailable"}
              </h2>
            </div>
            <Pill tone={data.quorum ? "green" : "red"}>
              <Dot state={data.quorum ? "good" : "bad"} />
              {data.quorum ? "Quórum" : "Sin quórum"}
            </Pill>
          </div>
          <Topology data={data} large />
        </Surface>
        <Surface className="consensus-panel">
          <div className="section-head">
            <div>
              <h3>Línea temporal del consenso</h3>
              <p>{data.real ? "Sucesos reales de los tres servidores" : "Transiciones de estado de demostración"}</p>
            </div>
            <Icon name="clock" />
          </div>
          <div className="timeline">
            {data.real ? (
              <>
                {(data.timeline ?? []).slice(0, 8).map((e) => {
                  const k = TL_KIND[e.tipo] ?? { tone: "gray", icon: "clock" as IconName };
                  return (
                    <TimelineItem
                      key={`${e.n}-${e.seq}`}
                      tone={k.tone}
                      icon={k.icon}
                      title={e.texto}
                      detail={`${e.t ? fmtTime(e.t / 1000) : "sin hora"} · S${e.n} · término ${e.termino}`}
                    />
                  );
                })}
                {(data.timeline ?? []).length === 0 && (
                  <div className="al-empty-list">
                    <strong>Sin sucesos registrados todavía</strong>
                  </div>
                )}
              </>
            ) : (
              <>
            <TimelineItem
              tone={data.leader ? "blue" : "purple"}
              icon={data.leader ? "crown" : "sync"}
              title={data.leader ? `S${data.leader} ejerce el liderazgo` : "Sin líder elegido"}
              detail={`Término ${data.term} · estado actual`}
            />
            <TimelineItem
              tone="purple"
              icon="sync"
              title={data.candidates.length ? "S1 y S3 solicitaron votos" : "Elección completada"}
              detail={
                data.quorum ? `${data.connected.length} nodos disponibles` : "Respuestas insuficientes"
              }
            />
            <TimelineItem
              tone={data.connected.length === 3 ? "green" : "red"}
              icon="wifi"
              title={
                data.connected.length === 3
                  ? "Todos los enlaces responden"
                  : `${3 - data.connected.length} ${data.connected.length === 2 ? "fallo" : "fallos"} de conexión`
              }
              detail="UDP 4210 · red simulada"
            />
            <TimelineItem
              tone="gray"
              icon="logs"
              title="Índice de confirmación avanzó"
              detail={`Entrada ${Math.max(1, hist.events[hist.events.length - 1]?.idx ?? 1)} · evento de detector`}
            />
              </>
            )}
          </div>
        </Surface>
      </div>
      <div className="server-grid">
        {[1, 2, 3].map((id) => (
          <ServerInspector key={id} id={id} data={data} hist={hist} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

const levels = [
  { name: "Leve", level: 2, pga: "0.071 g" },
  { name: "Moderado", level: 4, pga: "0.127 g" },
  { name: "Fuerte", level: 6, pga: "0.188 g" },
  { name: "Severo", level: 9, pga: "0.302 g" },
];

function DetectorPanel({
  id,
  data,
  hist,
  onPress,
}: {
  id: number;
  data: ScenarioData;
  hist: ReturnType<typeof history>;
  onPress: (id: number, level: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null),
    [sending, setSending] = useState(false),
    [msg, setMsg] = useState<{ cls: "ok" | "info" | "warn" | "err"; text: string } | null>(null),
    online = data.connected.includes(id);
  const current = selected === null ? null : levels[selected];
  const last = data.real ? [...hist.events].filter((e) => e.det === id).sort((a, b) => b.idx - a.idx)[0] : undefined;
  // Pulsación real: POST /api/nodos/N/pulsar. El texto sale de la respuesta del nodo, no de una suposición.
  const sendReal = async (i: number) => {
    setSelected(i);
    setSending(true);
    setMsg(null);
    const r = await pulsar(id, msParaNivel(levels[i].level));
    const c = r.body ?? {};
    const hayConsenso = !!(data.leader && data.quorum);
    if (r.status === 200) {
      if (c.resultado === "pendiente" && hayConsenso)
        setMsg({ cls: "info", text: `Recibido por S${id}. Reenviado al líder S${data.leader}; se confirma cuando la mayoría lo tenga.` });
      else if (c.resultado === "pendiente")
        setMsg({ cls: "warn", text: `Recibido por S${id}, pendiente: no hay líder o mayoría para confirmarlo.` });
      else if (c.resultado === "duplicada") setMsg({ cls: "ok", text: `S${id} ya tenía este evento (duplicado).` });
      else if (!hayConsenso) setMsg({ cls: "warn", text: `Aceptado por el líder (S${id}), pero sin mayoría queda pendiente.` });
      else setMsg({ cls: "ok", text: `S${id} aceptó el evento (nivel ${c.nivel ?? levels[i].level}).` });
    } else if (r.status === 507) setMsg({ cls: "err", text: "Rechazado: el log está lleno." });
    else if (r.status === 409) setMsg({ cls: "err", text: `Rechazado: S${id} está caído (simulado).` });
    else if (r.status === 502 || r.status === 0)
      setMsg({ cls: "err", text: r.status === 0 ? "Sin conexión con el servidor del PC. El reporte se perdió." : `S${id} no respondió. El reporte se perdió.` });
    else setMsg({ cls: "err", text: `Error ${r.status}: ${c.error ?? "respuesta inesperada"}.` });
    setSending(false);
  };
  return (
    <Surface className={`detector-panel ${!online ? "unavailable" : ""}`}>
      <div className="detector-header">
        <div className="detector-orb">
          <span />
          <Icon name="detector" />
        </div>
        <div>
          <h3>Detector {id}</h3>
          <p>
            S{id} · nodo-{id}
          </p>
        </div>
        <div className="connection">
          <Dot state={online ? "good" : "bad"} />
          {online ? "Conectado" : "Desconectado"}
        </div>
      </div>
      <div className="current-reading">
        <span>{data.real ? "ÚLTIMA LECTURA REPORTADA" : "LECTURA DE DEMOSTRACIÓN ACTUAL"}</span>
        <div>
          <strong>{data.real ? (last ? pgaText(last.pga) : "—") : pgaStr(current ? current.pga : eventData[id - 1].pga)}</strong>
          <small>PGA</small>
        </div>
        <code>
          {data.real
            ? last
              ? `Nivel ${last.level} · ${fmtTime(last.t)}`
              : "Sin reportes todavía"
            : current
              ? `Nivel ${current.level}`
              : `Último reporte · ${eventData[id - 1].time}`}
        </code>
      </div>
      <div className="simulation">
        <div>
          <strong>Simular intensidad de pulsación</strong>
          <span>{data.real ? "Envía la pulsación al nodo ESP32 por el servidor del PC" : "No se envía ningún comando al hardware"}</span>
        </div>
        <div className="level-buttons">
          {levels.map((l, i) => (
            <button
              key={l.name}
              disabled={!online || sending}
              className={selected === i ? "active" : ""}
              onClick={() => {
                if (data.real) return void sendReal(i);
                setSelected(i);
                onPress(id, i);
              }}
            >
              <b>{l.level}</b>
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      </div>
      {data.real && (sending || msg) && (
        <div className={`simulation-result ${msg?.cls === "ok" ? "confirmed" : "pending"}`} role="status">
          <Icon name={msg?.cls === "ok" ? "check" : "clock"} />
          <div>
            <strong>{sending ? "Enviando…" : msg?.cls === "err" ? "No se pudo enviar" : msg?.cls === "ok" ? "Evento aceptado" : "Esperando consenso"}</strong>
            <span>{sending ? "Enviando la pulsación al nodo…" : msg?.text}</span>
          </div>
        </div>
      )}
      {!data.real && current && (
        <div
          className={`simulation-result ${data.leader && data.quorum ? "confirmed" : "pending"}`}
        >
          <Icon name={data.leader && data.quorum ? "check" : "clock"} />
          <div>
            <strong>
              {data.leader && data.quorum ? "Evento simulado confirmado" : "Esperando consenso"}
            </strong>
            <span>
              {data.leader
                ? `Reenviado al líder S${data.leader} · 2 de 3 aceptaron`
                : "En espera local · sin líder elegido"}
            </span>
          </div>
        </div>
      )}
      {!online && (
        <div className="connection-error">
          <Icon name="wifi" />
          <strong>Conexión no disponible</strong>
          <span>{data.real ? "Los controles volverán cuando el PC vuelva a recibir respuesta de este nodo." : "Los controles volverán cuando este nodo de demostración se reconecte."}</span>
        </div>
      )}
      <div className="detector-spark">
        <span>Actividad reciente</span>
        <div className="sx-box compact">
          <SeismoChart det={id} online={online} win={60} />
        </div>
      </div>
    </Surface>
  );
}

function Detectors({
  data,
  hist,
  onPress,
}: {
  data: ScenarioData;
  hist: ReturnType<typeof history>;
  onPress: (id: number, level: number) => void;
}) {
  return (
    <div className="screen detectors-screen">
      <div className="detector-intro">
        <div>
          <span>{data.real ? "SIMULACIÓN DE PULSACIÓN" : "CONTROLES DE DEMOSTRACIÓN"}</span>
          <h2>Espacio de detectores</h2>
          <p>
            {data.real
              ? "La duración de la pulsación se convierte en intensidad (1 a 10) y PGA en g. Cada simulación llega al ESP32 como si se hubiera pulsado su botón; la confirmación depende de que haya líder y mayoría."
              : "La duración de la pulsación se convierte en intensidad (1 a 10) y PGA en g. Las simulaciones siguen las reglas de reenvío y confirmación de Raft sin contactar hardware físico."}
          </p>
        </div>
        <div>
          <Metric label="CONECTADOS" value={`${data.connected.length} / 3`} sub="nodos ESP32" />
          <Metric
            label="CONFIRMACIÓN"
            value={data.leader ? "Disponible" : "Pendiente"}
            sub={data.leader ? "2 de 3 requeridos" : "Sin líder"}
          />
        </div>
      </div>
      <div className="detectors-grid">
        {[1, 2, 3].map((id) => (
          <DetectorPanel key={id} id={id} data={data} hist={hist} onPress={onPress} />
        ))}
      </div>
    </div>
  );
}

const levelKey = (l: Win["level"]) => (l === "baja" ? "moderado" : l === "media" ? "fuerte" : "severo");
const nodeName = (n: number) => `nodo-${n}`;

function useTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function LevelPill({ level }: { level: Win["level"] }) {
  return (
    <span className={`sevpill ${levelKey(level)}`}>
      <i />
      {alertLevelName(level)}
    </span>
  );
}

function Alerts({
  data,
  alerts,
  sel,
  setSel,
  onTest,
}: {
  data: ScenarioData;
  alerts: HAlert[];
  sel: number | null;
  setSel: (id: number) => void;
  onTest: () => void;
}) {
  useTick();
  const [query, setQuery] = useState(""),
    [lvl, setLvl] = useState("Todas"),
    [menu, setMenu] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = alerts.filter(
    (x) =>
      (lvl === "Todas" || alertLevelName(x.level) === `Alerta ${lvl.toLowerCase()}`) &&
      (!q || `coincidencia de detectores ${x.dets.map(nodeName).join(" ")} ${alertLevelName(x.level)} intensidad ${x.avg} ${fmtTime(x.t)}`.toLowerCase().includes(q)),
  );
  const a = shown.find((x) => x.id === sel) || shown[0];
  const clip = a ? clipOf(a) : null;
  const names = a ? a.dets.map(nodeName) : [];
  const tone = (l: Win["level"]) => (l === "baja" ? "green" : l === "media" ? "amber" : "red");
  return (
    <div className="screen alerts-screen">
      <Surface className="alert-inbox">
        <div className="inbox-head">
          <div>
            <h3>Bandeja de alertas</h3>
            <span>
              {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
              {data.real ? "" : " de demostración"}
            </span>
          </div>
          <div className="inbox-filter">
            <button aria-label="Filtrar por nivel" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <Icon name="filter" />
            </button>
            {menu && (
              <div className="inbox-menu" role="menu">
                {["Todas", "Baja", "Media", "Alta"].map((o) => (
                  <button
                    key={o}
                    role="menuitemradio"
                    aria-checked={lvl === o}
                    className={lvl === o ? "on" : ""}
                    onClick={() => {
                      setLvl(o);
                      setMenu(false);
                    }}
                  >
                    {o === "Todas" ? "Todas las alertas" : `Alerta ${o.toLowerCase()}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="inbox-search">
          <Icon name="search" size={14} />
          <input placeholder="Buscar alertas" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar alertas" />
        </div>
        <div className="alert-rows">
          {shown.map((x) => (
            <button key={x.id} className={`alert-row ${a && x.id === a.id ? "active" : ""}`} onClick={() => setSel(x.id)}>
              <i className={tone(x.level)} />
              <div>
                <strong>Coincidencia de detectores</strong>
                <span>{x.dets.map(nodeName).join(" + ")}</span>
                <small>
                  {alertLevelName(x.level)} · Intensidad {x.avg}
                </small>
              </div>
              <time>{fmtTime(x.t)}</time>
              <Icon name="chevron" size={13} />
            </button>
          ))}
          {shown.length === 0 && (
            <div className="al-empty-list">
              <strong>{alerts.length ? "Sin resultados" : "Sin alertas emitidas"}</strong>
              <span>
                {alerts.length
                  ? "Prueba otro término o cambia el filtro."
                  : "Aparecen cuando 2 detectores reportan dentro de 10 s."}
              </span>
            </div>
          )}
        </div>
      </Surface>
      {!a || !clip ? (
        <Surface className="incident-detail al-empty">
          <strong>Nada seleccionado</strong>
          <span>
            Una alerta se emite cuando 2 detectores distintos reportan dentro de 10 s y la mayoría de servidores confirma los
            eventos.
            {!(data.leader && data.quorum) ? " Sin líder y quórum no hay consenso para confirmarlas." : ""}
          </span>
          {!data.real && (<button
            className="test-alarm"
            onClick={onTest}
            disabled={!data.real && !(data.leader && data.quorum)}
            title={data.real || (data.leader && data.quorum) ? "Reproduce la pantalla de alerta con sonido (ensayo local, no es una alerta de la red)" : "Requiere líder y quórum"}
          >
            <Icon name="alert" />
            Probar alerta con sonido
          </button>)}
        </Surface>
      ) : (
        <Surface className="incident-detail">
          <div className="incident-header">
            <div>
              <span className="incident-kicker">INCIDENTE · {fmtTime(a.t)}</span>
              <h2>Coincidencia de detectores</h2>
              <p>
                {names.join(" y ")} reportaron dentro de la ventana de coincidencia de {WINDOW_S} segundos.
              </p>
            </div>
            <div>
              <Pill tone={a.test ? "gray" : "green"}>{a.test ? "Ensayo" : "Confirmada"}</Pill>
              {!data.real && (<button
                className="test-alarm"
                onClick={onTest}
                disabled={!data.real && !(data.leader && data.quorum)}
                title={data.real || (data.leader && data.quorum) ? "Reproduce la pantalla de alerta con sonido (ensayo local, no es una alerta de la red)" : "Requiere líder y quórum"}
              >
                <Icon name="alert" />
                Probar alerta con sonido
              </button>)}
            </div>
          </div>
          <div className="incident-metrics">
            <Metric label="INTENSIDAD PROM." value={`${a.avg} / 10`} sub={alertLevelName(a.level)} />
            <Metric label="DETECTORES" value="2" sub={names.join(" + ")} />
            <Metric label="TÉRMINO RAFT" value={`${a.term ?? data.term}`} sub={(a.leader ?? data.leader) ? `Emitida por S${a.leader ?? data.leader}` : "Líder pendiente"} />
            <Metric label="ENTRADA DEL LOG" value={`${a.logIdx ?? a.id}`} sub="Confirmada" />
          </div>
          <div className="investigation">
            <div className="investigation-head">
              <div>
                <h3>Comparación de formas de onda</h3>
                <p>Alineadas al tiempo del clúster · {data.real && !a.test ? "trazas ilustrativas de eventos reales" : "muestras de demostración"}</p>
              </div>
              <span>
                <i />
                Ventana de coincidencia
              </span>
            </div>
            <p className="al-window">
              Ventana de {WINDOW_S} s, de {fmtTime(a.ws)} a {fmtTime(a.we)}. Los recortes muestran 4 s antes y 10 s después.
            </p>
            {a.evs.map((e) => (
              <div className="compare-channel" key={e.idx}>
                <div>
                  <strong>Detector {e.det}</strong>
                  <span>
                    {nodeName(e.det)} · {sevOf(e.level).name}
                  </span>
                </div>
                <div className="sx-box">
                  <SeismoChart det={e.det} online clip={clip} labels={false} />
                </div>
              </div>
            ))}
            <div className="compare-channel axis">
              <span />
              <SeismoAxis range={{ t0: clip.t0, t1: clip.t1 }} gutter={0} />
            </div>
          </div>
          <div className="incident-foot">
            <div>
              <Icon name="check" />
              <span>
                <strong>Regla de correlación</strong>Dos detectores distintos dentro de 10 segundos
              </span>
            </div>
            <div>
              <Icon name="cluster" />
              <span>
                <strong>Consenso</strong>
                Aceptada por la mayoría de servidores
              </span>
            </div>
          </div>
        </Surface>
      )}
    </div>
  );
}

function EventRow({ event, data }: { event: EvRow; data: ScenarioData }) {
  const pending = event.pending ?? (!data.leader || !data.quorum || !data.connected.includes(event.node));
  return (
    <div className="event-row">
      <div className={`severity-mark ${sevOf(event.intensity).key}`} />
      <div>
        <strong>nodo-{event.node}</strong>
        <span>
          {event.severity} · Nivel {event.intensity}
        </span>
      </div>
      <code>{pgaStr(event.pga)}</code>
      <Pill tone={pending ? "amber" : "green"}>{pending ? "Pendiente" : "Confirmado"}</Pill>
      <time>{event.time}</time>
    </div>
  );
}

function SevChip({ level }: { level: number }) {
  const s = sevOf(level);
  return (
    <span className={`sevpill ${s.key}`}>
      <i />
      {scaleLabel(level)} · {s.name}
    </span>
  );
}

function Logs({ data, hist }: { data: ScenarioData; hist: ReturnType<typeof history> }) {
  useTick();
  const [view, setView] = useState("Log de consenso"),
    [fdet, setFdet] = useState("all"),
    [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // Ctrl+F enfoca el buscador de Registros (atajo del diseño).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const alive = data.connected,
    n = alive.length,
    confirmed = Boolean(data.leader && data.quorum),
    src = data.leader && alive.includes(data.leader) ? data.leader : (alive[0] ?? null),
    missing = 3 - n;
  const events = hist.events;
  const real = !!data.real;
  const commit = real ? (data.commit ?? 0) : confirmed ? (events[events.length - 1]?.idx ?? 1) : 1;
  const totalEntries = real ? (data.logLen ?? 0) : Math.max(1, events[events.length - 1]?.idx ?? 1);
  const srcSrv = real ? data.servers?.find((x) => x.id === src) : undefined;
  const identical = real && srcSrv ? (data.servers ?? []).filter((x) => x.reach && !x.caido && x.logLen === srcSrv.logLen).length : 0;
  const liderDe: Record<number, number> = {};
  (data.log ?? []).forEach((x) => x.clase === "inicio_termino" && x.lider != null && (liderDe[x.T] = x.lider));
  const logText = (x: LogEntry) =>
    x.clase === "inicio_termino"
      ? `Inicio de término, Servidor ${x.lider} asume como líder`
      : x.clase === "evento" && x.ev
        ? `Evento: ${nodeName(x.ev.nodo)} nivel ${x.ev.nivel} ${x.ev.id}`
        : x.clase;
  const pendingCount = events.filter((e) => !e.committed).length;
  const q = query.trim().toLowerCase();
  const evText = (e: (typeof events)[number]) =>
    `${nodeName(e.det)} ${e.id} evt-${String(e.idx).padStart(4, "0")} mercalli ${sevOf(e.level).merc} richter ${scaleLabel(e.level)} ${sevOf(e.level).name} nivel ${e.level} ${e.pga.toFixed(3)} servidor ${e.receivedBy} ${
      e.committed ? "confirmado confirmada" : "pendiente"
    } ${e.alertId != null ? `alerta ${e.alertId}` : ""} ${fmtTime(e.t)}`.toLowerCase();
  const filtered = [...events]
    .filter((e) => (fdet === "all" || e.det === +fdet) && (!q || evText(e).includes(q)))
    .sort((a, b) => b.t - a.t);
  const realRows = real
    ? [...(data.log ?? [])]
        .sort((a, b) => b.i - a.i)
        .filter((x) => (fdet === "all" || (x.clase === "evento" && x.ev && x.ev.nodo === +fdet)) && (!q || `${logText(x)} ${x.T} ${x.i}`.toLowerCase().includes(q)))
    : [];
  const startText = data.leader
    ? `Inicio de término, Servidor ${data.leader} asume como líder`
    : "Inicio de término, sin líder elegido";
  const showStart = fdet === "all" && (!q || `${startText} inicio término ${data.term}`.toLowerCase().includes(q));
  const shown = view === "Eventos" ? filtered.length : real ? realRows.length : filtered.length + (showStart ? 1 : 0);
  const exportCsv = () => {
    const rows = [["indice", "id", "detector", "nivel", "mercalli", "richter_aprox", "pga_g", "recibido_por", "estado", "alerta", "hora"]].concat(
      filtered.map((e) => [
        String(e.idx),
        e.id,
        nodeName(e.det),
        String(e.level),
        sevOf(e.level).merc,
        (1.5 + 0.55 * e.level).toFixed(1),
        e.pga.toFixed(3),
        `Servidor ${e.receivedBy}`,
        e.committed ? "confirmado" : "pendiente",
        e.alertId != null ? String(e.alertId) : "",
        e.t > 0 ? new Date(e.t * 1000).toISOString() : "sin hora",
      ]),
    );
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      a = document.createElement("a");
    a.href = url;
    a.download = "eventos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const ok = real ? confirmed && n === 3 && identical === n && n > 0 : confirmed && n === 3;
  return (
    <div className="screen logs-screen">
      <div className="integrity-bar">
        <div className="integrity-icon">
          <Icon name={ok ? "check" : "sync"} />
        </div>
        <div>
          <strong>{ok ? "Integridad del log verificada" : "La replicación requiere atención"}</strong>
          <span>
            {src == null
              ? "Sin servidores disponibles"
              : `${real ? identical : confirmed ? n : Math.max(0, n - 1)} de ${n} copias idénticas${(real ? identical === n : confirmed) ? "" : ", el resto en sincronización"} · Leído de Servidor ${src}${
                  missing ? `, ${missing} servidor${missing > 1 ? "es" : ""} sin responder` : ""
                }`}
          </span>
        </div>
        <div className="integrity-stats">
          <span>
            TÉRMINO <b>{data.term}</b>
          </span>
          <span>
            ENTRADAS <b>{totalEntries}</b>
          </span>
          <span>
            PENDIENTES <b>{pendingCount}</b>
          </span>
        </div>
      </div>
      <Surface className="log-explorer">
        <div className="log-tools rg-toolbar">
          <div className="log-search">
            <Icon name="search" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar eventos, nodos, alertas o estado"
              aria-label="Buscar en registros"
            />
            <kbd>Ctrl F</kbd>
          </div>
          <Segmented label="" values={["Log de consenso", "Eventos"]} value={view} onChange={setView} />
          <label className="rg-select">
            Detector
            <select value={fdet} onChange={(e) => setFdet(e.target.value)}>
              <option value="all">Todos</option>
              {[1, 2, 3].map((id) => (
                <option key={id} value={id}>
                  {nodeName(id)}
                </option>
              ))}
            </select>
          </label>
          <button className="export-button" onClick={exportCsv}>
            <Icon name="download" />
            Exportar CSV
          </button>
        </div>
        <div className="rg-card">
          {view === "Log de consenso" ? (
            <div className="rg-table log">
              <div className="rg-row head">
                <span className="r">Índice</span>
                <span className="r">Término</span>
                <span>Entrada</span>
                <span>Estado</span>
              </div>
              <div className="rg-group">
                Término {data.term}
                {data.leader ? ` · líder S${data.leader}` : " · sin líder elegido"}
              </div>
              {real &&
                realRows.map((x) => (
                  <div className="rg-row" key={x.i}>
                    <span className="r" data-l="Índice">{x.i}</span>
                    <span className="r" data-l="Término">{x.T}</span>
                    <span className="entry">
                      {x.clase === "evento" && x.ev ? (
                        <>
                          Evento: {nodeName(x.ev.nodo)} nivel {x.ev.nivel} <small>{x.ev.id}</small>
                          {hist.events.find((e) => e.idx === x.i)?.alertId != null && (
                            <Pill tone="blue">
                              <Icon name="alert" size={11} />
                              Alerta {hist.events.find((e) => e.idx === x.i)?.alertId}
                            </Pill>
                          )}
                        </>
                      ) : (
                        logText(x)
                      )}
                    </span>
                    <span>
                      {x.i <= commit ? (
                        <Pill tone="green">
                          <Icon name="check" size={11} />
                          Confirmada por mayoría
                        </Pill>
                      ) : (
                        <Pill tone="amber">
                          <Icon name="clock" size={11} />
                          Pendiente ({n}/3 copias)
                        </Pill>
                      )}
                    </span>
                  </div>
                ))}
              {!real && filtered.map((e) => (
                <div className="rg-row" key={e.idx}>
                  <span className="r" data-l="Índice">{e.idx}</span>
                  <span className="r" data-l="Término">{data.term}</span>
                  <span className="entry">
                    Evento: {nodeName(e.det)} nivel {e.level} <small>{e.id}</small>
                    {e.alertId != null && (
                      <Pill tone="blue">
                        <Icon name="alert" size={11} />
                        Alerta {e.alertId}
                      </Pill>
                    )}
                  </span>
                  <span>
                    {e.idx <= commit ? (
                      <Pill tone="green">
                        <Icon name="check" size={11} />
                        Confirmada por mayoría
                      </Pill>
                    ) : (
                      <Pill tone="amber">
                        <Icon name="clock" size={11} />
                        Pendiente ({n}/3 copias)
                      </Pill>
                    )}
                  </span>
                </div>
              ))}
              {!real && showStart && (
                <div className="rg-row">
                  <span className="r" data-l="Índice">1</span>
                  <span className="r" data-l="Término">{data.term}</span>
                  <span className="entry">{startText}</span>
                  <span>
                    <Pill tone="green">
                      <Icon name="check" size={11} />
                      Confirmada por mayoría
                    </Pill>
                  </span>
                </div>
              )}
            </div>
          ) : (
            filtered.length > 0 && (
              <div className="rg-table ev">
                <div className="rg-row head">
                  <span>Detector</span>
                  <span>Intensidad</span>
                  <span className="r">PGA</span>
                  <span>Recibido por</span>
                  <span>Estado</span>
                  <span className="r">Hora</span>
                </div>
                {filtered.map((e) => (
                  <div className="rg-row" key={e.idx}>
                    <span data-l="Detector">{nodeName(e.det)}</span>
                    <span data-l="Intensidad">
                      <SevChip level={e.level} /> <small>nivel {e.level}</small>
                    </span>
                    <span className="r" data-l="PGA"><code>{pgaText(e.pga)}</code></span>
                    <span data-l="Recibido por">Servidor {e.receivedBy}</span>
                    <span className="states">
                      {e.committed ? (
                        <Pill tone="green">
                          <Icon name="check" size={11} />
                          Confirmado
                        </Pill>
                      ) : (
                        <Pill tone="amber">
                          <Icon name="clock" size={11} />
                          Pendiente
                        </Pill>
                      )}
                      {e.alertId != null && (
                        <Pill tone="blue">
                          <Icon name="alert" size={11} />
                          Alerta {e.alertId}
                        </Pill>
                      )}
                    </span>
                    <time className="r">{fmtTime(e.t)}</time>
                  </div>
                ))}
              </div>
            )
          )}
          {shown === 0 && (
            <div className="empty-log">
              <Icon name="search" />
              <strong>Sin resultados</strong>
              <span>Prueba otro término de búsqueda o cambia los filtros.</span>
            </div>
          )}
        </div>
        <div className="table-footer">
          <span>
            Mostrando {shown} de {view === "Eventos" ? events.length : totalEntries} entradas {real ? "del log replicado" : "de demostración"}
          </span>
        </div>
      </Surface>
    </div>
  );
}

function Choice<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { v: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={value === o.v} className={value === o.v ? "active" : ""} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`tgl ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function SetRow({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div>
        <strong>{title}</strong>
        {desc && <span>{desc}</span>}
      </div>
      <div className="set-ctl">{children}</div>
    </div>
  );
}

function Settings({
  prefs,
  set,
  reset,
}: {
  prefs: Prefs;
  set: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
  reset: () => void;
}) {
  const live = useLive();
  const testSound = () => {
    const a = new Audio("./audio/alerta-simulacro.mp3");
    a.volume = prefs.volume;
    a.play().catch(() => {});
    window.setTimeout(() => a.pause(), 3000);
  };
  return (
    <div className="screen settings-screen">
      <Surface className="set-card">
        <h3>Apariencia</h3>
        <SetRow title="Tema" desc="Claro, oscuro o el mismo del sistema.">
          <Choice
            label="Tema"
            value={prefs.theme}
            onChange={(v) => set("theme", v)}
            options={[
              { v: "light", label: "Claro" },
              { v: "system", label: "Sistema" },
              { v: "dark", label: "Oscuro" },
            ]}
          />
        </SetRow>
        <SetRow title="Tamaño de letra" desc="Escala todos los textos de la interfaz y de las gráficas.">
          <Choice
            label="Tamaño de letra"
            value={prefs.fontScale}
            onChange={(v) => set("fontScale", v)}
            options={[
              { v: 0.9, label: "Pequeño" },
              { v: 1, label: "Normal" },
              { v: 1.15, label: "Grande" },
              { v: 1.3, label: "Muy grande" },
            ]}
          />
        </SetRow>
        <SetRow title="Animaciones" desc="Reduce el movimiento (bolitas del clúster, transiciones y parpadeos).">
          <Choice
            label="Animaciones"
            value={prefs.motion}
            onChange={(v) => set("motion", v)}
            options={[
              { v: "system", label: "Sistema" },
              { v: "full", label: "Completas" },
              { v: "reduce", label: "Reducidas" },
            ]}
          />
        </SetRow>
      </Surface>

      <Surface className="set-card">
        <h3>Idioma y formato</h3>
        <SetRow title="Idioma" desc="Idioma de la interfaz de ADMIN.">
          <Choice
            label="Idioma"
            value={prefs.lang}
            onChange={(v) => set("lang", v)}
            options={[
              { v: "es", label: "Español" },
              { v: "en", label: "English" },
            ]}
          />
        </SetRow>
        <SetRow title="Formato de hora" desc="Se aplica a registros, alertas, gráficas y al reloj.">
          <Choice
            label="Formato de hora"
            value={prefs.hour12 ? "12" : "24"}
            onChange={(v) => set("hour12", v === "12")}
            options={[
              { v: "24", label: "24 horas" },
              { v: "12", label: "12 horas" },
            ]}
          />
        </SetRow>
      </Surface>

      <Surface className="set-card">
        <h3>Sismología</h3>
        <SetRow title="Escala de intensidad" desc="Cómo se muestra la intensidad de cada evento.">
          <Choice
            label="Escala de intensidad"
            value={prefs.scale}
            onChange={(v) => set("scale", v)}
            options={[
              { v: "mercalli", label: "Mercalli" },
              { v: "richter", label: "Richter" },
            ]}
          />
        </SetRow>
        {prefs.scale === "richter" && (
          <p className="set-note">
            La escala Richter mide la magnitud en el foco del sismo; los detectores solo producen una intensidad por pulsación
            (nivel 1 a 10). Los valores Richter son una equivalencia orientativa de demostración, no una medición.
          </p>
        )}
        <SetRow title="Unidad de aceleración (PGA)" desc="Aceleración pico del suelo.">
          <Choice
            label="Unidad de PGA"
            value={prefs.pgaUnit}
            onChange={(v) => set("pgaUnit", v)}
            options={[
              { v: "g", label: "g" },
              { v: "ms2", label: "m/s²" },
            ]}
          />
        </SetRow>
      </Surface>

      <Surface className="set-card">
        <h3>Gráficas</h3>
        <SetRow title="Ventana temporal por defecto" desc="Tiempo visible al abrir Sismógrafos.">
          <Choice
            label="Ventana temporal"
            value={prefs.defaultWindow}
            onChange={(v) => set("defaultWindow", v)}
            options={[
              { v: "30 s", label: "30 s" },
              { v: "1 min", label: "1 min" },
              { v: "5 min", label: "5 min" },
            ]}
          />
        </SetRow>
        <SetRow title="Escala vertical por defecto" desc="Común a los tres canales o ajustada a cada uno.">
          <Choice
            label="Escala vertical"
            value={prefs.defaultYScale}
            onChange={(v) => set("defaultYScale", v)}
            options={[
              { v: "Común", label: "Común" },
              { v: "Por canal", label: "Por canal" },
            ]}
          />
        </SetRow>
      </Surface>

      <Surface className="set-card">
        <h3>Alertas</h3>
        <SetRow title="Sonido de alerta" desc="Reproduce el mismo sonido que la app de cliente.">
          <Toggle on={prefs.sound} onChange={(v) => set("sound", v)} label="Sonido de alerta" />
        </SetRow>
        <SetRow title="Volumen" desc={`${Math.round(prefs.volume * 100)} %`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(prefs.volume * 100)}
            onChange={(e) => set("volume", Number(e.target.value) / 100)}
            aria-label="Volumen"
            className="set-range"
            disabled={!prefs.sound}
          />
          <button className="set-btn" onClick={testSound} disabled={!prefs.sound}>
            Probar sonido
          </button>
        </SetRow>
        <SetRow title="Pantalla de alerta desde" desc="Las alertas de menor nivel solo muestran el banner.">
          <Choice
            label="Nivel mínimo"
            value={prefs.minLevel}
            onChange={(v) => set("minLevel", v)}
            options={[
              { v: "baja", label: "Baja" },
              { v: "media", label: "Media" },
              { v: "alta", label: "Alta" },
            ]}
          />
        </SetRow>
        <SetRow title="Banner de alerta" desc="Aviso en la parte superior de todas las pantallas.">
          <Toggle on={prefs.banner} onChange={(v) => set("banner", v)} label="Banner de alerta" />
        </SetRow>
      </Surface>

      <Surface className="set-card">
        <h3>Acerca de</h3>
        <SetRow title="VYBRA ADMIN" desc={live.mode === "real" ? "Versión 2.0 · en vivo. Los datos salen del clúster Raft de tres ESP32 a través del servidor del PC. Los detectores se activan con un pulsador, no tienen sensor." : "Versión 2.0 · entorno de demostración. Los datos son simulados y no provienen de telemetría ESP32."}>
          <button className="set-btn danger" onClick={reset}>
            Restablecer configuración
          </button>
        </SetRow>
      </Surface>
    </div>
  );
}

const ALARM_SECONDS = 59;
const COINCIDENCE_MS = 10_000;

type Alarm = HAlert;

function AlarmOverlay({
  alarm,
  data,
  left,
  muted,
  setMuted,
  blocked,
  onUnblock,
  onClose,
  onOpenAlerts,
}: {
  alarm: Alarm;
  data: ScenarioData;
  left: number;
  muted: boolean;
  setMuted: (v: boolean) => void;
  blocked: boolean;
  onUnblock: () => void;
  onClose: () => void;
  onOpenAlerts: () => void;
}) {
  const a = alarm;
  const clip = clipOf(a);
  return (
    <div className="alarm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="alarm-title">
      <div className="alarm-in">
        <div className="alarm-left">
          <svg className="alarm-bellsvg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 7H4s2 0 2-7" />
            <path d="M10 19a2 2 0 0 0 4 0" />
            <path d="M5 8a8 8 0 0 1 1.2-3M19 8a8 8 0 0 0-1.2-3" />
          </svg>
          <p className="alarm-kicker">Simulacro · VYBRA ADMIN</p>
          <h2 id="alarm-title">Alerta sísmica</h2>
          <p className="alarm-action">Coincidencia confirmada</p>
          <p className="alarm-lead">Dos detectores distintos reportaron dentro de 10 segundos.</p>
        </div>
        <div className="alarm-right">
          <section className="alarm-box" aria-label="Coincidencia">
            <header>
              <strong>Coincidencia</strong>
              <em>{alarm.test ? "ENSAYO" : data.real ? "EN VIVO" : "DEMOSTRACIÓN"}</em>
            </header>
            <p className="alarm-pair">
              {a.dets.map((i) => `nodo-${i}`).join(" + ")} · {alertLevelName(a.level).toLowerCase()}
            </p>
            <div className="alarm-metrics">
              <Metric label="DETECTORES" value={a.dets.map((i) => `S${i}`).join(" + ")} sub="dos distintos" />
              <Metric label="INTENSIDAD" value={`${a.avg} / 10`} sub={alertLevelName(a.level)} />
              <Metric label="TÉRMINO RAFT" value={`${alarm.term ?? data.term}`} sub={`Líder S${alarm.leader ?? data.leader ?? "—"}`} />
              <Metric label="ENTRADA DEL LOG" value={alarm.test ? "—" : `${alarm.logIdx ?? alarm.id}`} sub={alarm.test ? "No se registra" : data.real ? "Confirmada por la mayoría" : "2 de 3 aceptaron"} />
            </div>
            <div className="alarm-waves">
              {a.evs.map((e) => e.det).map((id) => (
                <div key={id}>
                  <span>
                    <Dot state="bad" /> Detector {id}
                  </span>
                  <div className="sx-box">
                    <SeismoChart det={id} online labels clip={clip} />
                  </div>
                </div>
              ))}
            </div>
            <p className="alarm-fine">
              {alarm.test || !data.real
                ? "Datos de demostración generados en la interfaz: no provienen de telemetría ESP32 real."
                : "Alerta confirmada por la mayoría de servidores a partir de dos pulsaciones reales. Las trazas son ilustrativas: los detectores no tienen sensor."}
            </p>
          </section>
          <div className="alarm-actions">
            <button type="button" className="alarm-secondary" onClick={onOpenAlerts}>
              Ver en Alertas
            </button>
            {blocked && !muted && (
              <button type="button" className="alarm-secondary" onClick={onUnblock}>
                El navegador bloqueó el sonido: pulsa para activarlo
              </button>
            )}
            <button type="button" className="alarm-secondary" onClick={() => setMuted(!muted)}>
              {muted ? "Activar sonido" : "Silenciar sonido"}
            </button>
            <button type="button" className="alarm-dismiss" onClick={onClose} autoFocus>
              Cerrar alerta
            </button>
          </div>
          <p className="alarm-timer">El aviso se cierra en {left} s</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("Panorama"),
    [scenario, setScenario] = useState<Scenario>("Normal");
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  Object.assign(P, prefs);
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const [sysDark, setSysDark] = useState(() => !!window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const h = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  useEffect(() => savePrefs(prefs), [prefs]);
  useEffect(() => {
    document.documentElement.lang = prefs.lang;
    startI18n(prefs.lang);
  }, [prefs.lang]);
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && sysDark);
  const setDark = (v: boolean) => setPref("theme", v ? "dark" : "light");
  const [collapsed, setCollapsed] = useState(false),
    [time, setTime] = useState(new Date()),
    [loading, setLoading] = useState(false);
  const [selAlert, setSelAlert] = useState<number | null>(null),
    [hiddenBanner, setHiddenBanner] = useState<number[]>([]),
    [alarm, setAlarm] = useState<Alarm | null>(null),
    [left, setLeft] = useState(ALARM_SECONDS),
    [muted, setMuted] = useState(false),
    [notice, setNotice] = useState<string | null>(null),
    [liveEv, setLiveEv] = useState<{ det: number; t: number; level: number }[]>([]),
    [blocked, setBlocked] = useState(false);
  const live = useLive();
  useEffect(() => startLive(), []);
  const real = live.mode === "real" && !!live.data;
  const presses = useRef<{ id: number; t: number; level: number }[]>([]),
    audio = useRef<HTMLAudioElement | null>(null);
  const data: ScenarioData = useMemo(() => (real ? live.data! : scenarios[scenario]), [real, live.data, scenario]);
  demo.connected = data.connected;
  demo.confirmed = Boolean(data.leader && data.quorum);
  demo.live = liveEv;
  const hist = real ? live.hist : history(data.leader);
  // Avisos por cambios reales: pérdida/recuperación de quórum, del servidor del PC y de nodos.
  const prevSt = useRef<{ q: boolean | null; conn: string; down: number[] }>({ q: null, conn: "conectado", down: [] });
  useEffect(() => {
    if (!real) return;
    const p = prevSt.current;
    if (live.conn !== p.conn) {
      setNotice(live.conn === "conectado" ? "Conexión con el servidor del PC restablecida." : "El servidor del PC no responde. Se muestran los últimos datos conocidos.");
    } else if (live.conn === "conectado") {
      const down = [1, 2, 3].filter((i) => !data.connected.includes(i));
      if (p.q !== null && p.q !== data.quorum)
        setNotice(data.quorum ? "Quórum restablecido: el clúster vuelve a confirmar eventos." : "Sin quórum: no hay mayoría de servidores. Los eventos quedan pendientes.");
      else {
        const nuevos = down.filter((i) => !p.down.includes(i));
        if (p.q !== null && nuevos.length) setNotice(`Sin respuesta de ${nuevos.map((i) => "S" + i).join(", ")}.`);
        const vuelven = p.down.filter((i) => !down.includes(i));
        if (p.q !== null && !nuevos.length && vuelven.length) setNotice(`${vuelven.map((i) => "S" + i).join(", ")} vuelve a responder.`);
      }
      p.down = down;
      p.q = data.quorum;
    }
    p.conn = live.conn;
  }, [real, live.conn, data]);
  const alerts = hist.alerts;
  const seen = useRef<Set<number | string>>(new Set());
  const baseReady = useRef(false);
  const closeAlarm = () => {
    setAlarm(null);
    presses.current = [];
  };
  // Una alerta nueva generada con pulsaciones simuladas abre la pantalla de alerta (con sonido).
  useEffect(() => {
    let fresh: HAlert | undefined;
    if (real) {
      // En vivo: solo abre la pantalla (y el sonido) una alerta confirmada que acaba de ocurrir.
      // Toda alerta vista se marca (id + hora, porque los ids se repiten si el clúster se reinicia)
      // para que no vuelva a sonar cuando el log se resincroniza o cambia la fuente.
      const key = (a: HAlert) => `${a.id}@${a.t}`;
      // Línea base: la primera foto con el log completo solo se marca como vista (abrir la página nunca suena).
      if (!baseReady.current) {
        if ((data.log?.length ?? 0) < (data.logLen ?? 0)) return;
        alerts.forEach((x) => seen.current.add(key(x)));
        baseReady.current = true;
        return;
      }
      const unseen = alerts.filter((a) => !seen.current.has(key(a)));
      unseen.forEach((a) => seen.current.add(key(a)));
      fresh = unseen.find((a) => a.t > 0 && nowS() - a.t < 60 && nowS() - a.t > -10);
      if (fresh) seen.current.add(fresh.id);
    } else fresh = alerts.find((a) => a.live && !seen.current.has(a.id));
    if (!fresh) return;
    if (!real) seen.current.add(fresh.id);
    const rank = { baja: 0, media: 1, alta: 2 };
    if (rank[fresh.level] < rank[prefs.minLevel]) return;
    if (alarm) return;
    setSelAlert(fresh.id);
    setLeft(ALARM_SECONDS);
    setAlarm(fresh);
  });
  const pressDetector = (id: number, level: number) => {
    if (alarm) return;
    const now = Date.now();
    presses.current = presses.current.filter((p) => now - p.t <= COINCIDENCE_MS);
    presses.current.push({ id, t: now, level });
    setLiveEv((v) => [...v.filter((e) => nowS() - e.t < 600), { det: id, t: nowS(), level: levels[level].level }]);
    const other = presses.current.find((p) => p.id !== id);
    if (!other) {
      setNotice(`Pulsación en nodo-${id} registrada. Falta otro detector distinto dentro de 10 s.`);
      return;
    }
    setNotice(
      data.leader && data.quorum
        ? null
        : "Coincidencia detectada, pero sin líder y quórum no hay consenso: alerta pendiente.",
    );
  };
  const testAlarm = () => {
    if (alarm) return;
    if (real) {
      // Ensayo local de la pantalla y el sonido: no se escribe en el log ni se envía a los nodos.
      const t = nowS();
      const mk = (det: number, level: number, dt: number, idx: number) =>
        ({ det, t: t + dt, level, committed: true, idx, id: `ensayo-${det}`, pga: pgaOf(level), receivedBy: det }) as HAlert["evs"][number];
      setSelAlert(null);
      setLeft(ALARM_SECONDS);
      setAlarm({ id: 0, t, ws: t - 1.5, we: t - 1.5 + WINDOW_S, dets: [1, 3], level: "media", avg: 5, evs: [mk(1, 4, -1.5, 0), mk(3, 6, 0, 0)], live: false, test: true, term: data.term, leader: data.leader ?? undefined });
      return;
    }
    if (!(data.leader && data.quorum)) return;
    const t = nowS();
    setLiveEv((v) => [...v, { det: 1, t: t - 1.5, level: 4 }, { det: 3, t, level: 5 }]);
  };
  // Mismo sonido que la alerta de CLIENTE (alerta-simulacro.mp3).
  useEffect(() => {
    if (!audio.current) audio.current = new Audio("./audio/alerta-simulacro.mp3");
    const el = audio.current;
    el.volume = prefs.volume;
    if (alarm && !muted && prefs.sound) {
      el.currentTime = 0;
      el.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    } else {
      setBlocked(false);
      el.pause();
      el.currentTime = 0;
    }
  }, [alarm, muted, prefs.sound, prefs.volume]);
  // Los navegadores bloquean el audio hasta que el usuario interactúa: el primer gesto "desbloquea" el elemento.
  useEffect(() => {
    const unlock = () => {
      if (!audio.current) audio.current = new Audio("./audio/alerta-simulacro.mp3");
      const el = audio.current;
      el.muted = true;
      el.play()
        .then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
        })
        .catch(() => (el.muted = false));
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  useEffect(() => {
    if (!alarm) return;
    const tick = window.setInterval(() => setLeft((n) => n - 1), 1000);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeAlarm();
    window.addEventListener("keydown", esc);
    return () => {
      clearInterval(tick);
      window.removeEventListener("keydown", esc);
    };
  }, [alarm]);
  useEffect(() => {
    if (alarm && left <= 0) closeAlarm();
  }, [left, alarm]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const changeScenario = (next: Scenario) => {
    setLoading(true);
    window.setTimeout(() => {
      setScenario(next);
      setLoading(false);
    }, 260);
  };
  const serverAction = async (id: number) => {
    if (real) {
      const sv = data.servers?.find((x) => x.id === id);
      const accion = sv?.caido ? "recuperar" : "caer";
      const r = await control(id, accion);
      setNotice(
        r.status === 200
          ? `S${id}: el nodo confirmó la orden de ${accion === "caer" ? "caída simulada" : "recuperación"}.`
          : r.status === 0 || r.status === 502
            ? `S${id}: no hay respuesta del nodo; la orden no se pudo confirmar.`
            : `S${id}: el nodo rechazó la orden (${r.status}${r.body?.error ? `: ${r.body.error}` : ""}).`,
      );
      return;
    }
    changeScenario(
      !data.connected.includes(id)
        ? "Normal"
        : id === 1
          ? "Elección"
          : id === 2
            ? "Nodo 2 caído"
            : "Sin quórum",
    );
  };
  return (
    <div
      className={`desktop ${dark ? "dark" : ""} ${motionReduced() ? "reduce-motion" : ""}`}
      style={{ "--fs": prefs.fontScale } as CSSProperties}
    >
      <div className="app-window">
        <Sidebar
          page={page}
          setPage={setPage}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          dark={dark}
          setDark={setDark}
          data={data}
          alertCount={alerts.length}
          onSettings={() => setPage("Configuración")}
          settingsActive={page === "Configuración"}
        />
        <div className="app-main">
          <div className="mobile-brand">
            <div className="app-icon">
              <BrandIcon />
            </div>
            <strong>VYBRA</strong>
            <span>ADMIN</span>
            <button className="mobile-gear" aria-label="Configuración" onClick={() => setPage("Configuración")}>
              <Icon name="settings" size={18} />
            </button>
          </div>
          <Toolbar
            page={page}
            scenario={scenario}
            setScenario={changeScenario}
            data={data}
            time={time}
          />
          {!(real && live.conn === "conectado" && data.quorum) && (
          <div className={`demo-notice ${loading ? "loading" : ""}`}>
            {live.mode === "connecting" ? (
              <>
                <i />
                <span>Conectando con el servidor del PC…</span>
              </>
            ) : real ? (
              <>
                <Icon name="server" size={13} />
                <span>
                  {live.conn === "conectado"
                    ? "Sin quórum: no hay mayoría de servidores. Los eventos quedan pendientes hasta que se restablezca."
                    : "Reconectando con el servidor del PC… se muestran los últimos datos conocidos"}
                </span>
              </>
            ) : loading ? (
              <>
                <i />
                <span>Aplicando escenario de demostración…</span>
              </>
            ) : (
              <>
                <Icon name="server" size={13} />
                <span>
                  <strong>{scenario}</strong> · DEMOSTRACIÓN: datos simulados · sin telemetría ESP32 en vivo
                </span>
              </>
            )}
          </div>
          )}
          {prefs.banner && alerts[0] && !hiddenBanner.includes(alerts[0].id) && (
            <div className="alert-banner" role="status">
              <Icon name="alert" />
              <div>
                <strong>
                  {alertLevelName(alerts[0].level)} confirmada a las {fmtTime(alerts[0].t)}
                </strong>
                <span>
                  2 detectores coincidieron ({alerts[0].dets.map(nodeName).join(", ")}), intensidad promedio {alerts[0].avg} de
                  10.
                </span>
              </div>
              <button
                onClick={() => {
                  setSelAlert(alerts[0].id);
                  setPage("Alertas");
                }}
              >
                Ver detalle
              </button>
              <button onClick={() => setHiddenBanner((v) => [...v, alerts[0].id])}>Ocultar</button>
            </div>
          )}
          <main>
            {page === "Panorama" && <Overview data={data} hist={hist} setPage={setPage} />}
            {page === "Sismógrafos" && <Seismographs data={data} />}
            {page === "Clúster Raft" && <Cluster data={data} hist={hist} onAction={serverAction} />}
            {page === "Detectores" && <Detectors data={data} hist={hist} onPress={pressDetector} />}
            {page === "Alertas" && (
              <Alerts data={data} alerts={alerts} sel={selAlert} setSel={setSelAlert} onTest={testAlarm} />
            )}
            {page === "Registros" && <Logs data={data} hist={hist} />}
            {page === "Configuración" && (
              <Settings prefs={prefs} set={setPref} reset={() => setPrefs({ ...DEFAULTS })} />
            )}
          </main>
        </div>
        {notice && <div className="toast-note" role="status">{notice}</div>}
        {alarm && (
          <AlarmOverlay
            alarm={alarm}
            data={data}
            left={Math.max(0, left)}
            muted={muted}
            setMuted={setMuted}
            blocked={blocked}
            onUnblock={() => audio.current?.play().then(() => setBlocked(false)).catch(() => {})}
            onClose={closeAlarm}
            onOpenAlerts={() => {
              closeAlarm();
              setPage("Alertas");
            }}
          />
        )}
        <nav className="mobile-nav">
          {navGroups
            .flatMap((g) => g.items)
            .map((item) => (
              <button
                key={item.page}
                className={page === item.page ? "active" : ""}
                onClick={() => setPage(item.page)}
              >
                <Icon name={item.icon} />
                <span>{item.page === "Clúster Raft" ? "Clúster" : item.page}</span>
              </button>
            ))}
        </nav>
      </div>
    </div>
  );
}
