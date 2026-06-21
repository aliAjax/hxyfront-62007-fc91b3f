import { useState, useMemo, useRef, ChangeEvent } from "react";
import "./styles.css";

interface SpecimenRecord {
  id: string;
  collectionNo: string;
  speciesName: string;
  collectionLocation: string;
  altitude: string;
  collector: string;
  habitat: string;
  status: "待压制" | "待鉴定" | "已入库" | "需补照";
  storageLocation: string;
  pressStatus: string;
  identifyStatus: string;
  missingFields: string[];
  isDuplicate: boolean;
  selected: boolean;
}

const project = {
  sourceNo: 9,
  id: "hxyfront-62007",
  port: 62007,
  title: "植物标本馆入库",
  domain: "植物标本馆",
  prompt:
    "开发一个植物标本馆压制标本入库前端项目，工作人员可以录入采集号、物种名称、采集地点、海拔、生境描述、采集人、压制状态、鉴定状态和馆藏位置。页面需要有入库队列、鉴定状态筛选、采集地点信息卡、馆藏柜位记录和单份标本详情页。",
  palette: ["#166534", "#0f766e", "#ca8a04"],
  metrics: ["入库队列", "待鉴定", "已上柜", "采集点"],
  filters: ["待压制", "待鉴定", "已入库", "需补照"],
  fields: ["采集号", "物种名称", "采集地点", "海拔", "生境描述", "馆藏位置"],
};

const REQUIRED_FIELDS = [
  { key: "collectionNo", label: "采集号" },
  { key: "speciesName", label: "物种名称" },
  { key: "collectionLocation", label: "采集地点" },
  { key: "altitude", label: "海拔" },
  { key: "collector", label: "采集人" },
  { key: "habitat", label: "生境描述" },
];

const FIELD_KEY_MAP: Record<string, string> = {
  采集号: "collectionNo",
  "采集编号": "collectionNo",
  "编号": "collectionNo",
  collectionNo: "collectionNo",
  物种名称: "speciesName",
  物种: "speciesName",
  学名: "speciesName",
  speciesName: "speciesName",
  采集地点: "collectionLocation",
  地点: "collectionLocation",
  产地: "collectionLocation",
  collectionLocation: "collectionLocation",
  海拔: "altitude",
  海拔高度: "altitude",
  altitude: "altitude",
  采集人: "collector",
  采集者: "collector",
  collector: "collector",
  生境描述: "habitat",
  生境: "habitat",
  habitat: "habitat",
};

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function parseRawText(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const hasTab = firstLine.includes("\t");
  const hasComma = firstLine.split(",").length > 2;
  const separator = hasTab ? "\t" : hasComma ? "," : "\t";

  return lines.map((line) =>
    line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, ""))
  );
}

function detectHeaderRow(rows: string[][]): { hasHeader: boolean; headerMap: Record<number, string> } {
  if (rows.length === 0) return { hasHeader: false, headerMap: {} };

  const firstRow = rows[0];
  const headerMap: Record<number, string> = {};
  let matchedCount = 0;

  firstRow.forEach((cell, idx) => {
    const key = FIELD_KEY_MAP[cell];
    if (key) {
      headerMap[idx] = key;
      matchedCount++;
    }
  });

  return { hasHeader: matchedCount >= 2, headerMap };
}

function rowsToRecords(rows: string[][]): SpecimenRecord[] {
  if (rows.length === 0) return [];

  const { hasHeader, headerMap } = detectHeaderRow(rows);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const defaultMap: Record<number, string> = {
    0: "collectionNo",
    1: "speciesName",
    2: "collectionLocation",
    3: "altitude",
    4: "collector",
    5: "habitat",
  };

  const fieldMap = hasHeader ? headerMap : defaultMap;

  return dataRows.map((row) => {
    const record: Partial<Record<string, string>> = {};
    Object.entries(fieldMap).forEach(([idxStr, key]) => {
      const idx = parseInt(idxStr, 10);
      if (row[idx]) {
        record[key] = row[idx];
      }
    });

    const missingFields: string[] = [];
    REQUIRED_FIELDS.forEach(({ key, label }) => {
      if (!record[key]) {
        missingFields.push(label);
      }
    });

    return {
      id: generateId(),
      collectionNo: record.collectionNo || "",
      speciesName: record.speciesName || "",
      collectionLocation: record.collectionLocation || "",
      altitude: record.altitude || "",
      collector: record.collector || "",
      habitat: record.habitat || "",
      status: "待压制" as const,
      storageLocation: "",
      pressStatus: "待压制",
      identifyStatus: "待鉴定",
      missingFields,
      isDuplicate: false,
      selected: true,
    };
  });
}

