import React, { useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  IconCheckOutlineRegular,
  IconEditOutlineRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  classes,
} from "@semicoder/fn-ui";
import {
  colors,
  colorNames,
  shades,
  type Command,
  type Label,
  type LabelDetails,
  type MutationResult,
  type State,
} from "./contract.ts";
import styles from "./style.module.css";
const cx = (...values: (string | false | undefined)[]) => classes(styles, ...values);
const shadeNames = { light: "浅", normal: "", dark: "深" };
export function labelColorName(label: LabelDetails) {
  return label.color ? `${shadeNames[label.shade]}${colorNames[label.color]}` : "无色";
}
export function labelTitle(label: LabelDetails) {
  return label.name || `未命名 · ${labelColorName(label)}`;
}
export function labelClasses(label: LabelDetails) {
  return `kb-label-color kb-${label.color ?? "none"} kb-tone-${label.shade}`;
}
export function LabelBadge({
  label,
  showName = true,
  fallback = false,
}: {
  label: LabelDetails;
  showName?: boolean;
  fallback?: boolean;
}) {
  const text = showName ? label.name || (fallback ? labelTitle(label) : "") : "";
  return (
    <span
      className={cx(`${labelClasses(label)} ${text ? "kb-label-chip" : "kb-label"}`)}
      title={`${labelTitle(label)} · ${labelColorName(label)}`}
      aria-label={labelTitle(label)}
    >
      {text}
    </span>
  );
}
const palette: Pick<LabelDetails, "color" | "shade">[] = [
  ...shades.flatMap((shade) => colors.map((color) => ({ color, shade }))),
  { color: null, shade: "normal" },
];
export type LabelCommand = Extract<
  Command,
  { type: "label.create" | "label.edit" | "label.delete" }
