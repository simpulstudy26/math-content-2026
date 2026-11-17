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

const PHASE_TEXT = { OP: '접선 OP 비행', ARC: '원호 PQ 선회', QA: '접선 QA 비행', DIRECT: '직선 비행' } as const;
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
  const [sceneryOnly, setSceneryOnly] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
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
    const id = window.setTimeout(() => scene.play(), 1400);
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

  useEffect(() => {
    if (visible.length > seenCount.current) {
      if (seenCount.current > 0 || visible.length === 1) ambient.chime(visible[visible.length - 1].kind === 'story');
      seenCount.current = visible.length;
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

  return (
    <div className={`flight ${sceneryOnly ? 'scenery' : ''}`}>
      <div ref={host} className="scene-host" />
      {error && <div className="scene-error">{error}</div>}

      <div className="cockpit-frame" aria-hidden />

      <header className="flight-top">
        <div className="route-chip">
          <span>인천 ICN</span>
          <span className="arrow">✈</span>
          <span>
            {destLabel} <small>{destCode}</small>
          </span>
        </div>
        <div className="top-btns">
          <button
            className="glass-btn"
            onClick={() => {
              ambient.setMuted(!muted);
              setMuted(!muted);
            }}
            aria-label="음악 켜고 끄기"
          >
            {muted ? '🔇 소리 꺼짐' : '🎵 소리 켜짐'}
          </button>
          <button className="glass-btn" onClick={() => setSceneryOnly((v) => !v)}>
            {sceneryOnly ? '📐 계기판 보기' : '🌤 풍경만 보기'}
          </button>
          <button className="glass-btn" onClick={onExit}>
            🎫 새 여행
          </button>
        </div>
      </header>

      {!sceneryOnly && (
        <>
          <aside className={`notes ${notesOpen ? '' : 'closed'}`}>
            <button className="notes-head" onClick={() => setNotesOpen((v) => !v)}>
              <span>📓 기내 노트</span>
              <small>
                {visible.filter((v) => v.kind === 'calc').length} / {slots.filter((v) => v.kind === 'calc').length} {notesOpen ? '▾' : '▸'}
              </small>
            </button>
            {notesOpen && (
              <div className="notes-body" ref={notesBox}>
                {visible.length === 0 && <p className="muted pad">이륙 중… 곧 첫 번째 노트가 적혀요.</p>}
                {visible.map((s, i) => (
                  <article key={s.id} className={`note ${s.kind} ${i === visible.length - 1 ? 'latest' : ''}`}>
                    <h4>
                      {s.step && <span className="step">{s.step}</span>}
                      {s.title}
                    </h4>
                    <NoteBody id={s.id} trip={trip} />
                  </article>
                ))}
              </div>
            )}
          </aside>

          <footer className="dash">
            <div className="radar">
              <div className="dash-label">레이더 · 계산 좌표평면</div>
              <Radar trip={trip} distance={st?.distance ?? 0} zoom={zoom} reveal={radarReveal(visibleIds)} pos={here.p} heading={here.dir} />
            </div>
            <div className="instruments">
              <div className="phase-now">{st ? PHASE_TEXT[st.phase] : '탑승 완료'}</div>
              <div className="gauges">
                <div>
                  <span>비행 거리</span>
                  <b>{num(st?.distance ?? 0, 0)}</b>
                  <small>/ {num(trip.path.total, 0)} km</small>
                </div>
                <div>
                  <span>고도</span>
                  <b>{num((st?.altitude ?? 0) * 1000, 0)}</b>
                  <small>m</small>
                </div>
                <div>
                  <span>위치 (x, y)</span>
                  <b className="mono sm">
                    ({num(st?.x ?? 0, 0)}, {num(st?.y ?? 0, 0)})
                  </b>
                </div>
              </div>
              <div className="timebar">
                <div className="segs" onClick={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  scene?.seek(((e.clientX - rect.left) / rect.width) * D);
                }}>
                  <span className="seg op" style={{ width: `${(P / D) * 100}%` }}>OP</span>
                  <span className="seg arc" style={{ width: `${((Q - P) / D) * 100}%` }}>호 PQ</span>
                  <span className="seg qa" style={{ width: `${((D - Q) / D) * 100}%` }}>QA</span>
                  <i className="cursor" style={{ left: `${(time / D) * 100}%` }} />
                </div>
                <div className="time-row">
                  <button className="play" onClick={() => (st?.playing ? scene?.pause() : scene?.play())} aria-label={st?.playing ? '일시정지' : '재생'}>
                    {st?.playing ? '❚❚' : '▶'}
                  </button>
                  {[1, 2, 4].map((k) => (
                    <button key={k} className={`spd ${st?.speed === k ? 'on' : ''}`} onClick={() => scene?.setSpeed(k)}>
                      ×{k}
                    </button>
                  ))}
                  <span className="mono clock">
                    {mmss(time / (st?.speed ? 1 : 1))} / {mmss(D)}
                  </span>
                </div>
              </div>
            </div>
          </footer>
        </>
      )}

      <div className={`intro ${time > 2.5 ? 'gone' : ''}`}>
        <div>
          <small>탑승 완료</small>
          <h2>{destLabel}행</h2>
          <p>창밖을 감상하세요. 비행하는 동안 기내 노트에 최단 항로 계산이 하나씩 적혀요.</p>
          <p className="hint">화면을 끌면 고개를 돌려 주변을 볼 수 있어요.</p>
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
