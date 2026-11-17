import { useEffect, useMemo, useRef, useState } from 'react';
import { FlightScene, type FlightState } from '../scene/FlightScene';
import { makeTimeline, type Trip } from '../math/trip';
import { radarReveal, scheduleNotes, type NoteId } from '../story/notes';
import type { Ambient } from '../audio/ambient';
import { Radar } from './Radar';
import { NoteBody } from './NoteBody';
import { Postcard } from './Postcard';
import { num } from '../format';

interface Props {
  trip: Trip;
  destLabel: string;
  destCode: string;
  ambient: Ambient;
  onExit: () => void;
}

const PHASE_TEXT = { OP: '접선 OP를 따라 순항 중', ARC: '태풍 가장자리, 원호 PQ를 선회 중', QA: '접선 QA를 따라 목적지로', DIRECT: '직선 비행' } as const;
const smooth = (e0: number, e1: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function FlightView({ trip, destLabel, destCode, ambient, onExit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FlightScene | null>(null);
  const timeline = useMemo(() => makeTimeline(trip, 240), [trip]);
  const slots = useMemo(() => scheduleNotes(timeline), [timeline]);
  const [st, setSt] = useState<FlightState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const [expanded, setExpanded] = useState<NoteId | null>(null);
  const [muted, setMuted] = useState(ambient.muted);
  const [postcardOpen, setPostcardOpen] = useState(false);
  const notesBox = useRef<HTMLDivElement>(null);
  const seenCount = useRef(0);

  useEffect(() => {
    let scene: FlightScene;
    try {
      scene = new FlightScene(host.current!, trip, timeline, Math.round(trip.t * 1000) % 100000);
    } catch (e) {
      setError(`3D 화면을 시작하지 못했습니다 (${(e as Error).message}). 브라우저의 하드웨어 가속(WebGL)을 켜 주세요.`);
      return;
    }
    sceneRef.current = scene;
    const off = scene.subscribe(setSt);
    const id = window.setTimeout(() => scene.play(), 1800);
    return () => {
      window.clearTimeout(id);
      off();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [trip, timeline]);

  const time = st?.time ?? 0;
  const visible = slots.filter((s) => s.at <= time);
  const visibleIds = new Set<NoteId>(visible.map((s) => s.id));
  const latest = visible[visible.length - 1];

  useEffect(() => {
    if (visible.length > seenCount.current) {
      ambient.chime(visible[visible.length - 1].kind === 'story');
      seenCount.current = visible.length;
      setExpanded(null);
      requestAnimationFrame(() => notesBox.current?.scrollTo({ top: notesBox.current.scrollHeight, behavior: 'smooth' }));
    } else if (visible.length < seenCount.current) {
      seenCount.current = visible.length;
    }
  }, [visible.length, ambient, visible]);

  useEffect(() => {
    if (st?.done) setPostcardOpen(true);
  }, [st?.done]);
  useEffect(() => {
    sceneRef.current?.setFrozen(postcardOpen);
  }, [postcardOpen]);

  const scene = sceneRef.current;
  const D = timeline.duration;
  const { P, Q } = timeline.marks;
  const zoom = smooth(D * 0.28, P, time) * (1 - smooth(Q + D * 0.04, Q + D * 0.16, time));
  const here = trip.path.at(st?.distance ?? 0);
  const calcCount = visible.filter((v) => v.kind === 'calc').length;
  const calcTotal = slots.filter((v) => v.kind === 'calc').length;

  return (
    <div className={`flight ${uiHidden ? 'ui-hidden' : ''}`}>
      <div ref={host} className="scene-host" />
      {error && <div className="scene-error">{error}</div>}
      <div className="vignette" aria-hidden />

      <header className="hud-top">
        <div className="route-card">
          <div className="route-line">
            <span className="code">ICN</span>
            <span className="dash-line">
              <i style={{ width: `${(time / D) * 100}%` }} />
              <b style={{ left: `${(time / D) * 100}%` }}>✈</b>
            </span>
            <span className="code">{destCode}</span>
          </div>
          <div className="route-sub">
            <span>인천</span>
            <span>{destLabel}</span>
          </div>
          <div className="route-phase">{st ? PHASE_TEXT[st.phase] : '탑승 완료'}</div>
        </div>
        <div className="hud-btns">
          <button
            className="icon-btn"
            onClick={() => {
              ambient.setMuted(!muted);
              setMuted(!muted);
            }}
            title={muted ? '소리 켜기' : '소리 끄기'}
          >
            {muted ? '🔇' : '🎵'}
          </button>
          <button className="icon-btn" onClick={() => setUiHidden((v) => !v)} title={uiHidden ? '화면 정보 보기' : '풍경만 보기'}>
            {uiHidden ? '📐' : '🌤'}
          </button>
          <button className="icon-btn wide" onClick={onExit}>
            새 여행
          </button>
        </div>
      </header>

      <aside className={`journal ${notesOpen ? '' : 'closed'}`}>
        <button className="journal-head" onClick={() => setNotesOpen((v) => !v)}>
          <span>기내 노트</span>
          <small>
            계산 {calcCount}/{calcTotal} {notesOpen ? '–' : '+'}
          </small>
        </button>
        {notesOpen && (
          <div className="journal-body" ref={notesBox}>
            {visible.length === 0 && <p className="journal-empty">이륙 중이에요. 곧 첫 번째 노트가 적혀요.</p>}
            {visible.map((s) => {
              const open = s === latest || expanded === s.id;
              return (
                <article key={s.id} className={`entry ${s.kind} ${s === latest ? 'latest' : ''} ${open ? 'open' : ''}`}>
                  <button className="entry-title" onClick={() => setExpanded(expanded === s.id ? null : s.id)} disabled={s === latest}>
                    {s.step ? <span className="step">{s.step}</span> : <span className="step story">✈</span>}
                    <span>{s.title}</span>
                  </button>
                  {open && (
                    <div className="entry-body">
                      <NoteBody id={s.id} trip={trip} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </aside>

      <section className="radar-card">
        <div className="card-label">
          <span>레이더 · 계산 좌표평면</span>
          <small>x축 = 기수 방향</small>
        </div>
        <Radar trip={trip} distance={st?.distance ?? 0} zoom={zoom} reveal={radarReveal(visibleIds)} pos={here.p} heading={here.dir} />
      </section>

      <footer className="controls">
        <button className="play" onClick={() => (st?.playing ? scene?.pause() : scene?.play())} aria-label={st?.playing ? '일시정지' : '재생'}>
          {st?.playing ? '❚❚' : '▶'}
        </button>
        <div className="ctl-main">
          <div
            className="segs"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              scene?.seek(((e.clientX - rect.left) / rect.width) * D);
            }}
          >
            <span className="seg op" style={{ width: `${(P / D) * 100}%` }}>
              접선 OP
            </span>
            <span className="seg arc" style={{ width: `${((Q - P) / D) * 100}%` }}>
              원호 PQ
            </span>
            <span className="seg qa" style={{ width: `${((D - Q) / D) * 100}%` }}>
              접선 QA
            </span>
            <i className="fill" style={{ width: `${(time / D) * 100}%` }} />
            <i className="cursor" style={{ left: `${(time / D) * 100}%` }} />
          </div>
          <div className="readouts">
            <span>
              비행 <b>{num(st?.distance ?? 0, 0)}</b> / {num(trip.path.total, 0)} km
            </span>
            <span>
              고도 <b>{num((st?.altitude ?? 0) * 1000, 0)}</b> m
            </span>
            <span className="mono">
              ({num(st?.x ?? 0, 0)}, {num(st?.y ?? 0, 0)})
            </span>
            <span className="clock">
              {mmss(time)} / {mmss(D)}
            </span>
          </div>
        </div>
        <div className="speed">
          {[1, 2, 4].map((k) => (
            <button key={k} className={st?.speed === k ? 'on' : ''} onClick={() => scene?.setSpeed(k)}>
              ×{k}
            </button>
          ))}
        </div>
      </footer>

      <div className={`intro ${time > 3 ? 'gone' : ''}`}>
        <div>
          <small>BOARDING COMPLETE</small>
          <h2>{destLabel}</h2>
          <p>인천을 떠나 {num(trip.t, 0)} km의 여행. 창밖을 즐기는 동안 기내 노트에 최단 항로 계산이 하나씩 적혀요.</p>
        </div>
      </div>

      {postcardOpen && (
        <Postcard
          trip={trip}
          destLabel={destLabel}
          destCode={destCode}
          onReplay={() => {
            setPostcardOpen(false);
            seenCount.current = 0;
            scene?.seek(0);
            scene?.play();
          }}
          onNew={onExit}
          onClose={() => setPostcardOpen(false)}
        />
      )}
    </div>
  );
}
