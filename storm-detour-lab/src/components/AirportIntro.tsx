import { useEffect, useState } from 'react';
import { AirportScene } from './AirportScene';

/** 인트로: 여행자가 캐리어를 끌고 출국장에 들어와 체크인 카운터로 간다 */
export function AirportIntro({ onDone }: { onDone: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 6800);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="intro-screen">
      <div className="intro-stage">
        <AirportScene
          mode="enter"
          bubbles={[
            { who: 'agent', text: '어서 오세요, 심풀 항공입니다. 오늘은 어디로 떠나시나요?', delay: 4.4 },
            { who: 'traveler', text: '인천에서 출발하는 비행기를 예약하고 싶어요!', delay: 6.0 },
          ]}
        />
        <div className="intro-caption">
          <small>INCHEON INTERNATIONAL · DEPARTURES</small>
          <h1>태풍을 지나는 여행</h1>
        </div>
        <div className="intro-actions">
          <button className={`btn-main big ${ready ? 'glow' : ''}`} onClick={onDone}>
            카운터에서 예약하기 →
          </button>
          {!ready && (
            <button className="link-btn light" onClick={onDone}>
              건너뛰기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
