"use client";

import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";

/** 장면마다 화면 모형이 읽는 값. 숫자·글·켜짐만 쓴다(서버와 브라우저가 같은 화면을 그리게). */
export type DemoState = Record<string, string | number | boolean>;

export type DemoScene<S extends DemoState = DemoState> = {
  /** 모형 아래 자막. 이 장면에서 무엇을 하고 무엇이 바뀌는지 한 줄로 말한다. */
  caption: string;
  /** 가짜 손가락이 눌러 보일 곳(모형의 data-demo-target 값). 없으면 누르지 않고 화면만 바뀐다. */
  target?: string;
  /** 누른 뒤(이 장면이 끝난 뒤) 화면 상태. */
  state: S;
};

export type DemoScreenProps<S extends DemoState = DemoState> = {
  state: S;
  /** 지금 장면에서 누를 곳. 모형은 이 곳에 강조 테두리를 그린다(markTarget). */
  hit?: string;
};

/** 단계 하나의 시연: 처음 화면 + 장면 2~4개 + 그 값을 그리는 화면 모형. */
export type GuideDemoSpec<S extends DemoState = DemoState> = {
  /** 모형을 그림 하나로 읽힐 때의 설명. 없으면(흐름도처럼 글이 그대로 읽히는 모형) 그림으로 묶지 않는다. */
  alt?: string;
  initial: S;
  scenes: DemoScene<S>[];
  Screen: ComponentType<DemoScreenProps<S>>;
};

/** 화면 모형 쪽 값 타입을 지키면서 단계 목록(서로 다른 값 타입)에 담는다. */
export function defineDemo<S extends DemoState>(spec: GuideDemoSpec<S>): GuideDemoSpec {
  return spec as unknown as GuideDemoSpec;
}

/** 모형 안에서 누를 곳 표시. 지금 장면에서 누를 곳이면 data-hit가 붙어 강조 테두리가 생긴다. */
export function markTarget(name: string, hit: string | undefined) {
  return { "data-demo-target": name, "data-hit": hit === name ? "" : undefined };
}

/**
 * 장면 하나는 '겨누기'(손가락이 누를 곳으로 감, 화면은 앞 장면 그대로) → '바뀜'(눌림 파문, 화면이 바뀌고 잠깐 멈춤) 두 칸이다.
 * 누를 곳이 없는 장면(화면만 바뀜)은 겨누기 대신 짧게 숨을 고른다(beat). 자막이 먼저 바뀌고 화면이 따라 바뀐다.
 * 마지막 장면 뒤에는 조금 더 멈췄다가 처음 화면부터 다시 돈다. 값은 밀리초이고 화면 글에는 쓰지 않는다.
 */
export const DEMO_TIMING = { aim: 1000, beat: 500, hold: 2600, end: 1600 } as const;

type Phase = "aim" | "done";
type Position = { scene: number; phase: Phase };

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}
const readMotion = () => window.matchMedia?.(REDUCED_MOTION)?.matches ?? false;
const serverMotion = () => false;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const readVisibility = () => document.visibilityState !== "hidden";
const serverVisibility = () => true;

/**
 * 설명서 단계마다 화면 모형이 저절로 움직이는 시연. 장면 목록(spec.scenes)을 차례로 돌린다.
 * - 화면에 보일 때(IntersectionObserver)와 탭이 보일 때만 타이머를 돌린다. 화면 밖이면 타이머가 하나도 없다.
 * - '움직임 줄이기'면 자동 재생하지 않고 마지막 장면(결과)을 멈춘 화면으로 보이며 '다음 장면'으로 한 장면씩 넘긴다.
 * - 자막은 처음 한 바퀴와 멈춘 뒤 손으로 넘길 때만 낭독기에 알린다(자동 반복 중에는 같은 말을 되풀이하지 않음).
 * - 다음 단계로 저절로 넘어가지 않는다. 단계 넘김은 설명서의 이전·다음 버튼만 한다.
 */
