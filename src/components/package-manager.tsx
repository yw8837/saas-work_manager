"use client";

import { Archive, Check, ChevronRight, CircleAlert, ClipboardList, PackagePlus, Plus, Save, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BRIEF_QUESTION_LIMIT, createDomainId, DEFAULT_BRIEF_QUESTIONS, INTAKE_ITEM_LIMIT, marginShortfall, marginWarningText, normalizeBriefQuestions, normalizeIntakeLabels, parseFloorInput, PLAN_PRICES, type OptionTemplate, type PackageTemplate, type TaskTemplate } from "@/lib/domain";
import { markFirstRun } from "@/lib/first-run";
import { INDUSTRY_STARTERS } from "@/lib/store";
import { formatWon, useWorkspace } from "./workspace-provider";
import { UpgradeNotice } from "./upgrade-notice";

type CatalogTab = "package" | "option";

/**
 * 기본 제공(업종 예시 포함) 패키지만 남아 있는지 본다.
 * 예시 금액을 그대로 실제 주문에 쓰지 않도록, 고쳐 쓰라는 안내를 이때만 보여준다.
 */
const seedPackageIds = new Set(Object.values(INDUSTRY_STARTERS).flatMap((starter) => starter.packages.map((item) => item.id)));

function usesOnlySeedPackages(packages: PackageTemplate[]): boolean {
  const live = packages.filter((item) => !item.archivedAt);
  return live.length > 0 && live.every((item) => seedPackageIds.has(item.id));
}

function numeric(value: string) {
  return Math.max(0, Number.parseInt(value || "0", 10) || 0);
}