>;
export function LabelsDialog({
  boardId,
  data,
  saving,
  error,
  selected,
  onToggle,
  onCreated,
  mutate,
  close,
}: {
  boardId: string;
  data: State;
  saving: boolean;
  error: string;
  selected?: string[];
  onToggle?: (id: string) => void;
  onCreated?: (id: string) => void;
  mutate: (command: LabelCommand, revision: number) => Promise<MutationResult | null>;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{
    id?: string;
    revision: number;
    initial: LabelDetails;
  } | null>(null);
  const [draft, setDraft] = useState<LabelDetails>({ name: "", color: "green", shade: "normal" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const swatches = useRef<(HTMLButtonElement | null)[]>([]);
  const labels = data.labels.filter((label) => label.boardId === boardId);
  const matches = labels.filter((label) =>
    `${label.name} ${labelColorName(label)}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const dirty = editor && JSON.stringify(editor.initial) !== JSON.stringify(draft);
  const begin = (label?: Label) => {
    const initial: LabelDetails = label
      ? { name: label.name, color: label.color, shade: label.shade }
      : { name: query.trim().slice(0, 80), color: "green", shade: "normal" };
    setDraft(initial);
    setEditor({ id: label?.id, revision: data.revision, initial });
    setConfirmDelete(false);
    setConfirmClose(false);
  };
  const back = () => {
    setEditor(null);
    setConfirmDelete(false);
    setConfirmClose(false);
  };
  const selectedColor = Math.max(
    0,
    palette.findIndex(
      (item) => item.color === draft.color && (draft.color === null || item.shade === draft.shade),
    ),
  );
  const save = async () => {
    if (!editor || (!draft.color && !draft.name.trim())) return;
    const result = await mutate(
      editor.id
        ? { type: "label.edit", id: editor.id, details: draft }
        : { type: "label.create", boardId, details: draft },
      editor.revision,
    );
    if (!result) return;
    if (result.createdId) onCreated?.(result.createdId);
    setQuery("");
    back();
  };
  return (
    <Modal
      open
      title={editor ? (editor.id ? "编辑标签" : "创建标签") : "标签"}
      closeLabel="关闭标签管理"
      className={cx("kb-label-dialog")}
      contentClassName={cx("kb-dialog-content")}
      onClose={() => {
        if (saving) return;
        if (dirty) setConfirmClose(true);
        else close();
      }}
    >
      {confirmClose && (
        <div role="alert" className={cx("kb-error")}>
          标签有未保存的修改。
          <Button type="button" onClick={() => setConfirmClose(false)}>
            继续编辑
          </Button>
          <Button type="button" onClick={close}>
            放弃修改
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className={cx("kb-error")}>
          {error}
        </p>
      )}
      {editor ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className={cx("kb-label-preview")}>
            <LabelBadge label={draft} fallback />
          </div>
          <label className={cx("kb-field")}>
            名称
            <Input
              autoFocus
              aria-label="标签名称"
              maxLength={80}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="例如：重要、设计、待确认"
            />
          </label>
          <fieldset className={cx("kb-field")}>
            <legend>颜色</legend>
            <div
              role="radiogroup"
              aria-label="标签颜色"
              className={cx("kb-label-palette")}
              onKeyDown={(event) => {
                const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 10, ArrowUp: -10 }[
                  event.key
                ];
                if (offset === undefined && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const index =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? palette.length - 1
                      : (selectedColor + offset! + palette.length) % palette.length;
                setDraft({ ...draft, ...palette[index] });
                swatches.current[index]?.focus();
              }}
            >
              {palette.map((item, index) => (
                <Button
                  ref={(node) => {
                    swatches.current[index] = node;
                  }}
                  key={`${item.color}-${item.shade}`}
                  type="button"
                  role="radio"
                  aria-checked={index === selectedColor}
                  aria-label={labelColorName({ ...item, name: "" })}
                  title={labelColorName({ ...item, name: "" })}
                  tabIndex={index === selectedColor ? 0 : -1}
                  className={cx(
                    `kb-color-swatch ${labelClasses({ ...item, name: "" })} ${item.color === null ? "kb-color-none" : ""}`,
                  )}
                  onClick={() => setDraft({ ...draft, ...item })}
                >
                  {item.color === null && "无色"}
                  {index === selectedColor && <IconCheckOutlineRegular aria-hidden="true" />}
                </Button>
              ))}
            </div>
          </fieldset>
          {!draft.color && (
            <p className={cx("kb-muted")}>无色标签需要名称，仅在卡片详情和筛选中显示。</p>
          )}
          <p className={cx("kb-muted")}>名称和颜色会同步到此看板使用该标签的所有卡片。</p>
          <div className={cx("kb-label-editor-actions")}>
            <Button type="button" disabled={saving} onClick={back}>
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving || (!draft.color && !draft.name.trim())}
            >
              {editor.id ? "保存标签" : "创建标签"}
            </Button>
          </div>
          {editor.id && (
            <div className={cx("kb-label-delete")}>
              {confirmDelete ? (
                <div role="alert">
                  <p>
                    删除“{labelTitle(editor.initial)}”？它会从此看板的{" "}
                    {data.cards.filter((card) => card.labels.includes(editor.id!)).length}{" "}
                    张卡片中移除（含归档卡片），无法撤销。
                  </p>
                  <Button type="button" disabled={saving} onClick={() => setConfirmDelete(false)}>
                    保留标签
                  </Button>
                  <Button
                    type="button"
                    className={cx("kb-danger")}
                    disabled={saving}
                    onClick={async () => {
                      if (await mutate({ type: "label.delete", id: editor.id! }, editor.revision))
                        back();
                    }}
                  >
                    确认删除标签
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className={cx("kb-danger")}
                  disabled={saving}
                  onClick={() => setConfirmDelete(true)}
                >
                  删除标签
                </Button>
              )}
            </div>
          )}
        </form>
      ) : (
        <>
          <Input
            autoFocus
            type="search"
            icon={<IconSearchOutlineRegular />}
            aria-label="搜索标签"
            placeholder="搜索标签名称或颜色…"
            maxLength={80}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className={cx("kb-label-list")}>
            {matches.map((label) => (
              <div key={label.id} className={cx("kb-label-row")}>
                {onToggle && (
                  <Checkbox
                    checked={selected?.includes(label.id) ?? false}
                    disabled={saving}
                    onChange={() => onToggle(label.id)}
                    label={labelTitle(label)}
                    className={cx("kb-label-checkbox")}
                  />
                )}
                <Button
                  type="button"
                  className={cx("kb-label-row-main")}
                  disabled={saving}
                  aria-label={
                    onToggle
                      ? `${selected?.includes(label.id) ? "移除" : "添加"}标签 ${labelTitle(label)}`
                      : `编辑标签 ${labelTitle(label)}`
                  }
                  onClick={() => (onToggle ? onToggle(label.id) : begin(label))}
                >
                  <LabelBadge label={label} fallback />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  aria-label={`编辑标签 ${labelTitle(label)}的名称和颜色`}
                  disabled={saving}
                  onClick={() => begin(label)}
                >
                  <IconEditOutlineRegular />
                </Button>
              </div>
            ))}
          </div>
          {!matches.length && (
            <p className={cx("kb-muted")}>
              {query ? "没有匹配的标签，可以创建一个。" : "还没有标签，创建后可在此看板重复使用。"}
            </p>
          )}
          <Button
            type="button"
            className={cx("kb-label-create")}
            disabled={saving || labels.length >= 100}
            onClick={() => begin()}
          >
            <IconPlusOutlineRegular />
            创建新标签
          </Button>
          {labels.length >= 100 && <p className={cx("kb-muted")}>此看板已达到 100 个标签上限。</p>}
          {onToggle && <p className={cx("kb-muted")}>选择后点击“保存卡片”应用到当前卡片。</p>}
          <div className={cx("kb-modal-footer")}>
            <Button type="button" disabled={saving} onClick={close}>
              完成
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