function markDuplicates(records: SpecimenRecord[], existingNos: Set<string>): SpecimenRecord[] {
  const seenInBatch = new Map<string, number>();
  records.forEach((r) => {
    if (r.collectionNo) {
      seenInBatch.set(r.collectionNo, (seenInBatch.get(r.collectionNo) || 0) + 1);
    }
  });

  return records.map((r) => ({
    ...r,
    isDuplicate:
      (r.collectionNo && existingNos.has(r.collectionNo)) ||
      (seenInBatch.get(r.collectionNo) || 0) > 1,
  }));
}

const SAMPLE_DATA = `采集号\t物种名称\t采集地点\t海拔\t采集人\t生境描述
HX-240620-001\tAcer palmatum\t浙江天目山国家级自然保护区\t1280m\t李明阳\t山坡阔叶林中，土壤湿润
HX-240620-002\tPteridium aquilinum\t浙江天目山国家级自然保护区\t950m\t李明阳\t林缘阴湿处
HX-240620-003\tRhododendron simsii\t安徽黄山风景区\t1650m\t王建国\t山顶灌丛，多雾
HX-240620-004\t\t浙江天目山\t1100m\t\t林下
HX-240615-01\tQuercus variabilis\t江苏南京紫金山\t320m\t陈晓峰\t向阳山坡`;

