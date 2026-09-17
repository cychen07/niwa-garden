import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  GalleryHorizontalEnd,
  LayoutGrid,
  MousePointer2,
  Rotate3D,
  Save,
  Send,
  Sprout,
  TreePine,
  X,
} from "lucide-react";

export const ONBOARDING_KEY = "niwa-onboarding-day-v1";

export function onboardingDay(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function shouldShowOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) !== onboardingDay();
  } catch {
    return true;
  }
}

const steps = [
  {
    eyebrow: "01 / 选择",
    title: "先挑一件喜欢的物品",
    copy: "打开物品目录，从植物、构筑或摆件开始。",
  },
  {
    eyebrow: "02 / 布置",
    title: "点在庭院里，慢慢摆放",
    copy: "点击落下物品；拖动空白处旋转视角，找到舒服的位置。",
  },
  {
    eyebrow: "03 / 留存",
    title: "保存下来，也可以分享",
    copy: "保存会留在这台设备；发布后，其他人也能在作品广场看见。",
  },
] as const;

function StepVisual({ step }: { step: number }) {
  if (step === 0) return <div className="onboarding-visual choose-visual" aria-hidden="true">
    <div className="guide-rail">
      <span className="active"><LayoutGrid /></span>
      <span><Sprout /></span>
      <span><TreePine /></span>
    </div>
    <div className="guide-choice">
      <i />
      <TreePine />
      <b>松</b>
      <MousePointer2 className="guide-pointer" />
    </div>
  </div>;
  if (step === 1) return <div className="onboarding-visual place-visual" aria-hidden="true">
    <div className="guide-garden">
      <span className="guide-stone stone-one" />
      <span className="guide-stone stone-two" />
      <TreePine className="guide-tree" />
      <MousePointer2 className="guide-place-pointer" />
    </div>
    <div className="guide-orbit"><Rotate3D /><span>拖动空白处</span></div>
  </div>;
  return <div className="onboarding-visual share-visual" aria-hidden="true">
    <div className="guide-flow">
      <span><Save /></span>
      <i />
      <span><Send /></span>
      <i />
      <span className="final"><GalleryHorizontalEnd /></span>
    </div>
    <div className="guide-labels"><span>保存</span><span>发布</span><span>作品广场</span></div>
  </div>;
}

export function Onboarding({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    dialog.current?.showModal();
    try {
      localStorage.setItem(ONBOARDING_KEY, onboardingDay());
    } catch {
      // The current session still dismisses normally when browser storage is unavailable.
    }
  }, []);

  const close = () => {
    dialog.current?.close();
    onClose();
  };

  return <dialog ref={dialog} className="onboarding-dialog" aria-labelledby="onboarding-title"
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <button className="onboarding-close" type="button" aria-label="跳过引导" title="跳过引导" onClick={close}>
      <X />
    </button>
    <header className="onboarding-heading">
      <span className="onboarding-seal" aria-hidden="true">庭</span>
      <div><small>今日入庭</small><strong>三步开始造景</strong></div>
    </header>
    <div className="onboarding-stage" key={step} aria-live="polite">
      <StepVisual step={step} />
      <div className="onboarding-copy">
        <small>{steps[step].eyebrow}</small>
        <h2 id="onboarding-title">{steps[step].title}</h2>
        <p>{steps[step].copy}</p>
      </div>
    </div>
    <nav className="onboarding-progress" aria-label="引导进度">
      {steps.map((item, index) => <button key={item.eyebrow} type="button"
        className={index === step ? "active" : ""} aria-current={index === step ? "step" : undefined}
        aria-label={`第 ${index + 1} 步`} onClick={() => setStep(index)}><span /></button>)}
    </nav>
    <footer className="onboarding-actions">
      {step === 0
        ? <button type="button" className="quiet" onClick={close}>暂时跳过</button>
        : <button type="button" className="quiet" onClick={() => setStep((value) => value - 1)}>
          <ArrowLeft />上一步
        </button>}
      <button type="button" className="primary" onClick={() => {
        if (step < steps.length - 1) setStep((value) => value + 1);
        else close();
      }}>
        {step < steps.length - 1 ? <>下一步<ArrowRight /></> : "开始搭建"}
      </button>
    </footer>
  </dialog>;
}