/** 금액 입력 칸 글: 숫자만 남기고 쉼표를 넣는다(10자리까지). */
function amountDraft(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10);
  return digits ? new Intl.NumberFormat("ko-KR").format(Number(digits)) : "";
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
      <div className="catalogTaskHead"><span>자동으로 만들 할 일</span><span>시작 며칠 뒤</span></div>
      {tasks.map((task, index) => (
        <div className="catalogTaskRow" key={`${task.taskKey}-${index}`}>
          <input
            aria-label={`할 일 ${index + 1} 이름`}
            value={task.title}
            onChange={(event) => updateTask(index, { title: event.target.value, taskKey: taskKey(event.target.value, index) })}
            placeholder="할 일 이름"
          />
          <label><input aria-label={`할 일 ${index + 1} 시작 며칠 뒤`} type="number" min="0" value={task.relativeDay} onChange={(event) => updateTask(index, { relativeDay: numeric(event.target.value) })} /><span>일</span></label>
          <button type="button" className="smallIconButton" aria-label={`할 일 ${index + 1} 삭제`} onClick={() => onChange(tasks.filter((_, current) => current !== index))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button
        type="button"
        className="compactButton"
        onClick={() => onChange([...tasks, { taskKey: `task-${tasks.length + 1}`, title: "새 할 일", relativeDay: 0, order: tasks.length }])}
      ><Plus size={15} /> 할 일 추가</button>
    </div>
  );
}

export function PackageManager() {
  const { packages, options, settings, updateSettings, savePackage, archivePackage, saveOption, archiveOption, canCreatePackage, canCreateOption, limits } = useWorkspace();
  const [tab, setTab] = useState<CatalogTab>("package");
  // 첫 실행 체크리스트의 "패키지 확인" 단계는 이 화면을 연 것으로 끝낸다.
  useEffect(() => { markFirstRun("packagesReviewed"); }, []);
  const [selectedPackageId, setSelectedPackageId] = useState(packages.find((item) => !item.archivedAt)?.id ?? "");
  const [selectedOptionId, setSelectedOptionId] = useState(options.find((item) => !item.archivedAt)?.id ?? "");
  const [packageDraft, setPackageDraft] = useState<PackageTemplate | null>(null);
  const [optionDraft, setOptionDraft] = useState<OptionTemplate | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  // 한 건에 최소 남길 돈(내 기준). 정했을 때만 덜 남는 패키지를 한 줄로 알리고, 저장은 막지 않는다.
  const floor = typeof settings.minMarginPerJob === "number" && settings.minMarginPerJob > 0 ? settings.minMarginPerJob : undefined;
  const [floorOpen, setFloorOpen] = useState(false);
  const [floorDraft, setFloorDraft] = useState("");
  const [floorError, setFloorError] = useState("");

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

  const openFloor = () => {
    setFloorDraft(floor ? amountDraft(String(floor)) : "");
    setFloorError("");
    setFloorOpen(true);
  };

  const saveFloor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = floorDraft.trim();
    const parsed = text ? parseFloorInput(text) : undefined;
    if (text && parsed === undefined) {
      setFloorError("10억 원까지 숫자로 적어 주세요.");
      return;
    }
    // 비우거나 0이면 기준을 지운다(알리지 않음).
    const next = parsed && parsed > 0 ? parsed : undefined;
    if (next !== floor) updateSettings({ minMarginPerJob: next });
    setFloorOpen(false);
  };

  const saveCurrentPackage = () => {
    const intakeItems = normalizeIntakeLabels(selectedPackage.intakeItems);
    const briefQuestions = normalizeBriefQuestions(selectedPackage.briefQuestions);
    const normalized = {
      ...selectedPackage,
      intakeItems: intakeItems.length > 0 ? intakeItems : undefined,
      briefQuestions: briefQuestions.length > 0 ? briefQuestions : undefined,
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
  const editMargin = selectedPackage.price - selectedPackage.estimatedCost;
  const editShortfall = marginShortfall(editMargin, floor);
  const optionTask = selectedOption.taskDeltas.find((delta) => delta.kind === "add");
  const removeTask = selectedOption.taskDeltas.find((delta) => delta.kind === "remove");
  // 옵션이 뺄 수 있는 할 일: 지금 패키지들의 할 일을 같은 할 일끼리 모아 이름으로 보인다(개발용 키는 화면에 안 보임).
  const removableTasks = new Map<string, string[]>();
  for (const item of packageList) {
    for (const task of item.tasks) {
      const names = removableTasks.get(task.taskKey) ?? [];
      if (!names.includes(task.title)) names.push(task.title);
      removableTasks.set(task.taskKey, names);
    }
  }
  const firstRemovableKey = removableTasks.keys().next().value;

  return (
    <div className="pageSurface catalogPage">
      <header className="pageHeader catalogHeader">
        <div>
          <h1>패키지와 옵션</h1>
          <p>여기서 정한 금액·마감·수정·할 일이 새 일감에 자동으로 채워져요.</p>
        </div>
        {savedMessage && <span className="catalogSaved" role="status"><Check size={16} /> {savedMessage}</span>}
      </header>

      <div className="marginFloorRow" data-testid="min-margin-row">
        {floorOpen ? (
          <form className="marginFloorForm" onSubmit={saveFloor}>
            <label htmlFor="min-margin-input">한 건에 최소 남길 돈</label>
            <span className="marginFloorField">
              <input
                id="min-margin-input"
                inputMode="numeric"
                autoComplete="off"
                value={floorDraft}
                onChange={(event) => setFloorDraft(amountDraft(event.target.value))}
                aria-describedby="min-margin-help"
                autoFocus
                data-testid="min-margin-input"
              />
              <span aria-hidden="true">원</span>
            </span>
            <button type="submit" className="compactButton emphasized" data-testid="min-margin-save">저장</button>
            <small id="min-margin-help">비우면 알리지 않아요</small>
            {floorError && <p className="marginFloorError" role="alert">{floorError}</p>}
          </form>
        ) : (
          <p className="marginFloorSummary">
            <span>한 건에 최소 남길 돈{floor ? <> <strong>{formatWon(floor)}</strong></> : null}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className="textButton"
              onClick={openFloor}
              aria-label={floor ? "한 건에 최소 남길 돈 바꾸기" : "한 건에 최소 남길 돈 정하기"}
              data-testid="min-margin-open"
            >
              {floor ? "바꾸기" : "정하기"}
            </button>
          </p>
        )}
      </div>

      {usesOnlySeedPackages(packages) && (
        <p className="seedHint">
          <ClipboardList size={16} />
          <span>
            지금 보이는 건 <strong>예시 패키지</strong>예요. 금액도 예시라서, 내가 파는 조건으로
            금액·기간·수정 횟수를 고치거나 지우고 새로 만들어 쓰세요.
          </span>
        </p>
      )}

      <div className="catalogTabs" role="tablist" aria-label="패키지·옵션">
        <button type="button" role="tab" aria-selected={tab === "package"} data-active={tab === "package"} onClick={() => setTab("package")}><PackagePlus size={17} /> 패키지 {packageList.length}</button>
        <button type="button" role="tab" aria-selected={tab === "option"} data-active={tab === "option"} onClick={() => setTab("option")}><Settings2 size={17} /> 옵션 {optionList.length}</button>
      </div>

      {tab === "package" ? (
        <div className="catalogGrid">
          <aside className="catalogList" aria-label="패키지 목록">
            <div className="catalogListHead"><strong>내 판매 패키지</strong>{canCreatePackage && <button type="button" className="smallIconButton" aria-label="새 패키지" onClick={() => { const next = newPackage(); setSelectedPackageId(next.id); setPackageDraft(next); }}><Plus size={16} /></button>}</div>
            <div className="catalogItems">
            {packageList.map((item) => {
              const itemMargin = item.price - item.estimatedCost;
              const shortfall = marginShortfall(itemMargin, floor);
              return (
                <button type="button" className="catalogListItem" data-active={selectedPackage.id === item.id} key={item.id} onClick={() => selectPackage(item.id)}>
                  <div>
                    <strong>{item.name}</strong><span>{formatWon(item.price)} · {item.durationDays}일 · 수정 {item.revisionLimit}회</span>
                    {/* 고르고 있는 패키지는 편집 칸에서만 알린다(화면마다 한 줄). */}
                    {shortfall !== null && selectedPackage.id !== item.id && (
                      <span className="marginWarning" data-testid={`package-margin-warning-${item.id}`}>
                        <CircleAlert size={13} aria-hidden="true" />
                        <span className="srOnly">주의: </span>
                        {marginWarningText(itemMargin, shortfall)}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={16} />
                </button>
              );
            })}
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
              {/* 0원이면 칸을 비워 흐린 예시 글이 보이게 한다(비운 칸은 0원으로 저장). */}
              <label><span>예상 원가 (원)</span><input type="number" min="0" value={selectedPackage.estimatedCost || ""} placeholder="예: 플랫폼 수수료, 외주비" onChange={(event) => setPackageDraft({ ...selectedPackage, estimatedCost: numeric(event.target.value) })} /></label>
              {editShortfall !== null && (
                <p className="marginWarning catalogFullField" data-testid="package-edit-margin-warning">
                  <CircleAlert size={14} aria-hidden="true" />
                  <span className="srOnly">주의: </span>
                  {marginWarningText(editMargin, editShortfall)}
                </p>
              )}
              {/* 한 줄에 하나. 저장할 때 빈 줄·중복을 빼고 최대 개수까지만 남긴다. 고객 링크에 그대로 보이니 연락처·금액은 적지 않는다. */}
              <label className="catalogFullField">
                <span>시작 전 받을 자료 <small>한 줄에 하나 · 최대 {INTAKE_ITEM_LIMIT}개 · 고객 링크에 보여요</small></span>
                <textarea
                  rows={3}
                  value={(selectedPackage.intakeItems ?? []).join("\n")}
                  onChange={(event) => setPackageDraft({ ...selectedPackage, intakeItems: event.target.value.split("\n") })}
                  placeholder={"예: 로고에 넣을 상호명·영문 표기\n로고 원본 파일(있으면)"}
                  data-testid="package-intake-items"
                />
              </label>
              {/* 고객이 원하는 결과를 처음부터 말로 정리하기 어려워서, 업무 용어 없이 묻는 짧은 질문. 카톡 문구에 들어간다. */}
              <label className="catalogFullField">
                <span>착수 전 질문 <small>한 줄에 하나 · 최대 {BRIEF_QUESTION_LIMIT}개 · 고객에게 보내는 카톡 문구에 들어가요</small></span>
                <textarea
                  rows={3}
                  value={(selectedPackage.briefQuestions ?? []).join("\n")}
                  onChange={(event) => setPackageDraft({ ...selectedPackage, briefQuestions: event.target.value.split("\n") })}
                  placeholder="예: 이 작업으로 가장 하고 싶은 일은 무엇인가요?"
                  data-testid="package-brief-questions"
                />
              </label>
              {(selectedPackage.briefQuestions ?? []).every((question) => !question.trim()) && (
                <button
                  type="button"
                  className="quietButton catalogFullField"
                  onClick={() => setPackageDraft({ ...selectedPackage, briefQuestions: [...DEFAULT_BRIEF_QUESTIONS] })}
                  data-testid="package-brief-defaults"
                >
                  기본 질문 3개 넣기
                </button>
              )}
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
            <fieldset className="optionTodoEffect"><legend>할 일 변화</legend>
              <div className="effectToggle"><button type="button" data-active={Boolean(optionTask)} onClick={() => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "add", task: optionTask?.task ?? { taskKey: "option-task", title: "옵션 작업", relativeDay: 0, order: 0 } }] })}>할 일 추가</button><button type="button" data-active={Boolean(removeTask)} onClick={() => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "remove", taskKey: removeTask?.taskKey ?? firstRemovableKey ?? "design" }] })}>할 일 제거</button><button type="button" data-active={!optionTask && !removeTask} onClick={() => setOptionDraft({ ...selectedOption, taskDeltas: [] })}>변화 없음</button></div>
              {optionTask && <div className="optionEffectFields"><label><span>추가 할 일</span><input value={optionTask.task.title} onChange={(event) => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "add", task: { ...optionTask.task, title: event.target.value, taskKey: taskKey(event.target.value, 0) } }] })} /></label><label><span>시작 며칠 뒤 (일)</span><input type="number" min="0" value={optionTask.task.relativeDay} onChange={(event) => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "add", task: { ...optionTask.task, relativeDay: numeric(event.target.value) } }] })} /></label></div>}
              {removeTask && (
                <label className="optionRemoveField">
                  <span>뺄 할 일</span>
                  <select value={removeTask.taskKey} onChange={(event) => setOptionDraft({ ...selectedOption, taskDeltas: [{ kind: "remove", taskKey: event.target.value }] })}>
                    {!removableTasks.has(removeTask.taskKey) && <option value={removeTask.taskKey}>지금 패키지에 없는 할 일</option>}
                    {[...removableTasks].map(([key, names]) => <option key={key} value={key}>{names.join(" / ")}</option>)}
                  </select>
                </label>
              )}
            </fieldset>
            <div className="catalogActions"><button type="button" className="primaryButton" onClick={saveCurrentOption} data-testid="save-option"><Save size={16} /> 옵션 저장</button>{!optionDraft && <button type="button" className="quietButton" onClick={() => { if (window.confirm("이 옵션을 새 일감 선택 목록에서 보관할까요?")) { archiveOption(selectedOption.id); flashSaved("옵션을 보관했어요."); } }}><Archive size={16} /> 보관</button>}</div>
          </section>
        </div>
      )}
    </div>
  );
}