function App() {
  const [rawInput, setRawInput] = useState("");
  const [parsedRecords, setParsedRecords] = useState<SpecimenRecord[]>([]);
  const [queue, setQueue] = useState<SpecimenRecord[]>([
    {
      id: "init-1",
      collectionNo: "HX-240615-01",
      speciesName: "槭属待定",
      collectionLocation: "浙江天目山",
      altitude: "1420m",
      collector: "张伟",
      habitat: "常绿阔叶林中",
      status: "待鉴定",
      storageLocation: "",
      pressStatus: "已压制",
      identifyStatus: "待鉴定",
      missingFields: [],
      isDuplicate: false,
      selected: false,
    },
    {
      id: "init-2",
      collectionNo: "HX-240615-08",
      speciesName: "蕨类",
      collectionLocation: "安徽黄山",
      altitude: "890m",
      collector: "刘芳",
      habitat: "阴湿沟谷",
      status: "待压制",
      storageLocation: "",
      pressStatus: "待压制",
      identifyStatus: "待鉴定",
      missingFields: [],
      isDuplicate: false,
      selected: false,
    },
    {
      id: "init-3",
      collectionNo: "HX-240616-03",
      speciesName: "菊科",
      collectionLocation: "江苏南京紫金山",
      altitude: "280m",
      collector: "赵磊",
      habitat: "山坡草地",
      status: "已入库",
      storageLocation: "柜位B-12-04",
      pressStatus: "已压制",
      identifyStatus: "已鉴定",
      missingFields: [],
      isDuplicate: false,
      selected: false,
    },
  ]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingCollectionNos = useMemo(() => {
    return new Set(queue.map((r) => r.collectionNo).filter(Boolean));
  }, [queue]);

  const metrics = useMemo(() => {
    return {
      queue: queue.filter((r) => r.status !== "已入库").length,
      pendingId: queue.filter((r) => r.identifyStatus === "待鉴定").length,
      stored: queue.filter((r) => r.status === "已入库").length,
      locations: new Set(queue.map((r) => r.collectionLocation).filter(Boolean)).size,
    };
  }, [queue]);

  const filteredQueue = useMemo(() => {
    if (!activeFilter) return queue;
    return queue.filter((r) => r.status === activeFilter);
  }, [queue, activeFilter]);

  const previewStats = useMemo(() => {
    const total = parsedRecords.length;
    const withMissing = parsedRecords.filter((r) => r.missingFields.length > 0).length;
    const duplicates = parsedRecords.filter((r) => r.isDuplicate).length;
    const selected = parsedRecords.filter((r) => r.selected).length;
    return { total, withMissing, duplicates, selected };
  }, [parsedRecords]);

  const handlePaste = () => {
    if (!rawInput.trim()) return;
    const rows = parseRawText(rawInput);
    const records = rowsToRecords(rows);
    const marked = markDuplicates(records, existingCollectionNos);
    setParsedRecords(marked);
    setShowPreview(true);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || "";
      setRawInput(text);
      const rows = parseRawText(text);
      const records = rowsToRecords(rows);
      const marked = markDuplicates(records, existingCollectionNos);
      setParsedRecords(marked);
      setShowPreview(true);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleLoadSample = () => {
    setRawInput(SAMPLE_DATA);
    const rows = parseRawText(SAMPLE_DATA);
    const records = rowsToRecords(rows);
    const marked = markDuplicates(records, existingCollectionNos);
    setParsedRecords(marked);
    setShowPreview(true);
  };

  const toggleRecordSelection = (id: string) => {
    setParsedRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleSelectAll = () => {
    const allSelected = parsedRecords.every((r) => r.selected);
    setParsedRecords((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  };

  const handleImportToQueue = () => {
    const toImport = parsedRecords
      .filter((r) => r.selected && !r.isDuplicate)
      .map((r) => ({ ...r, selected: false }));
    if (toImport.length === 0) return;
    setQueue((prev) => [...toImport, ...prev]);
    setParsedRecords([]);
    setRawInput("");
    setShowPreview(false);
  };

  const handleClearPreview = () => {
    setParsedRecords([]);
    setRawInput("");
    setShowPreview(false);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "待压制":
        return "badge-pending";
      case "待鉴定":
        return "badge-review";
      case "已入库":
        return "badge-done";
      case "需补照":
        return "badge-warn";
      default:
        return "";
    }
  };

  return (
    <main className="app">
      <section className="hero">
        <p>
          {project.id} · 源提示词{project.sourceNo} · Port {project.port}
        </p>
        <h1>{project.title}</h1>
        <span>{project.prompt}</span>
      </section>

      <section className="metrics">
        {[
          { label: "入库队列", value: metrics.queue },
          { label: "待鉴定", value: metrics.pendingId },
          { label: "已上柜", value: metrics.stored },
          { label: "采集点", value: metrics.locations },
        ].map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>{project.domain}筛选</h2>
          <div className="chips">
            <button
              className={activeFilter === null ? "chip-active" : ""}
              onClick={() => setActiveFilter(null)}
            >
              全部
            </button>
            {project.filters.map((item) => (
              <button
                key={item}
                className={activeFilter === item ? "chip-active" : ""}
                onClick={() => setActiveFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>批量采集</p>
              <h2>采集批次导入</h2>
            </div>
            <button className="primary" onClick={handleLoadSample}>
              加载示例
            </button>
          </div>

          <div className="import-area">
            <div className="import-tabs">
              <label className="tab-label">
                <span>粘贴采集记录</span>
                <small>支持 Excel / CSV / TSV 格式，直接粘贴表格内容</small>
              </label>
            </div>
            <textarea
              className="paste-textarea"
              placeholder={`在此粘贴采集记录表...\n\n示例格式（Tab或逗号分隔）：\n采集号\t物种名称\t采集地点\t海拔\t采集人\t生境描述\nHX-240620-001\tAcer palmatum\t浙江天目山\t1280m\t李明阳\t山坡阔叶林中`}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              rows={6}
            />
            <div className="import-actions">
              <div className="import-actions-left">
                <button className="primary" onClick={handlePaste} disabled={!rawInput.trim()}>
                  解析并预览
                </button>
                <button onClick={() => fileInputRef.current?.click()}>
                  上传文件
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />
              </div>
              {rawInput && (
                <button className="ghost-btn" onClick={handleClearPreview}>
                  清空
                </button>
              )}
            </div>
          </div>

          {showPreview && parsedRecords.length > 0 && (
            <div className="preview-section">
              <div className="heading">
                <div>
                  <p>识别结果</p>
                  <h2>
                    采集数据预览
                    <span className="preview-summary">
                      共 {previewStats.total} 条，已选 {previewStats.selected} 条
                      {previewStats.withMissing > 0 && (
                        <span className="text-warn">
                          {" "}· {previewStats.withMissing} 条字段缺失
                        </span>
                      )}
                      {previewStats.duplicates > 0 && (
                        <span className="text-danger">
                          {" "}· {previewStats.duplicates} 条采集号重复
                        </span>
                      )}
                    </span>
                  </h2>
                </div>
                <div className="preview-buttons">
                  <button onClick={handleClearPreview}>取消</button>
                  <button
                    className="primary"
                    onClick={handleImportToQueue}
                    disabled={previewStats.selected === 0}
                  >
                    将选中项加入入库队列 ({previewStats.selected})
                  </button>
                </div>
              </div>

              <div className="preview-table-wrapper">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th className="col-check">
                        <input
                          type="checkbox"
                          checked={
                            parsedRecords.length > 0 &&
                            parsedRecords.every((r) => r.selected)
                          }
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>采集号</th>
                      <th>物种名称</th>
                      <th>采集地点</th>
                      <th>海拔</th>
                      <th>采集人</th>
                      <th>生境描述</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRecords.map((r) => (
                      <tr
                        key={r.id}
                        className={`preview-row ${
                          r.isDuplicate ? "row-duplicate" : ""
                        } ${!r.selected ? "row-dim" : ""}`}
                      >
                        <td className="col-check">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={() => toggleRecordSelection(r.id)}
                            disabled={r.isDuplicate}
                          />
                        </td>
                        <td>
                          <div className="cell-content">
                            <span className={r.missingFields.includes("采集号") ? "cell-missing" : ""}>
                              {r.collectionNo || <em>未填写</em>}
                            </span>
                            {r.isDuplicate && (
                              <span className="dup-badge" title="该采集号已存在于入库队列或本次批次中">
                                重复
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={r.missingFields.includes("物种名称") ? "cell-missing" : ""}>
                            {r.speciesName || <em>未填写</em>}
                          </span>
                        </td>
                        <td>
                          <span className={r.missingFields.includes("采集地点") ? "cell-missing" : ""}>
                            {r.collectionLocation || <em>未填写</em>}
                          </span>
                        </td>
                        <td>
                          <span className={r.missingFields.includes("海拔") ? "cell-missing" : ""}>
                            {r.altitude || <em>未填写</em>}
                          </span>
                        </td>
                        <td>
                          <span className={r.missingFields.includes("采集人") ? "cell-missing" : ""}>
                            {r.collector || <em>未填写</em>}
                          </span>
                        </td>
                        <td className="col-habitat">
                          <span className={r.missingFields.includes("生境描述") ? "cell-missing" : ""}>
                            {r.habitat || <em>未填写</em>}
                          </span>
                        </td>
                        <td>
                          {r.missingFields.length > 0 ? (
                            <span className="missing-tip" title={r.missingFields.join("、")}>
                              缺{r.missingFields.length}项
                            </span>
                          ) : r.isDuplicate ? (
                            <span className="dup-text">无法导入</span>
                          ) : (
                            <span className="ok-text">就绪</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="preview-legend">
                <span>
                  <span className="legend-missing"></span> 字段缺失（仍可导入）
                </span>
                <span>
                  <span className="legend-duplicate"></span> 采集号重复（不可导入）
                </span>
              </div>
            </div>
          )}
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>入库队列</p>
            <h2>
              近期工作台
              <span className="preview-summary">
                {activeFilter ? ` · 筛选：${activeFilter}` : ""}
              </span>
            </h2>
          </div>
          <button>导出摘要</button>
        </div>
        <div className="records">
          {filteredQueue.length === 0 ? (
            <div className="empty-state">暂无记录</div>
          ) : (
            filteredQueue.map((record, index) => (
              <article key={record.id || record.collectionNo + index}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div className="record-content">
                  <div className="record-header">
                    <h3>{record.collectionNo || "未编号"}</h3>
                    <span className={`status-badge ${getStatusBadgeClass(record.status)}`}>
                      {record.status}
                    </span>
                  </div>
                  <p>
                    <strong>{record.speciesName || "物种待定"}</strong>
                    {record.collectionLocation && ` · ${record.collectionLocation}`}
                    {record.altitude && ` · 海拔${record.altitude.replace(/m$/, "")}m`}
                    {record.collector && ` · ${record.collector}采集`}
                  </p>
                  {record.habitat && (
                    <p className="record-habitat">生境：{record.habitat}</p>
                  )}
                  {record.storageLocation && (
                    <p className="record-storage">馆藏：{record.storageLocation}</p>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
