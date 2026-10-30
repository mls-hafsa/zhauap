import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError, errorMessage } from "@/lib/api";
import {
  createService,
  deleteService,
  fetchServices,
  qk,
  updateService,
  uploadCsv,
} from "@/lib/queries";
import type { ImportReport, ServiceItem } from "@/lib/types";
import {
  DataState,
  ErrorNote,
  ImportReportView,
  SectionHeader,
  SuccessNote,
  fieldClass,
} from "./common";

function CatalogRow({ item }: { item: ServiceItem }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price);
  const [stock, setStock] = useState(item.stock ?? "");

  const save = useMutation({
    mutationFn: (payload: Partial<{ name: string; price: string; stock: string }>) =>
      updateService(item._id, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.services }),
  });
  const remove = useMutation({
    mutationFn: () => deleteService(item._id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.services }),
  });

  const saveIfChanged = () => {
    const payload: Partial<{ name: string; price: string; stock: string }> = {};
    if (name.trim() !== item.name) payload.name = name;
    if (price.trim() !== item.price) payload.price = price;
    if (stock.trim() !== (item.stock ?? "")) payload.stock = stock;
    if (Object.keys(payload).length > 0) save.mutate(payload);
  };

  return (
    <div className="border-b border-border p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_96px_80px_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_120px_100px_auto]">
        <input
          className={fieldClass}
          value={name}
          aria-label="Название"
          onChange={(e) => setName(e.target.value)}
          onBlur={saveIfChanged}
        />
        <input
          className={fieldClass}
          value={price}
          placeholder="Цена"
          aria-label="Цена"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={saveIfChanged}
        />
        <input
          className={fieldClass}
          value={stock}
          placeholder="—"
          inputMode="numeric"
          aria-label="Остаток"
          onChange={(e) => setStock(e.target.value)}
          onBlur={saveIfChanged}
        />
        <button
          onClick={() => {
            if (confirm(`Удалить «${item.name}» из каталога?`)) remove.mutate();
          }}
          disabled={remove.isPending}
          aria-label={`Удалить ${item.name}`}
          className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {save.isPending && <p className="mt-1 text-xs text-muted-foreground">Сохраняю…</p>}
      <ErrorNote error={save.error ?? remove.error} className="mt-2" />
    </div>
  );
}

export function CatalogPage() {
  const queryClient = useQueryClient();
  const services = useQuery({ queryKey: qk.services, queryFn: fetchServices });
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState<unknown>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const create = useMutation({
    mutationFn: createService,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.services });
      setName("");
      setPrice("");
      setStock("");
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
      const result = await uploadCsv("/api/products/upload-csv", file);
      setImportMessage(result.message);
      setReport(result.report);
      void queryClient.invalidateQueries({ queryKey: qk.services });
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
        title="Каталог"
        subtitle="Товары и услуги, цены и остатки — бот отвечает клиентам только этими данными"
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
          <div className="grid grid-cols-[minmax(0,1fr)_96px_80px_auto] gap-2 border-b border-border bg-secondary/40 p-3 text-xs font-semibold text-muted-foreground sm:grid-cols-[minmax(0,1fr)_120px_100px_auto]">
            <span>Название</span>
            <span>Цена</span>
            <span>Остаток</span>
            <span className="w-8" />
          </div>
          {services.isPending ? (
            <DataState state="loading" />
          ) : services.isError ? (
            <DataState state="error" error={services.error} retry={() => void services.refetch()} />
          ) : services.data.length === 0 ? (
            <DataState
              state="empty"
              emptyTitle="Каталог пуст"
              emptyText="Добавьте первую позицию справа или импортируйте CSV."
            />
          ) : (
            services.data.map((item) => (
              <CatalogRow
                key={`${item._id}-${item.name}-${item.price}-${item.stock}`}
                item={item}
              />
            ))
          )}
        </div>
        <div className="app-card h-fit p-5">
          <h3 className="font-bold">Новая позиция</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Изменения в таблице слева сохраняются сами при клике вне поля.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ name, price, stock });
            }}
          >
            <input
              className={fieldClass}
              placeholder="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className={fieldClass}
              placeholder="Цена, например 5 000 ₸"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
            <input
              className={fieldClass}
              placeholder="Остаток (пусто — не ведётся)"
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
            <Button type="submit" className="w-full rounded-xl" disabled={create.isPending}>
              {create.isPending ? "Добавляю…" : "Добавить"}
            </Button>
            <ErrorNote error={create.error} />
          </form>
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <p>
              CSV: столбцы <b>name, price, stock</b> или <b>Название, Цена, Остаток</b>. Разделитель
              «,» или «;» — как сохраняет Excel.
            </p>
            <p>Повторный импорт обновляет позиции с тем же названием, а не создаёт дубли.</p>
            <p>Пустой остаток — бот скажет клиенту, что наличие нужно уточнить.</p>
          </div>
          {services.isError && (
            <p className="mt-2 text-xs text-destructive">{errorMessage(services.error)}</p>
          )}
        </div>
      </div>
    </>
  );
}
