"use client";

import { Archive, Check, ChevronRight, ClipboardList, PackagePlus, Plus, Save, Settings2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { createDomainId, PLAN_PRICES, type OptionTemplate, type PackageTemplate, type TaskTemplate } from "@/lib/domain";
import { seedPackages } from "@/lib/store";
import { formatWon, useWorkspace } from "./workspace-provider";
import { UpgradeNotice } from "./upgrade-notice";

type CatalogTab = "package" | "option";

/**
 * 기본 제공 패키지를 아직 손대지 않았는지 본다.
 * 예시가 홈페이지 제작이라 다른 업종 사용자는 "내 것이 아니다"라고 느끼기 쉬워,
 * 고쳐 쓰라는 안내를 이때만 보여준다.
 */
const seedPackageIds = new Set(seedPackages.map((item) => item.id));

function usesOnlySeedPackages(packages: PackageTemplate[]): boolean {
  const live = packages.filter((item) => !item.archivedAt);
  return live.length > 0 && live.every((item) => seedPackageIds.has(item.id));
}

function numeric(value: string) {
  return Math.max(0, Number.parseInt(value || "0", 10) || 0);
}

function taskKey(title: string, index: number) {
  const compact = title.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
  return compact ? `task-${compact.slice(0, 36)}-${index + 1}` : `task-${index + 1}`;
}

function newPackage(): PackageTemplate {
  return {
    id: createDomainId("pkg"),
    name: "새 홈페이지 패키지",
    description: "반복해서 쓰는 홈페이지 제작 조건",
    price: 0,
    estimatedCost: 0,
    durationDays: 7,
    revisionLimit: 1,
    tasks: [
      { taskKey: "brief", title: "의뢰서 확인", relativeDay: 0, order: 0 },
      { taskKey: "launch", title: "최종 검수와 납품", relativeDay: 7, order: 1 },
    ],
  };
}

function newOption(): OptionTemplate {
  return {
    id: createDomainId("opt"),
    name: "새 옵션",
    description: "선택 시 자동으로 반영되는 추가 조건",
    priceDelta: 0,
    estimatedCostDelta: 0,
    durationDaysDelta: 0,
    revisionLimitDelta: 0,
    taskDeltas: [],
  };
}

function TaskRows({ tasks, onChange }: { tasks: TaskTemplate[]; onChange: (tasks: TaskTemplate[]) => void }) {
  const updateTask = (index: number, patch: Partial<TaskTemplate>) => {
    onChange(tasks.map((task, current) => current === index ? { ...task, ...patch } : task));
  };

  return (
    <div className="catalogTaskEditor">
      <div className="catalogTaskHead"><span>자동 생성 Todo</span><span>상대 기한</span></div>
      {tasks.map((task, index) => (
        <div className="catalogTaskRow" key={`${task.taskKey}-${index}`}>
          <input
            aria-label={`Todo ${index + 1} 제목`}
            value={task.title}
            onChange={(event) => updateTask(index, { title: event.target.value, taskKey: taskKey(event.target.value, index) })}
            placeholder="할 일 이름"
          />
          <label><input aria-label={`Todo ${index + 1} 상대 일수`} type="number" min="0" value={task.relativeDay} onChange={(event) => updateTask(index, { relativeDay: numeric(event.target.value) })} /><span>일</span></label>
          <button type="button" className="smallIconButton" aria-label={`Todo ${index + 1} 삭제`} onClick={() => onChange(tasks.filter((_, current) => current !== index))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button
        type="button"
        className="compactButton"
        onClick={() => onChange([...tasks, { taskKey: `task-${tasks.length + 1}`, title: "새 할 일", relativeDay: 0, order: tasks.length }])}
      ><Plus size={15} /> Todo 추가</button>
    </div>
  );
}

export function PackageManager() {
  const { packages, options, savePackage, archivePackage, saveOption, archiveOption, canCreatePackage, canCreateOption, limits } = useWorkspace();
  const [tab, setTab] = useState<CatalogTab>("package");
  const [selectedPackageId, setSelectedPackageId] = useState(packages.find((item) => !item.archivedAt)?.id ?? "");
  const [selectedOptionId, setSelectedOptionId] = useState(options.find((item) => !item.archivedAt)?.id ?? "");
  const [packageDraft, setPackageDraft] = useState<PackageTemplate | null>(null);
  const [optionDraft, setOptionDraft] = useState<OptionTemplate | null>(null);
  const [savedMessage, setSavedMessage] = useState("");

  const selectedPackage = useMemo(
    () => packageDraft ?? packages.find((item) => item.id === selectedPackageId) ?? packages[0] ?? newPackage(),
    [packageDraft, packages, selectedPackageId],
  );
  const selectedOption = useMemo(
    () => optionDraft ?? options.find((item) => item.id === selectedOptionId) ?? options[0] ?? newOption(),
    [optionDraft, options, selectedOptionId],
  );

  const flashSaved = (message: string) => {
    setSavedMessage(message);
    window.setTimeout(() => setSavedMessage(""), 2200);
  };

  const selectPackage = (id: string) => {
    setSelectedPackageId(id);
    setPackageDraft(null);
  };
  const selectOption = (id: string) => {
    setSelectedOptionId(id);
    setOptionDraft(null);
  };

  const saveCurrentPackage = () => {
    const normalized = {
      ...selectedPackage,
      name: selectedPackage.name.trim() || "이름 없는 패키지",
      tasks: selectedPackage.tasks
        .filter((task) => task.title.trim())
        .map((task, index) => ({ ...task, taskKey: task.taskKey || taskKey(task.title, index), order: index })),
    };
    savePackage(normalized);
    setSelectedPackageId(normalized.id);
    setPackageDraft(null);
    flashSaved("패키지 조건을 저장했어요. 새 일감부터 적용돼요.");
  };

  const saveCurrentOption = () => {
    const normalized = {
      ...selectedOption,
      name: selectedOption.name.trim() || "이름 없는 옵션",
      taskDeltas: selectedOption.taskDeltas.map((delta, index) =>
        delta.kind === "add" ? { ...delta, task: { ...delta.task, taskKey: delta.task.taskKey || taskKey(delta.task.title, index), order: index } } : delta,
      ),
    };
    saveOption(normalized);
    setSelectedOptionId(normalized.id);
    setOptionDraft(null);
    flashSaved("옵션 변화를 저장했어요. 새 일감 미리보기에 즉시 반영돼요.");
  };

  const packageList = packages.filter((item) => !item.archivedAt);
  const optionList = options.filter((item) => !item.archivedAt);
  const optionTask = selectedOption.taskDeltas.find((delta) => delta.kind === "add");
  const removeTask = selectedOption.taskDeltas.find((delta) => delta.kind === "remove");

  return (
    <div className="pageSurface catalogPage">
      <header className="pageHeader catalogHeader">
        <div>
          <h1>패키지와 옵션</h1>
          <p>여기서 정한 금액·마감·수정·Todo가 새 일감에 자동으로 합성돼요.</p>
        </div>
        {savedMessage && <span className="catalogSaved" role="status"><Check size={16} /> {savedMessage}</span>}
      </header>

      {usesOnlySeedPackages(packages) && (
        <p className="seedHint">
          <ClipboardList size={16} />
          <span>
            지금 보이는 건 <strong>예시 패키지</strong>예요. 디자인·영상·마케팅 어떤 일이든, 내가 파는 조건으로
            금액·기간·수정 횟수를 고치거나 지우고 새로 만들어 쓰세요.
          </span>
        </p>
      )}

      <div className="catalogTabs" role="tablist" aria-label="카탈로그 종류">
        <button type="button" role="tab" aria-selected={tab === "package"} data-active={tab === "package"} onClick={() => setTab("package")}><PackagePlus size={17} /> 패키지 {packageList.length}</button>
        <button type="button" role="tab" aria-selected={tab === "option"} data-active={tab === "option"} onClick={() => setTab("option")}><Settings2 size={17} /> 옵션 {optionList.length}</button>
      </div>

      {tab === "package" ? (
        <div className="catalogGrid">
          <aside className="catalogList" aria-label="패키지 목록">
            <div className="catalogListHead"><strong>홈페이지 제작 패키지</strong>{canCreatePackage && <button type="button" className="smallIconButton" aria-label="새 패키지" onClick={() => { const next = newPackage(); setSelectedPackageId(next.id); setPackageDraft(next); }}><Plus size={16} /></button>}</div>
            <div className="catalogItems">
            {packageList.map((item) => (
              <button type="button" className="catalogListItem" data-active={selectedPackage.id === item.id} key={item.id} onClick={() => selectPackage(item.id)}>
                <div><strong>{item.name}</strong><span>{formatWon(item.price)} · {item.durationDays}일 · 수정 {item.revisionLimit}회</span></div><ChevronRight size={16} />
              </button>
            ))}
            </div>
            {!canCreatePackage && (
              <UpgradeNotice
                title={`지금 플랜은 패키지 ${limits.packages}개까지예요`}
                description={`기존 패키지를 편집하는 건 언제든 돼요. Basic(${PLAN_PRICES.basic.label})부터 패키지가 무제한이에요.`}
              />
            )}
          </aside>
          <section className="catalogEditor">
            <div className="catalogEditorHead"><div><span>새 일감에만 적용</span><h2>{packageDraft ? "새 패키지 만들기" : selectedPackage.name}</h2></div><ClipboardList size={21} /></div>
            <div className="catalogFieldGrid">
              <label><span>패키지 이름</span><input value={selectedPackage.name} onChange={(event) => setPackageDraft({ ...selectedPackage, name: event.target.value })} /></label>
              <label><span>기본 금액 (원)</span><input type="number" min="0" value={selectedPackage.price} onChange={(event) => setPackageDraft({ ...selectedPackage, price: numeric(event.target.value) })} /></label>
              <label className="catalogFullField"><span>설명</span><input value={selectedPackage.description ?? ""} onChange={(event) => setPackageDraft({ ...selectedPackage, description: event.target.value })} /></label>
              <label><span>기본 기간 (일)</span><input type="number" min="0" value={selectedPackage.durationDays} onChange={(event) => setPackageDraft({ ...selectedPackage, durationDays: numeric(event.target.value) })} /></label>
              <label><span>포함 수정 (회)</span><input type="number" min="0" value={selectedPackage.revisionLimit} onChange={(event) => setPackageDraft({ ...selectedPackage, revisionLimit: numeric(event.target.value) })} /></label>
              <label><span>예상 원가 (원)</span><input type="number" min="0" value={selectedPackage.estimatedCost} onChange={(event) => setPackageDraft({ ...selectedPackage, estimatedCost: numeric(event.target.value) })} /></label>
            </div>
            <TaskRows tasks={selectedPackage.tasks} onChange={(tasks) => setPackageDraft({ ...selectedPackage, tasks })} />
            <div className="catalogActions"><button type="button" className="primaryButton" onClick={saveCurrentPackage} data-testid="save-package"><Save size={16} /> 패키지 저장</button>{!packageDraft && <button type="button" className="quietButton" onClick={() => { if (window.confirm("이 패키지를 새 일감 선택 목록에서 보관할까요? 기존 일감은 바뀌지 않아요.")) { archivePackage(selectedPackage.id); flashSaved("패키지를 보관했어요."); } }}><Archive size={16} /> 보관</button>}</div>
          </section>
        </div>
      ) : (
        <div className="catalogGrid">
          <aside className="catalogList" aria-label="옵션 목록">
            <div className="catalogListHead"><strong>자동 반영 옵션</strong>{canCreateOption && <button type="button" className="smallIconButton" aria-label="새 옵션" onClick={() => { const next = newOption(); setSelectedOptionId(next.id); setOptionDraft(next); }}><Plus size={16} /></button>}</div>
            <div className="catalogItems">
            {optionList.map((item) => (
              <button type="button" className="catalogListItem" data-active={selectedOption.id === item.id} key={item.id} onClick={() => selectOption(item.id)}>
                <div><strong>{item.name}</strong><span>+{formatWon(item.priceDelta)} · +{item.durationDaysDelta}일 · 수정 +{item.revisionLimitDelta}회</span></div><ChevronRight size={16} />
              </button>
            ))}
            </div>
            {!canCreateOption && (
              <UpgradeNotice
                title={`지금 플랜은 옵션 ${limits.options}개까지예요`}
                description={`기존 옵션을 편집하는 건 언제든 돼요. Basic(${PLAN_PRICES.basic.label})부터 옵션이 무제한이에요.`}
              />
            )}
          </aside>
          <section className="catalogEditor">
            <div className="catalogEditorHead"><div><span>패키지와 조합</span><h2>{optionDraft ? "새 옵션 만들기" : selectedOption.name}</h2></div><Settings2 size={21} /></div>
            <div className="catalogFieldGrid">
              <label><span>옵션 이름</span><input value={selectedOption.name} onChange={(event) => setOptionDraft({ ...selectedOption, name: event.target.value })} /></label>
              <label><span>추가금 (원)</span><input type="number" min="0" value={selectedOption.priceDelta} onChange={(event) => setOptionDraft({ ...selectedOption, priceDelta: numeric(event.target.value) })} /></label>
              <label className="catalogFullField"><span>설명</span><input value={selectedOption.description ?? ""} onChange={(event) => setOptionDraft({ ...selectedOption, description: event.target.value })} /></label>
              <label><span>추가 기간 (일)</span><input type="number" min="0" value={selectedOption.durationDaysDelta} onChange={(event) => setOptionDraft({ ...selectedOption, durationDaysDelta: numeric(event.target.value) })} /></label>
              <label><span>수정 변화 (회)</span><input type="number" min="0" value={selectedOption.revisionLimitDelta} onChange={(event) => setOptionDraft({ ...selectedOption, revisionLimitDelta: numeric(event.target.value) })} /></label>
              <label><span>추가 예상 원가 (원)</span><input type="number" min="0" value={selectedOption.estimatedCostDelta} onChange={(event) => setOptionDraft({ ...selectedOption, estimatedCostDelta: numeric(event.target.value) })} /></label>
            </div>
            <fieldset className="optionTodoEffect"><legend>Todo 변화</legend>
              <div className="effectToggle"><button type="button" data-active={Boolean(optionTask)} onClick={() => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "add", task: optionTask?.task ?? { taskKey: "option-task", title: "옵션 작업", relativeDay: 0, order: 0 } }] })}>Todo 추가</button><button type="button" data-active={Boolean(removeTask)} onClick={() => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "remove", taskKey: removeTask?.taskKey ?? "design" }] })}>Todo 제거</button><button type="button" data-active={!optionTask && !removeTask} onClick={() => setOptionDraft({ ...selectedOption, taskDeltas: [] })}>변화 없음</button></div>
              {optionTask && <div className="optionEffectFields"><label><span>추가 Todo</span><input value={optionTask.task.title} onChange={(event) => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "add", task: { ...optionTask.task, title: event.target.value, taskKey: taskKey(event.target.value, 0) } }] })} /></label><label><span>상대 기한 (일)</span><input type="number" min="0" value={optionTask.task.relativeDay} onChange={(event) => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "add", task: { ...optionTask.task, relativeDay: numeric(event.target.value) } }] })} /></label></div>}
              {removeTask && <label className="optionRemoveField"><span>제거할 Todo 키</span><input value={removeTask.taskKey} onChange={(event) => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "remove", taskKey: event.target.value }] })} /><small>예: `design` — 패키지 Todo 키와 정확히 같아야 제거됩니다.</small></label>}
            </fieldset>
            <div className="catalogActions"><button type="button" className="primaryButton" onClick={saveCurrentOption} data-testid="save-option"><Save size={16} /> 옵션 저장</button>{!optionDraft && <button type="button" className="quietButton" onClick={() => { if (window.confirm("이 옵션을 새 일감 선택 목록에서 보관할까요?")) { archiveOption(selectedOption.id); flashSaved("옵션을 보관했어요."); } }}><Archive size={16} /> 보관</button>}</div>
          </section>
        </div>
      )}
    </div>
  );
}
