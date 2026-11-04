import type { Phase } from '../math/detour';
import type { Speed } from '../state/flight';
import { km } from '../format';

const PHASE_LABEL: Record<Phase, string> = {
  OP: '① 접선 OP',
  ARC: '② 원호 PQ',
  QA: '③ 접선 QA',
  DIRECT: '직선 OA',
};

interface Props {
  enabled: boolean;
  reason: string | null;
  playing: boolean;
  progress: number;
  speed: Speed;
  phase: Phase | null;
  pieces: { phase: Phase; start: number; length: number }[];
  total: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSkip: () => void;
  onSeek: (p: number) => void;
  onSpeed: (s: Speed) => void;
  onResetStorm: () => void;
}

export function FlightPlayer(p: Props) {
  return (
    <div className={`player ${p.enabled ? '' : 'disabled'}`}>
      <div className="player-btns">
        {p.playing ? (
          <button className="btn primary" onClick={p.onPause} disabled={!p.enabled}>
            ❚❚ 일시정지
          </button>
        ) : (
          <button className="btn primary" onClick={p.onPlay} disabled={!p.enabled}>
            ▶ {p.progress > 0 && p.progress < 1 ? '계속' : '비행 시작'}
          </button>
        )}
        <button className="btn" onClick={p.onSkip} disabled={!p.enabled} title="다음 단계로">
          ⏭ 단계
        </button>
        <button className="btn" onClick={p.onRestart} disabled={!p.enabled}>
          ↺ 처음부터
        </button>
        <div className="speed">
          {([0.5, 1, 2] as Speed[]).map((s) => (
            <button key={s} className={`btn sm ${p.speed === s ? 'on' : ''}`} onClick={() => p.onSpeed(s)}>
              ×{s}
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={p.onResetStorm} disabled={!p.enabled && !p.reason}>
          태풍 재설정
        </button>
      </div>
      <div className="track">
        {p.pieces.map((pc) => (
          <div
            key={pc.phase}
            className={`seg seg-${pc.phase} ${p.phase === pc.phase ? 'on' : ''}`}
            style={{ width: `${(100 * pc.length) / (p.total || 1)}%` }}
          >
            <span>{PHASE_LABEL[pc.phase]}</span>
          </div>
        ))}
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={p.progress}
          onChange={(e) => p.onSeek(Number(e.target.value))}
          disabled={!p.enabled}
          aria-label="비행 위치"
        />
      </div>
      <div className="player-info tiny">
        {p.enabled ? (
          <>
            {p.phase ? PHASE_LABEL[p.phase] : ''} · {km(p.progress * p.total, 0)} / {km(p.total, 0)}
          </>
        ) : (
          <span className="muted">{p.reason}</span>
        )}
      </div>
    </div>
  );
}
