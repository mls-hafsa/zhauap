import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  createKnowledge,
  deleteKnowledge,
  fetchKnowledge,
  qk,
  updateKnowledge,
  uploadCsv,
} from "@/lib/queries";
import type { ImportReport, KnowledgeItem } from "@/lib/types";
import {
  DataState,
  ErrorNote,
  ImportReportView,
  SectionHeader,
  SuccessNote,
  areaClass,
  fieldClass,
} from "./common";

function KnowledgeRow({ item }: { item: KnowledgeItem }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(item.question);
  const [answer, setAnswer] = useState(item.answer);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.knowledge });

  const save = useMutation({
    mutationFn: () => updateKnowledge(item._id, { question, answer }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteKnowledge(item._id),
    onSuccess: invalidate,
  });

  if (editing) {
    return (
      <form
        className="space-y-2 border-b border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <input
          className={fieldClass}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Вопрос"
        />
        <textarea
          className={areaClass}
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          aria-label="Ответ"
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" className="rounded-xl" disabled={save.isPending}>
            {save.isPending ? "Сохраняю…" : "Сохранить"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-xl"
            onClick={() => {
              setQuestion(item.question);
              setAnswer(item.answer);
              setEditing(false);
            }}
          >
            Отмена
          </Button>
        </div>
        <ErrorNote error={save.error} />
      </form>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border p-4">
      <div className="min-w-0">
        <p className="font-bold">{item.question}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.answer}</p>
        <ErrorNote error={remove.error} className="mt-2" />
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => setEditing(true)}
          aria-label="Редактировать"
          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
        <button
          onClick={() => {
            if (confirm("Удалить этот вопрос из базы знаний?")) remove.mutate();
          }}
          disabled={remove.isPending}
          aria-label="Удалить"
          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function KnowledgePage() {
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: qk.knowledge, queryFn: fetchKnowledge });
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState<unknown>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const create = useMutation({
    mutationFn: createKnowledge,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.knowledge });
      setQuestion("");
      setAnswer("");
    },
  });

  const onCsvChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportMessage("");
    setImportError(null);
    setReport(null);
    try {
      const result = await uploadCsv("/api/knowledge-base/upload-csv", file);
      setImportMessage(result.message);
      setReport(result.report);
      void queryClient.invalidateQueries({ queryKey: qk.knowledge });
    } catch (err) {
      setImportError(err);
      if (err instanceof ApiError && err.data["report"])
        setReport(err.data["report"] as ImportReport);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <SectionHeader
        title="База знаний"
        subtitle="Готовые ответы владельца. Бот использует их в каждом ответе, а точное совпадение вопроса отвечает мгновенно."
        action={
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary",
              importing && "pointer-events-none opacity-60",
            )}
          >
            <Upload className="size-4" />
            {importing ? "Импортирую…" : "Импорт из CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onCsvChange}
              disabled={importing}
            />
          </label>
        }
      />
      <div className="mt-3 space-y-2">
        {importMessage && <SuccessNote>{importMessage}</SuccessNote>}
        <ErrorNote error={importError} />
        {report && <ImportReportView report={report} />}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="app-card overflow-hidden">
          {items.isPending ? (
            <DataState state="loading" />
          ) : items.isError ? (
            <DataState state="error" error={items.error} retry={() => void items.refetch()} />
          ) : items.data.length === 0 ? (
            <DataState
              state="empty"
              emptyTitle="База знаний пуста"
              emptyText="Добавьте ответы на частые вопросы: адрес, доставка, предоплата, возврат."
            />
          ) : (
            items.data.map((item) => (
              <KnowledgeRow key={`${item._id}-${item.question}-${item.answer}`} item={item} />
            ))
          )}
        </div>
        <div className="app-card h-fit p-5">
          <h3 className="font-bold">Новый вопрос</h3>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ question, answer });
            }}
          >
            <input
              className={fieldClass}
              placeholder="Вопрос, например «Есть доставка?»"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
            />
            <textarea
              className={areaClass}
              rows={4}
              placeholder="Ответ"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
            />
            <Button type="submit" className="w-full rounded-xl" disabled={create.isPending}>
              {create.isPending ? "Добавляю…" : "Добавить"}
            </Button>
            <ErrorNote error={create.error} />
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            CSV: столбцы <b>question, answer</b> или <b>Вопрос, Ответ</b>. Одинаковые вопросы
            обновляются.
          </p>
        </div>
      </div>
    </>
  );
}
