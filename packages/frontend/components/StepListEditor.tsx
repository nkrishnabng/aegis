"use client";

import { useState } from "react";
import type { ElementSelector, TestStepInput, TestStepRecord } from "@testingmcp/shared";
import { TEST_STEP_ACTIONS } from "@testingmcp/shared";

const ACTIONS: TestStepInput["action"][] = [...TEST_STEP_ACTIONS];

const STRATEGIES: ElementSelector["strategy"][] = [
  "role",
  "label",
  "placeholder",
  "text",
  "altText",
  "testId",
  "css",
  "xpath",
];

const RESILIENT_STRATEGIES = new Set<ElementSelector["strategy"]>([
  "role",
  "label",
  "placeholder",
  "text",
  "altText",
  "testId",
]);

function selectorQuality(selector?: ElementSelector | null): "resilient" | "brittle" | null {
  if (!selector) return null;
  return RESILIENT_STRATEGIES.has(selector.strategy) ? "resilient" : "brittle";
}

const VALUE_PLACEHOLDERS: Partial<Record<TestStepInput["action"], string>> = {
  assertFormValid: "valid  or  invalid:Please fill out this field",
  assertTableContains: "expected text somewhere in the table/grid",
  assertApiResponse: '{"urlPattern":"/api/login","expectedStatus":200}',
  assertEnabled: "(no value needed)",
  assertDisabled: "(no value needed)",
  assertAccessible: "(no value needed)",
  assertVisualMatch: "optional: diff threshold % override, e.g. 0.5 (default from VISUAL_DIFF_THRESHOLD_PERCENT)",
};

function valuePlaceholderFor(action: TestStepInput["action"]): string {
  return VALUE_PLACEHOLDERS[action] ?? "value (text / url / key / expected text)";
}

let nextNewStepId = 1;

export function blankStep(order: number): TestStepRecord {
  return {
    id: `new-${nextNewStepId++}`,
    testCaseId: "",
    order,
    action: "click",
    selector: { strategy: "role", description: "" },
    value: "",
    description: "New step",
    enabled: true,
  };
}

export interface StepListEditorProps {
  steps: TestStepRecord[];
  onChange: (steps: TestStepRecord[]) => void;
  /** Optional extra content rendered inside a step's row (e.g. the test case
   * editor's "from Flow X v{n}" provenance badge + update-available
   * action) -- keeps this component itself flow-agnostic. */
  renderStepExtra?: (step: TestStepRecord, index: number) => React.ReactNode;
}

/** The step-editing table shared by the test case editor and the flow
 * editor -- action/selector/value fields, add/duplicate/remove, and
 * drag-to-reorder. Lifted out of the test case editor so both pages stay in
 * sync rather than maintaining two copies of the same UI. */
export function StepListEditor({ steps, onChange, renderStepExtra }: StepListEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function updateStep(index: number, patch: Partial<TestStepRecord>) {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function updateSelector(index: number, patch: Partial<ElementSelector>) {
    onChange(
      steps.map((s, i) =>
        i === index
          ? {
              ...s,
              selector: {
                strategy: s.selector?.strategy ?? "role",
                description: s.selector?.description ?? "",
                ...s.selector,
                ...patch,
              },
            }
          : s,
      ),
    );
  }

  function addStep() {
    const nextOrder = steps.length ? Math.max(...steps.map((s) => s.order)) + 1 : 1;
    onChange([...steps, blankStep(nextOrder)]);
  }

  function duplicateStep(index: number) {
    const source = steps[index];
    const nextOrder = Math.max(...steps.map((s) => s.order)) + 1;
    const copy: TestStepRecord = {
      ...source,
      id: `new-${nextNewStepId++}`,
      order: nextOrder,
      description: `${source.description} (copy)`,
    };
    const next = [...steps];
    next.splice(index + 1, 0, copy);
    onChange(next);
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }

  function reorderSteps(fromIndex: number, toIndex: number) {
    const sorted = steps.slice().sort((a, b) => a.order - b.order);
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved);
    onChange(sorted.map((s, i) => ({ ...s, order: i + 1 })));
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex !== null && dragIndex !== targetIndex) reorderSteps(dragIndex, targetIndex);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="btn" onClick={addStep}>
          + Add step
        </button>
      </div>
      <p className="muted" style={{ fontSize: "0.8em" }}>
        Drag the ⠿ handle to reorder steps.
      </p>

      {steps
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((step, index) => {
          const quality = selectorQuality(step.selector);
          return (
            <div
              className={`step-row ${dragOverIndex === index ? "drag-over" : ""}`}
              key={step.id}
              style={{ opacity: step.enabled ? 1 : 0.5 }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(index);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  style={{ cursor: "grab" }}
                  title="Drag to reorder"
                >
                  ⠿
                </span>
                <input
                  type="number"
                  value={step.order}
                  onChange={(e) => updateStep(index, { order: Number(e.target.value) })}
                  style={{ width: 48 }}
                />
              </div>
              <select
                value={step.action}
                onChange={(e) => updateStep(index, { action: e.target.value as TestStepInput["action"] })}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <div>
                <input
                  placeholder="description"
                  value={step.description}
                  onChange={(e) => updateStep(index, { description: e.target.value })}
                  style={{ width: "100%", marginBottom: 4 }}
                />
                <input
                  placeholder={valuePlaceholderFor(step.action)}
                  value={step.value ?? ""}
                  onChange={(e) => updateStep(index, { value: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <select
                    value={step.selector?.strategy ?? "role"}
                    onChange={(e) => updateSelector(index, { strategy: e.target.value as ElementSelector["strategy"] })}
                    style={{ flex: 1 }}
                  >
                    {STRATEGIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {quality && (
                    <span
                      className={`badge ${quality}`}
                      title={
                        quality === "brittle"
                          ? "CSS/XPath selectors are more likely to break on page changes"
                          : "Resilient, accessibility-based selector"
                      }
                    >
                      {quality}
                    </span>
                  )}
                </div>
                <input
                  placeholder="selector value"
                  value={
                    step.selector?.role ??
                    step.selector?.label ??
                    step.selector?.placeholder ??
                    step.selector?.altText ??
                    step.selector?.name ??
                    step.selector?.testId ??
                    step.selector?.css ??
                    step.selector?.xpath ??
                    ""
                  }
                  onChange={(e) => {
                    const strategy = step.selector?.strategy ?? "role";
                    const field =
                      strategy === "role"
                        ? "role"
                        : strategy === "css"
                          ? "css"
                          : strategy === "xpath"
                            ? "xpath"
                            : strategy === "testId"
                              ? "testId"
                              : strategy === "altText"
                                ? "altText"
                                : strategy;
                    updateSelector(index, { [field]: e.target.value } as Partial<ElementSelector>);
                  }}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    onChange={(e) => updateStep(index, { enabled: e.target.checked })}
                  />
                  enabled
                </label>
                <button className="btn" onClick={() => duplicateStep(index)} title="Duplicate">
                  ⧉ Duplicate
                </button>
              </div>
              {renderStepExtra?.(step, index)}
              <button
                className="btn danger"
                onClick={() => removeStep(index)}
                style={{ gridColumn: "1 / -1", justifySelf: "start" }}
              >
                Remove step
              </button>
            </div>
          );
        })}
    </div>
  );
}