export function GuideDemo({ spec, label }: { spec: GuideDemoSpec; label: string }) {
  const { scenes, initial, Screen, alt } = spec;
  const last = scenes.length - 1;
  const reduced = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const pageVisible = useSyncExternalStore(subscribeVisibility, readVisibility, serverVisibility);
  // 사용자가 누른 재생·멈춤. 누르기 전에는 '움직임 줄이기'를 따른다.
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = choice ?? !reduced;
  // 누르거나 타이머가 옮기기 전에는 기본 위치: 재생이면 첫 장면 겨누기, 움직임 줄이기면 마지막 장면 결과.
  const [moved, setMoved] = useState<Position | null>(null);
  const position: Position = moved ?? (reduced ? { scene: last, phase: "done" } : { scene: 0, phase: "aim" });
  const [loop, setLoop] = useState(0);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLSpanElement>(null);

  // IntersectionObserver가 없는 브라우저(오래된 브라우저·시험 환경)는 보이는 것으로 친다. 화면에 그리는 값이 아니라 타이머만 바꾼다.
  const observerMissing = typeof window !== "undefined" && typeof window.IntersectionObserver !== "function";
  const running = playing && pageVisible && (inView || observerMissing);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof window.IntersectionObserver !== "function") return;
    const observer = new window.IntersectionObserver((entries) => {
      for (const entry of entries) setInView(entry.isIntersecting && entry.intersectionRatio >= 0.35);
    }, { threshold: [0, 0.35, 0.7] });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { scene: sceneIndex, phase } = position;
  const scene = scenes[sceneIndex];
  const target = scene.target;

  useEffect(() => {
    if (!running) return;
    const isLast = sceneIndex === last;
    const delay = phase === "aim"
      ? (target ? DEMO_TIMING.aim : DEMO_TIMING.beat)
      : DEMO_TIMING.hold + (isLast ? DEMO_TIMING.end : 0);
    const timer = window.setTimeout(() => {
      if (phase === "aim") {
        setMoved({ scene: sceneIndex, phase: "done" });
      } else if (isLast) {
        setLoop((value) => value + 1);
        setMoved({ scene: 0, phase: "aim" });
      } else {
        setMoved({ scene: sceneIndex + 1, phase: "aim" });
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [running, sceneIndex, phase, last, target]);

  // 겨누는 동안은 앞 장면 화면 그대로, 누른 뒤에 이 장면 화면.
  const state = phase === "aim" ? (sceneIndex === 0 ? initial : scenes[sceneIndex - 1].state) : scene.state;

  // 손가락을 누를 곳 가운데로 옮긴다. 화면 크기가 바뀌어도 다시 잰다. 위치는 그리는 값이 아니라 스타일 변수라 하이드레이션과 상관없다.
  const placePointer = useCallback(() => {
    const screen = screenRef.current;
    const pointer = pointerRef.current;
    if (!screen || !pointer) return;
    if (!target) {
      pointer.dataset.show = "false";
      return;
    }
    // 누른 뒤 화면이 바뀌어 누른 곳이 없어졌으면(버튼이 바뀌거나 다른 화면으로 넘어감) 손가락은 누른 자리에서
    // 파문만 남기고 사라진다(바뀐 화면의 다른 버튼을 누르는 것처럼 보이지 않게).
    const element = screen.querySelector<HTMLElement>(`[data-demo-target="${target}"]`);
    pointer.dataset.gone = element ? "false" : "true";
    if (!element) return;
    const box = screen.getBoundingClientRect();
    const spot = element.getBoundingClientRect();
    pointer.style.setProperty("--gd-x", `${Math.round(spot.left - box.left + Math.min(spot.width * 0.55, spot.width - 12))}px`);
    pointer.style.setProperty("--gd-y", `${Math.round(spot.top - box.top + spot.height * 0.6)}px`);
    pointer.dataset.show = "true";
  }, [target]);

  useEffect(() => {
    placePointer();
  }, [placePointer, sceneIndex, phase, loop]);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen || typeof window.ResizeObserver !== "function") return;
    const observer = new window.ResizeObserver(() => placePointer());
    observer.observe(screen);
    return () => observer.disconnect();
  }, [placePointer]);

  const toggle = () => setChoice(!playing);
  const restart = () => {
    setLoop(0);
    setMoved(playing ? { scene: 0, phase: "aim" } : { scene: 0, phase: "done" });
  };
  // 손으로 넘기면 자동 재생은 멈춘다. 아직 누르기 전 장면이면 그 장면 결과부터 보인다.
  const nextScene = () => {
    setChoice(false);
    setMoved(phase === "aim" ? { scene: sceneIndex, phase: "done" } : { scene: (sceneIndex + 1) % scenes.length, phase: "done" });
  };

  const announce = !playing || loop === 0;

  return (
    <section
      ref={rootRef}
      className="guideDemo"
      aria-label={label}
      data-testid="guide-demo"
      data-phase={phase}
      data-scene={sceneIndex + 1}
      data-playing={playing}
    >
      <div
        ref={screenRef}
        className="gdScreen"
        data-kind={alt ? "mock" : "free"}
        data-testid="guide-demo-screen"
        {...(alt ? { role: "img", "aria-label": alt } : {})}
      >
        <Screen state={state} hit={target} />
        <span ref={pointerRef} className="gdPointer" data-show="false" aria-hidden="true">
          <span className="gdPointerDot" />
          {phase === "done" && target && <span key={`${loop}-${sceneIndex}`} className="gdRipple" />}
        </span>
      </div>
      <div className="gdBar">
        <p className="gdCaption" data-testid="guide-demo-caption" aria-live={announce ? "polite" : "off"} aria-atomic="true">
          <span className="srOnly">{`장면 ${sceneIndex + 1}/${scenes.length}. `}</span>
          {scene.caption}
        </p>
        <div className="gdControls">
          <span className="gdDots" aria-hidden="true">
            {scenes.map((item, index) => (
              <span key={item.caption} data-state={index < sceneIndex ? "done" : index === sceneIndex ? "current" : "todo"} />
            ))}
          </span>
          <button type="button" className="gdControl" onClick={toggle} aria-label={playing ? "시연 멈춤" : "시연 재생"} title={playing ? "멈춤" : "재생"} data-testid="guide-demo-toggle">
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </button>
          <button type="button" className="gdControl" onClick={restart} aria-label="시연 처음부터" title="처음부터" data-testid="guide-demo-restart">
            <RotateCcw size={18} aria-hidden="true" />
          </button>
          <button type="button" className="gdControl" onClick={nextScene} aria-label="다음 장면" title="다음 장면" data-testid="guide-demo-next-scene">
            <SkipForward size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
