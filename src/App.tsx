import { useState, useMemo, useRef, ChangeEvent } from "react";
import "./styles.css";

interface PhotoRecord {
  id: string;
  timestamp: string;
  operator: string;
  action: "标记需补照" | "补照完成" | "补充备注";
  photoTypes?: string[];
  remark?: string;
}

interface StoragePosition {
  floor: string;
  cabinet: string;
  shelf: string;
  slot: string;
}

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
  storagePosition?: StoragePosition;
  pressStatus: string;
  identifyStatus: string;
  missingFields: string[];
  isDuplicate: boolean;
  selected: boolean;
  missingPhotoTypes: string[];
  photoRecords: PhotoRecord[];
  photoRemark: string;
}

const PHOTO_TYPES = ["标本整体照", "标签特写", "叶片正面", "叶片背面", "花果特写", "生境照"];

interface CabinetInfo {
  code: string;
  name: string;
  shelves: number;
  slotsPerShelf: number;
}

const STORAGE_DATA: Record<string, CabinetInfo[]> = {
  "1F": [
    { code: "A", name: "种子植物柜A", shelves: 6, slotsPerShelf: 12 },
    { code: "B", name: "种子植物柜B", shelves: 6, slotsPerShelf: 12 },
    { code: "C", name: "蕨类植物柜", shelves: 5, slotsPerShelf: 10 },
    { code: "D", name: "苔藓植物柜", shelves: 4, slotsPerShelf: 8 },
  ],
  "2F": [
    { code: "A", name: "木本植物柜A", shelves: 6, slotsPerShelf: 12 },
    { code: "B", name: "木本植物柜B", shelves: 6, slotsPerShelf: 12 },
    { code: "C", name: "草本植物柜C", shelves: 6, slotsPerShelf: 12 },
    { code: "D", name: "草本植物柜D", shelves: 6, slotsPerShelf: 12 },
    { code: "E", name: "模式标本柜", shelves: 5, slotsPerShelf: 8 },
  ],
  "3F": [
    { code: "A", name: "珍贵标本柜A", shelves: 5, slotsPerShelf: 8 },
    { code: "B", name: "珍贵标本柜B", shelves: 5, slotsPerShelf: 8 },
    { code: "C", name: "外调标本柜", shelves: 6, slotsPerShelf: 10 },
    { code: "D", name: "待整理柜", shelves: 6, slotsPerShelf: 12 },
  ],
};

const FLOOR_OPTIONS = [
  { value: "1F", label: "1楼 · 蕨类/苔藓区" },
  { value: "2F", label: "2楼 · 种子植物区" },
  { value: "3F", label: "3楼 · 珍贵/外调区" },
];

const EMPTY_POSITION: StoragePosition = {
  floor: "",
  cabinet: "",
  shelf: "",
  slot: "",
};

function formatStoragePosition(pos: StoragePosition): string {
  if (!pos.floor || !pos.cabinet || !pos.shelf || !pos.slot) {
    return "";
  }
  return `${pos.floor}-${pos.cabinet}${pos.shelf}-${pos.slot}`;
}

function formatStorageDisplay(pos: StoragePosition): string {
  if (!pos.floor || !pos.cabinet || !pos.shelf || !pos.slot) {
    return "";
  }
  const floorLabel = pos.floor.replace("F", "楼");
  const cabinetInfo = STORAGE_DATA[pos.floor]?.find((c) => c.code === pos.cabinet);
  const cabinetName = cabinetInfo ? `（${cabinetInfo.name}）` : "";
  return `${floorLabel} · ${pos.cabinet}柜${cabinetName} · 第${pos.shelf}层 · 格位${pos.slot}`;
}

function parseStorageLocation(location: string): StoragePosition | undefined {
  if (!location) return undefined;
  const match = location.match(/^(\dF)-([A-Z])(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return {
      floor: match[1],
      cabinet: match[2],
      shelf: match[3],
      slot: match[4],
    };
  }
  return undefined;
}

function getCabinetOptions(floor: string) {
  if (!floor) return [];
  return STORAGE_DATA[floor] || [];
}

function getShelfOptions(floor: string, cabinet: string) {
  if (!floor || !cabinet) return [];
  const info = STORAGE_DATA[floor]?.find((c) => c.code === cabinet);
  if (!info) return [];
  return Array.from({ length: info.shelves }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: `第${i + 1}层`,
  }));
}

function getSlotOptions(floor: string, cabinet: string, shelf: string) {
  if (!floor || !cabinet || !shelf) return [];
  const info = STORAGE_DATA[floor]?.find((c) => c.code === cabinet);
  if (!info) return [];
  return Array.from({ length: info.slotsPerShelf }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: `格位 ${String(i + 1).padStart(2, "0")}`,
  }));
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

function formatNow(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
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
      missingPhotoTypes: [],
      photoRecords: [],
      photoRemark: "",
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

  return records.map((r) => {
    const isDuplicate =
      (r.collectionNo && existingNos.has(r.collectionNo)) ||
      (seenInBatch.get(r.collectionNo) || 0) > 1;

    return {
      ...r,
      isDuplicate,
      selected: isDuplicate ? false : r.selected,
    };
  });
}

const SAMPLE_DATA = `采集号\t物种名称\t采集地点\t海拔\t采集人\t生境描述
HX-240620-001\tAcer palmatum\t浙江天目山国家级自然保护区\t1280m\t李明阳\t山坡阔叶林中，土壤湿润
HX-240620-002\tPteridium aquilinum\t浙江天目山国家级自然保护区\t950m\t李明阳\t林缘阴湿处
HX-240620-003\tRhododendron simsii\t安徽黄山风景区\t1650m\t王建国\t山顶灌丛，多雾
HX-240620-004\t\t浙江天目山\t1100m\t\t林下
HX-240615-01\tQuercus variabilis\t江苏南京紫金山\t320m\t陈晓峰\t向阳山坡`;

type ViewType = "main" | "photoTask" | "specimenDetail";

interface ConflictPair {
  oldRecord: SpecimenRecord;
  newRecord: SpecimenRecord;
  resolved: boolean;
  resolution?: "keep" | "overwrite" | "copy";
}

const CONFLICT_FIELDS = [
  { key: "speciesName", label: "物种名称" },
  { key: "collectionLocation", label: "采集地点" },
  { key: "altitude", label: "海拔" },
  { key: "habitat", label: "生境描述" },
  { key: "collector", label: "采集人" },
  { key: "pressStatus", label: "压制状态" },
  { key: "identifyStatus", label: "鉴定状态" },
];

function detectConflicts(
  newRecords: SpecimenRecord[],
  existingRecords: SpecimenRecord[]
): ConflictPair[] {
  const conflicts: ConflictPair[] = [];
  const existingMap = new Map<string, SpecimenRecord>();
  existingRecords.forEach((r) => {
    if (r.collectionNo) {
      existingMap.set(r.collectionNo, r);
    }
  });

  const seenInBatch = new Map<string, SpecimenRecord>();
  newRecords.forEach((r) => {
    if (!r.collectionNo) return;
    const existing = existingMap.get(r.collectionNo);
    if (existing) {
      conflicts.push({
        oldRecord: existing,
        newRecord: r,
        resolved: false,
      });
    }
    const batchPrev = seenInBatch.get(r.collectionNo);
    if (batchPrev) {
      conflicts.push({
        oldRecord: batchPrev,
        newRecord: r,
        resolved: false,
      });
    }
    seenInBatch.set(r.collectionNo, r);
  });

  return conflicts;
}

function resolveConflictCopy(record: SpecimenRecord, suffix: string): SpecimenRecord {
  return {
    ...record,
    id: generateId(),
    collectionNo: `${record.collectionNo}${suffix}`,
    isDuplicate: false,
  };
}

function resolveConflictOverwrite(
  oldRecord: SpecimenRecord,
  newRecord: SpecimenRecord
): SpecimenRecord {
  return {
    ...oldRecord,
    speciesName: newRecord.speciesName || oldRecord.speciesName,
    collectionLocation: newRecord.collectionLocation || oldRecord.collectionLocation,
    altitude: newRecord.altitude || oldRecord.altitude,
    habitat: newRecord.habitat || oldRecord.habitat,
    collector: newRecord.collector || oldRecord.collector,
    pressStatus: newRecord.pressStatus || oldRecord.pressStatus,
    identifyStatus: newRecord.identifyStatus || oldRecord.identifyStatus,
  };
}

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
      missingPhotoTypes: [],
      photoRecords: [],
      photoRemark: "",
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
      missingPhotoTypes: [],
      photoRecords: [],
      photoRemark: "",
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
      storageLocation: "2F-B12-04",
      storagePosition: { floor: "2F", cabinet: "B", shelf: "12", slot: "04" },
      pressStatus: "已压制",
      identifyStatus: "已鉴定",
      missingFields: [],
      isDuplicate: false,
      selected: false,
      missingPhotoTypes: [],
      photoRecords: [],
      photoRemark: "",
    },
    {
      id: "init-photo-1",
      collectionNo: "HX-240610-015",
      speciesName: "Lindera glauca",
      collectionLocation: "浙江天目山国家级自然保护区",
      altitude: "680m",
      collector: "陈志强",
      habitat: "山谷溪边常绿阔叶林",
      status: "需补照",
      storageLocation: "2F-A03-11",
      storagePosition: { floor: "2F", cabinet: "A", shelf: "03", slot: "11" },
      pressStatus: "已压制",
      identifyStatus: "已鉴定",
      missingFields: [],
      isDuplicate: false,
      selected: false,
      missingPhotoTypes: ["标本整体照", "叶片正面", "叶片背面"],
      photoRecords: [
        {
          id: "pr-1",
          timestamp: "2024-06-18 09:30",
          operator: "系统",
          action: "标记需补照",
          photoTypes: ["标本整体照", "叶片正面", "叶片背面"],
          remark: "入库质检发现照片缺失",
        },
      ],
      photoRemark: "",
    },
    {
      id: "init-photo-2",
      collectionNo: "HX-240612-042",
      speciesName: "Rosa multiflora",
      collectionLocation: "安徽黄山风景区",
      altitude: "1120m",
      collector: "王雪婷",
      habitat: "林缘灌丛，阳光充足",
      status: "需补照",
      storageLocation: "1F-C07-02",
      storagePosition: { floor: "1F", cabinet: "C", shelf: "07", slot: "02" },
      pressStatus: "已压制",
      identifyStatus: "已鉴定",
      missingFields: [],
      isDuplicate: false,
      selected: false,
      missingPhotoTypes: ["花果特写", "标签特写"],
      photoRecords: [
        {
          id: "pr-2",
          timestamp: "2024-06-19 14:15",
          operator: "李鉴定员",
          action: "标记需补照",
          photoTypes: ["花果特写", "标签特写"],
          remark: "花果特征不清晰，需重拍",
        },
      ],
      photoRemark: "",
    },
    {
      id: "init-photo-3",
      collectionNo: "HX-240608-078",
      speciesName: "Quercus acutissima",
      collectionLocation: "江苏南京紫金山",
      altitude: "340m",
      collector: "刘海洋",
      habitat: "向阳山坡杂木林",
      status: "需补照",
      storageLocation: "2F-B05-18",
      storagePosition: { floor: "2F", cabinet: "B", shelf: "05", slot: "18" },
      pressStatus: "已压制",
      identifyStatus: "已鉴定",
      missingFields: [],
      isDuplicate: false,
      selected: false,
      missingPhotoTypes: ["生境照", "标本整体照"],
      photoRecords: [
        {
          id: "pr-3",
          timestamp: "2024-06-17 11:00",
          operator: "系统",
          action: "标记需补照",
          photoTypes: ["生境照", "标本整体照"],
          remark: "标本拍摄质量不合格，反光严重",
        },
        {
          id: "pr-4",
          timestamp: "2024-06-19 16:45",
          operator: "张摄影",
          action: "补充备注",
          remark: "已安排明天上午补拍，需从柜位取出",
        },
      ],
      photoRemark: "柜位钥匙由王老师保管",
    },
  ]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentView, setCurrentView] = useState<ViewType>("main");
  const [detailSpecimenId, setDetailSpecimenId] = useState<string | null>(null);
  const [photoTaskFilter, setPhotoTaskFilter] = useState<"all" | "pending" | "done">("all");
  const [tempRemarks, setTempRemarks] = useState<Record<string, string>>({});
  const [selectedPhotoTypes, setSelectedPhotoTypes] = useState<Record<string, string[]>>({});

  const [showSingleForm, setShowSingleForm] = useState(false);
  const [singleForm, setSingleForm] = useState({
    collectionNo: "",
    speciesName: "",
    collectionLocation: "",
    altitude: "",
    collector: "",
    habitat: "",
  });
  const [singlePosition, setSinglePosition] = useState<StoragePosition>({ ...EMPTY_POSITION });

  const [previewPositions, setPreviewPositions] = useState<Record<string, StoragePosition>>({});
  const [batchPosition, setBatchPosition] = useState<StoragePosition>({ ...EMPTY_POSITION });

  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [conflictPairs, setConflictPairs] = useState<ConflictPair[]>([]);
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0);
  const [conflictSource, setConflictSource] = useState<"batch" | "single">("batch");
  const [singleConflictRecord, setSingleConflictRecord] = useState<SpecimenRecord | null>(null);
  const [conflictCopySuffix, setConflictCopySuffix] = useState("-副本1");

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

  const photoMetrics = useMemo(() => {
    const photoRecords = queue.filter((r) => r.status === "需补照" || r.photoRecords.length > 0);
    const pending = queue.filter(
      (r) => r.status === "需补照" && r.missingPhotoTypes.length > 0
    ).length;
    const done = queue.filter(
      (r) => r.photoRecords.some((p) => p.action === "补照完成") && r.status !== "需补照"
    ).length;
    return {
      total: photoRecords.length,
      pending,
      done,
      types: new Set(
        photoRecords.flatMap((r) => r.missingPhotoTypes)
      ).size,
    };
  }, [queue]);

  const photoTaskList = useMemo(() => {
    const list = queue.filter(
      (r) => r.status === "需补照" || r.photoRecords.some((p) => p.action === "补照完成")
    );
    if (photoTaskFilter === "pending") {
      return list.filter((r) => r.status === "需补照" && r.missingPhotoTypes.length > 0);
    }
    if (photoTaskFilter === "done") {
      return list.filter((r) => r.photoRecords.some((p) => p.action === "补照完成"));
    }
    return list;
  }, [queue, photoTaskFilter]);

  const detailSpecimen = useMemo(() => {
    if (!detailSpecimenId) return null;
    return queue.find((r) => r.id === detailSpecimenId) || null;
  }, [detailSpecimenId, queue]);

  const handleOpenPhotoTask = () => {
    setCurrentView("photoTask");
  };

  const handleBackToMain = () => {
    setCurrentView("main");
    setDetailSpecimenId(null);
  };

  const handleOpenSpecimenDetail = (id: string) => {
    setDetailSpecimenId(id);
    setCurrentView("specimenDetail");
  };

  const handleBackToPhotoTask = () => {
    setCurrentView("photoTask");
    setDetailSpecimenId(null);
  };

  const handlePhotoTypeToggle = (specimenId: string, photoType: string) => {
    setSelectedPhotoTypes((prev) => {
      const current = prev[specimenId] || [];
      const newSelection = current.includes(photoType)
        ? current.filter((t) => t !== photoType)
        : [...current, photoType];
      return { ...prev, [specimenId]: newSelection };
    });
  };

  const handleRemarkChange = (specimenId: string, value: string) => {
    setTempRemarks((prev) => ({ ...prev, [specimenId]: value }));
  };

  const handleMarkPhotoDone = (specimenId: string) => {
    setQueue((prev) =>
      prev.map((r) => {
        if (r.id !== specimenId) return r;
        const selectedTypes = selectedPhotoTypes[specimenId] || r.missingPhotoTypes;
        const remainingTypes = r.missingPhotoTypes.filter((t) => !selectedTypes.includes(t));
        const newRecord: PhotoRecord = {
          id: generateId(),
          timestamp: formatNow(),
          operator: "当前用户",
          action: "补照完成",
          photoTypes: selectedTypes,
          remark: tempRemarks[specimenId] || undefined,
        };
        return {
          ...r,
          missingPhotoTypes: remainingTypes,
          status: remainingTypes.length === 0 ? "已入库" : "需补照",
          photoRecords: [...r.photoRecords, newRecord],
          photoRemark: tempRemarks[specimenId] || r.photoRemark,
        };
      })
    );
    setSelectedPhotoTypes((prev) => {
      const next = { ...prev };
      delete next[specimenId];
      return next;
    });
    setTempRemarks((prev) => {
      const next = { ...prev };
      delete next[specimenId];
      return next;
    });
  };

  const handleSaveRemark = (specimenId: string) => {
    const remark = tempRemarks[specimenId];
    if (!remark?.trim()) return;
    setQueue((prev) =>
      prev.map((r) => {
        if (r.id !== specimenId) return r;
        const newRecord: PhotoRecord = {
          id: generateId(),
          timestamp: formatNow(),
          operator: "当前用户",
          action: "补充备注",
          remark,
        };
        return {
          ...r,
          photoRecords: [...r.photoRecords, newRecord],
          photoRemark: remark,
        };
      })
    );
    setTempRemarks((prev) => {
      const next = { ...prev };
      delete next[specimenId];
      return next;
    });
  };

  const filteredQueue = useMemo(() => {
    if (!activeFilter) return queue;
    return queue.filter((r) => r.status === activeFilter);
  }, [queue, activeFilter]);

  const previewStats = useMemo(() => {
    const total = parsedRecords.length;
    const withMissing = parsedRecords.filter((r) => r.missingFields.length > 0).length;
    const duplicates = parsedRecords.filter((r) => r.isDuplicate).length;
    const importable = parsedRecords.filter((r) => !r.isDuplicate).length;
    const selected = parsedRecords.filter((r) => r.selected && !r.isDuplicate).length;
    return { total, withMissing, duplicates, importable, selected };
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
    const importableRecords = parsedRecords.filter((r) => !r.isDuplicate);
    const allImportableSelected =
      importableRecords.length > 0 && importableRecords.every((r) => r.selected);

    setParsedRecords((prev) =>
      prev.map((r) => (r.isDuplicate ? { ...r, selected: false } : { ...r, selected: !allImportableSelected }))
    );
  };

  const handleImportToQueue = () => {
    const selectedRecords = parsedRecords.filter((r) => r.selected);
    if (selectedRecords.length === 0) return;

    const conflicts = detectConflicts(selectedRecords, queue);
    if (conflicts.length > 0) {
      setConflictPairs(conflicts);
      setCurrentConflictIndex(0);
      setConflictSource("batch");
      setShowConflictPanel(true);
      return;
    }

    const toImport = selectedRecords
      .filter((r) => !r.isDuplicate)
      .map((r) => {
        const pos = previewPositions[r.id];
        const storageFormatted = pos ? formatStoragePosition(pos) : "";
        return {
          ...r,
          selected: false,
          storageLocation: storageFormatted,
          storagePosition: storageFormatted ? { ...pos } : undefined,
        };
      });
    if (toImport.length === 0) return;
    setQueue((prev) => [...toImport, ...prev]);
    setParsedRecords([]);
    setRawInput("");
    setShowPreview(false);
    setPreviewPositions({});
    setBatchPosition({ ...EMPTY_POSITION });
  };

  const handleClearPreview = () => {
    setParsedRecords([]);
    setRawInput("");
    setShowPreview(false);
    setPreviewPositions({});
    setBatchPosition({ ...EMPTY_POSITION });
  };

  const handlePositionChange = (
    setter: React.Dispatch<React.SetStateAction<StoragePosition>>,
    field: keyof StoragePosition,
    value: string
  ) => {
    setter((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "floor") {
        next.cabinet = "";
        next.shelf = "";
        next.slot = "";
      } else if (field === "cabinet") {
        next.shelf = "";
        next.slot = "";
      } else if (field === "shelf") {
        next.slot = "";
      }
      return next;
    });
  };

  const handlePreviewPositionChange = (
    recordId: string,
    field: keyof StoragePosition,
    value: string
  ) => {
    setPreviewPositions((prev) => {
      const current = prev[recordId] || { ...EMPTY_POSITION };
      const next = { ...current, [field]: value };
      if (field === "floor") {
        next.cabinet = "";
        next.shelf = "";
        next.slot = "";
      } else if (field === "cabinet") {
        next.shelf = "";
        next.slot = "";
      } else if (field === "shelf") {
        next.slot = "";
      }
      return { ...prev, [recordId]: next };
    });
  };

  const applyBatchPosition = () => {
    if (!batchPosition.floor || !batchPosition.cabinet || !batchPosition.shelf || !batchPosition.slot) {
      return;
    }
    const updates: Record<string, StoragePosition> = {};
    parsedRecords.forEach((r) => {
      if (r.selected && !r.isDuplicate) {
        updates[r.id] = { ...batchPosition };
      }
    });
    setPreviewPositions((prev) => ({ ...prev, ...updates }));
  };

  const handleSingleFormChange = (field: string, value: string) => {
    setSingleForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitSingle = () => {
    const missingFields: string[] = [];
    REQUIRED_FIELDS.forEach(({ key, label }) => {
      if (!singleForm[key as keyof typeof singleForm]) {
        missingFields.push(label);
      }
    });

    const storageFormatted = formatStoragePosition(singlePosition);

    const newRecord: SpecimenRecord = {
      id: generateId(),
      collectionNo: singleForm.collectionNo,
      speciesName: singleForm.speciesName,
      collectionLocation: singleForm.collectionLocation,
      altitude: singleForm.altitude,
      collector: singleForm.collector,
      habitat: singleForm.habitat,
      status: "待压制",
      storageLocation: storageFormatted,
      storagePosition: storageFormatted ? { ...singlePosition } : undefined,
      pressStatus: "待压制",
      identifyStatus: "待鉴定",
      missingFields,
      isDuplicate: singleForm.collectionNo
        ? existingCollectionNos.has(singleForm.collectionNo)
        : false,
      selected: false,
      missingPhotoTypes: [],
      photoRecords: [],
      photoRemark: "",
    };

    if (newRecord.isDuplicate && newRecord.collectionNo) {
      const conflicts = detectConflicts([newRecord], queue);
      if (conflicts.length > 0) {
        setConflictPairs(conflicts);
        setCurrentConflictIndex(0);
        setConflictSource("single");
        setSingleConflictRecord(newRecord);
        setShowConflictPanel(true);
        return;
      }
    }

    setQueue((prev) => [newRecord, ...prev]);
    setSingleForm({
      collectionNo: "",
      speciesName: "",
      collectionLocation: "",
      altitude: "",
      collector: "",
      habitat: "",
    });
    setSinglePosition({ ...EMPTY_POSITION });
    setShowSingleForm(false);
  };

  const isSingleFormValid = () => {
    return REQUIRED_FIELDS.some(
      ({ key }) => singleForm[key as keyof typeof singleForm]
    );
  };

  const currentConflict = conflictPairs[currentConflictIndex] || null;

  const handleConflictKeep = () => {
    setConflictPairs((prev) =>
      prev.map((pair, idx) =>
        idx === currentConflictIndex ? { ...pair, resolved: true, resolution: "keep" } : pair
      )
    );
    if (currentConflictIndex < conflictPairs.length - 1) {
      setCurrentConflictIndex((prev) => prev + 1);
    }
  };

  const handleConflictOverwrite = () => {
    setConflictPairs((prev) =>
      prev.map((pair, idx) =>
        idx === currentConflictIndex ? { ...pair, resolved: true, resolution: "overwrite" } : pair
      )
    );
    if (currentConflictIndex < conflictPairs.length - 1) {
      setCurrentConflictIndex((prev) => prev + 1);
    }
  };

  const handleConflictCopy = () => {
    setConflictPairs((prev) =>
      prev.map((pair, idx) =>
        idx === currentConflictIndex ? { ...pair, resolved: true, resolution: "copy" } : pair
      )
    );
    if (currentConflictIndex < conflictPairs.length - 1) {
      setCurrentConflictIndex((prev) => prev + 1);
    }
  };

  const handleCloseConflictPanel = () => {
    setShowConflictPanel(false);
    setConflictPairs([]);
    setCurrentConflictIndex(0);
    setSingleConflictRecord(null);
    setConflictCopySuffix("-副本1");
  };

  const handleApplyConflicts = () => {
    if (conflictSource === "batch") {
      applyBatchConflictResolutions();
    } else {
      applySingleConflictResolution();
    }
    handleCloseConflictPanel();
  };

  const applyBatchConflictResolutions = () => {
    let updatedQueue = [...queue];
    const resolvedNewIds = new Set<string>();
    const newRecordsToAdd: SpecimenRecord[] = [];

    conflictPairs.forEach((pair) => {
      if (!pair.resolved) return;

      const oldId = pair.oldRecord.id;
      const newId = pair.newRecord.id;

      if (pair.resolution === "overwrite") {
        const updated = resolveConflictOverwrite(pair.oldRecord, pair.newRecord);
        const queueIdx = updatedQueue.findIndex((r) => r.id === oldId);
        if (queueIdx !== -1) {
          updatedQueue[queueIdx] = updated;
        }
        resolvedNewIds.add(newId);
      } else if (pair.resolution === "keep") {
        resolvedNewIds.add(newId);
      } else if (pair.resolution === "copy") {
        const copyRecord = resolveConflictCopy(pair.newRecord, conflictCopySuffix);
        const pos = previewPositions[pair.newRecord.id];
        if (pos) {
          copyRecord.storagePosition = { ...pos };
          copyRecord.storageLocation = formatStoragePosition(pos);
        }
        newRecordsToAdd.push(copyRecord);
        resolvedNewIds.add(newId);
      }
    });

    const remainingParsed = parsedRecords.filter((r) => !resolvedNewIds.has(r.id));
    const toImport = remainingParsed
      .filter((r) => r.selected && !r.isDuplicate)
      .map((r) => {
        const pos = previewPositions[r.id];
        const storageFormatted = pos ? formatStoragePosition(pos) : "";
        return {
          ...r,
          selected: false,
          storageLocation: storageFormatted,
          storagePosition: storageFormatted ? { ...pos } : undefined,
        };
      });

    setQueue([...newRecordsToAdd, ...toImport, ...updatedQueue]);
    setParsedRecords([]);
    setRawInput("");
    setShowPreview(false);
    setPreviewPositions({});
    setBatchPosition({ ...EMPTY_POSITION });
  };

  const applySingleConflictResolution = () => {
    if (!singleConflictRecord) return;
    const pair = conflictPairs[0];
    if (!pair || !pair.resolved) return;

    if (pair.resolution === "overwrite") {
      const updated = resolveConflictOverwrite(pair.oldRecord, pair.newRecord);
      setQueue((prev) => prev.map((r) => (r.id === pair.oldRecord.id ? updated : r)));
    } else if (pair.resolution === "copy") {
      const copyRecord = resolveConflictCopy(pair.newRecord, conflictCopySuffix);
      const storageFormatted = formatStoragePosition(singlePosition);
      copyRecord.storageLocation = storageFormatted;
      copyRecord.storagePosition = storageFormatted ? { ...singlePosition } : undefined;
      setQueue((prev) => [copyRecord, ...prev]);
    }

    setSingleForm({
      collectionNo: "",
      speciesName: "",
      collectionLocation: "",
      altitude: "",
      collector: "",
      habitat: "",
    });
    setSinglePosition({ ...EMPTY_POSITION });
    setShowSingleForm(false);
  };

  const handlePrevConflict = () => {
    if (currentConflictIndex > 0) {
      setCurrentConflictIndex((prev) => prev - 1);
    }
  };

  const handleNextConflict = () => {
    if (currentConflictIndex < conflictPairs.length - 1) {
      setCurrentConflictIndex((prev) => prev + 1);
    }
  };

  const allConflictsResolved = conflictPairs.length > 0 && conflictPairs.every((p) => p.resolved);
  const resolvedCount = conflictPairs.filter((p) => p.resolved).length;

  const handleOpenBatchConflicts = () => {
    const duplicateRecords = parsedRecords.filter((r) => r.isDuplicate);
    if (duplicateRecords.length === 0) return;
    const conflicts = detectConflicts(duplicateRecords, queue);
    if (conflicts.length > 0) {
      setConflictPairs(conflicts);
      setCurrentConflictIndex(0);
      setConflictSource("batch");
      setShowConflictPanel(true);
    }
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

  const renderMainView = () => (
    <>
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
            {project.filters.map((item) =>
              item === "需补照" ? (
                <button
                  key={item}
                  className={activeFilter === item ? "chip-active" : ""}
                  onClick={() => handleOpenPhotoTask()}
                >
                  {item} →
                </button>
              ) : (
                <button
                  key={item}
                  className={activeFilter === item ? "chip-active" : ""}
                  onClick={() => setActiveFilter(item)}
                >
                  {item}
                </button>
              )
            )}
          </div>
          <div className="side-task-entry">
            <button className="photo-task-entry" onClick={handleOpenPhotoTask}>
              <span className="photo-task-icon">📷</span>
              <div className="photo-task-text">
                <strong>需补照任务工作台</strong>
                <small>进入独立工作流处理补照</small>
              </div>
              <span className="photo-task-count">{photoMetrics.pending}</span>
            </button>
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

          <div className="single-entry-toggle">
            <button
              className={showSingleForm ? "btn-outline-active" : ""}
              onClick={() => setShowSingleForm(!showSingleForm)}
            >
              {showSingleForm ? "收起单条录入 ▲" : "单条录入标本 ▼"}
            </button>
          </div>

          {showSingleForm && (
            <div className="single-entry-form">
              <div className="heading sub-heading">
                <div>
                  <p>单份录入</p>
                  <h2>新增标本记录</h2>
                </div>
              </div>
              <div className="field-grid">
                <label>
                  <span>采集号 *</span>
                  <input
                    type="text"
                    placeholder="如：HX-240620-001"
                    value={singleForm.collectionNo}
                    onChange={(e) => handleSingleFormChange("collectionNo", e.target.value)}
                  />
                </label>
                <label>
                  <span>物种名称 *</span>
                  <input
                    type="text"
                    placeholder="如：Acer palmatum 或 鸡爪槭"
                    value={singleForm.speciesName}
                    onChange={(e) => handleSingleFormChange("speciesName", e.target.value)}
                  />
                </label>
                <label>
                  <span>采集地点 *</span>
                  <input
                    type="text"
                    placeholder="如：浙江天目山国家级自然保护区"
                    value={singleForm.collectionLocation}
                    onChange={(e) => handleSingleFormChange("collectionLocation", e.target.value)}
                  />
                </label>
                <label>
                  <span>海拔 *</span>
                  <input
                    type="text"
                    placeholder="如：1280m"
                    value={singleForm.altitude}
                    onChange={(e) => handleSingleFormChange("altitude", e.target.value)}
                  />
                </label>
                <label>
                  <span>采集人 *</span>
                  <input
                    type="text"
                    placeholder="如：李明阳"
                    value={singleForm.collector}
                    onChange={(e) => handleSingleFormChange("collector", e.target.value)}
                  />
                </label>
                <label>
                  <span>生境描述 *</span>
                  <input
                    type="text"
                    placeholder="如：山坡阔叶林中，土壤湿润"
                    value={singleForm.habitat}
                    onChange={(e) => handleSingleFormChange("habitat", e.target.value)}
                  />
                </label>
              </div>

              <div className="storage-section">
                <div className="section-title">
                  <span>📦 馆藏柜位选择</span>
                  <small>从下拉列表中依次选择楼层、柜号、层板和格位</small>
                </div>
                <div className="storage-selector">
                  <label className="storage-field">
                    <span>楼层</span>
                    <select
                      value={singlePosition.floor}
                      onChange={(e) =>
                        handlePositionChange(setSinglePosition, "floor", e.target.value)
                      }
                      className="storage-select"
                    >
                      <option value="">-- 请选择楼层 --</option>
                      {FLOOR_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="storage-field">
                    <span>柜号</span>
                    <select
                      value={singlePosition.cabinet}
                      onChange={(e) =>
                        handlePositionChange(setSinglePosition, "cabinet", e.target.value)
                      }
                      className="storage-select"
                      disabled={!singlePosition.floor}
                    >
                      <option value="">-- 先选楼层 --</option>
                      {getCabinetOptions(singlePosition.floor).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}柜 · {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="storage-field">
                    <span>层板</span>
                    <select
                      value={singlePosition.shelf}
                      onChange={(e) =>
                        handlePositionChange(setSinglePosition, "shelf", e.target.value)
                      }
                      className="storage-select"
                      disabled={!singlePosition.cabinet}
                    >
                      <option value="">-- 先选柜号 --</option>
                      {getShelfOptions(singlePosition.floor, singlePosition.cabinet).map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="storage-field">
                    <span>格位</span>
                    <select
                      value={singlePosition.slot}
                      onChange={(e) =>
                        handlePositionChange(setSinglePosition, "slot", e.target.value)
                      }
                      className="storage-select"
                      disabled={!singlePosition.shelf}
                    >
                      <option value="">-- 先选层板 --</option>
                      {getSlotOptions(singlePosition.floor, singlePosition.cabinet, singlePosition.shelf).map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {formatStorageDisplay(singlePosition) && (
                  <div className="storage-result">
                    <span className="storage-code">编号：{formatStoragePosition(singlePosition)}</span>
                    <span className="storage-detail">{formatStorageDisplay(singlePosition)}</span>
                  </div>
                )}
              </div>

              <div className="single-entry-actions">
                <button className="ghost-btn" onClick={() => {
                  setSingleForm({
                    collectionNo: "",
                    speciesName: "",
                    collectionLocation: "",
                    altitude: "",
                    collector: "",
                    habitat: "",
                  });
                  setSinglePosition({ ...EMPTY_POSITION });
                }}>
                  清空表单
                </button>
                <button
                  className="primary"
                  onClick={handleSubmitSingle}
                  disabled={!isSingleFormValid()}
                >
                  加入入库队列
                </button>
              </div>
            </div>
          )}

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
                  {previewStats.duplicates > 0 && (
                    <button
                      className="btn-outline"
                      onClick={handleOpenBatchConflicts}
                    >
                      处理全部冲突 ({previewStats.duplicates})
                    </button>
                  )}
                  <button
                    className="primary"
                    onClick={handleImportToQueue}
                    disabled={previewStats.selected === 0}
                  >
                    将选中项加入入库队列 ({previewStats.selected})
                  </button>
                </div>
              </div>

              <div className="batch-storage-bar">
                <div className="section-title inline-title">
                  <span>📦 批量柜位分配</span>
                  <small>为所有已选记录快速指定馆藏位置，也可逐行单独设置</small>
                </div>
                <div className="storage-selector batch-selector">
                  <label className="storage-field">
                    <span>楼层</span>
                    <select
                      value={batchPosition.floor}
                      onChange={(e) =>
                        handlePositionChange(setBatchPosition, "floor", e.target.value)
                      }
                      className="storage-select"
                    >
                      <option value="">-- 楼层 --</option>
                      {FLOOR_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="storage-field">
                    <span>柜号</span>
                    <select
                      value={batchPosition.cabinet}
                      onChange={(e) =>
                        handlePositionChange(setBatchPosition, "cabinet", e.target.value)
                      }
                      className="storage-select"
                      disabled={!batchPosition.floor}
                    >
                      <option value="">-- 柜号 --</option>
                      {getCabinetOptions(batchPosition.floor).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}柜
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="storage-field">
                    <span>层板</span>
                    <select
                      value={batchPosition.shelf}
                      onChange={(e) =>
                        handlePositionChange(setBatchPosition, "shelf", e.target.value)
                      }
                      className="storage-select"
                      disabled={!batchPosition.cabinet}
                    >
                      <option value="">-- 层板 --</option>
                      {getShelfOptions(batchPosition.floor, batchPosition.cabinet).map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="storage-field">
                    <span>格位</span>
                    <select
                      value={batchPosition.slot}
                      onChange={(e) =>
                        handlePositionChange(setBatchPosition, "slot", e.target.value)
                      }
                      className="storage-select"
                      disabled={!batchPosition.shelf}
                    >
                      <option value="">-- 格位 --</option>
                      {getSlotOptions(batchPosition.floor, batchPosition.cabinet, batchPosition.shelf).map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary btn-small"
                    onClick={applyBatchPosition}
                    disabled={
                      !batchPosition.floor ||
                      !batchPosition.cabinet ||
                      !batchPosition.shelf ||
                      !batchPosition.slot ||
                      previewStats.selected === 0
                    }
                  >
                    应用到选中 ({previewStats.selected})
                  </button>
                </div>
                {formatStorageDisplay(batchPosition) && (
                  <div className="storage-result batch-result">
                    <span className="storage-code">批量柜位：{formatStoragePosition(batchPosition)}</span>
                    <span className="storage-detail">{formatStorageDisplay(batchPosition)}</span>
                  </div>
                )}
              </div>

              <div className="preview-table-wrapper">
                <table className="preview-table preview-table-wide">
                  <thead>
                    <tr>
                      <th className="col-check">
                        <input
                          type="checkbox"
                          checked={
                            previewStats.importable > 0 &&
                            parsedRecords
                              .filter((r) => !r.isDuplicate)
                              .every((r) => r.selected)
                          }
                          disabled={previewStats.importable === 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>采集号</th>
                      <th>物种名称</th>
                      <th>采集地点</th>
                      <th>海拔</th>
                      <th>采集人</th>
                      <th>生境描述</th>
                      <th className="col-storage">馆藏柜位</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRecords.map((r) => {
                      const rowPos = previewPositions[r.id] || { ...EMPTY_POSITION };
                      const rowStorageDisplay = formatStorageDisplay(rowPos);
                      return (
                      <tr
                        key={r.id}
                        className={`preview-row ${
                          r.isDuplicate ? "row-duplicate" : ""
                        } ${!r.selected ? "row-dim" : ""}`}
                      >
                        <td className="col-check">
                          <input
                            type="checkbox"
                            checked={r.selected && !r.isDuplicate}
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
                        <td className="col-storage">
                          {r.isDuplicate ? (
                            <span className="cell-missing"><em>—</em></span>
                          ) : rowStorageDisplay ? (
                            <div className="inline-storage">
                              <span className="inline-storage-code">{formatStoragePosition(rowPos)}</span>
                              <span className="inline-storage-detail">{rowStorageDisplay}</span>
                            </div>
                          ) : (
                            <div className="row-storage-selector">
                              <div className="mini-storage-selects">
                                <select
                                  value={rowPos.floor}
                                  onChange={(e) =>
                                    handlePreviewPositionChange(r.id, "floor", e.target.value)
                                  }
                                  className="mini-select"
                                  disabled={!r.selected}
                                >
                                  <option value="">楼层</option>
                                  {FLOOR_OPTIONS.map((f) => (
                                    <option key={f.value} value={f.value}>{f.value}</option>
                                  ))}
                                </select>
                                <select
                                  value={rowPos.cabinet}
                                  onChange={(e) =>
                                    handlePreviewPositionChange(r.id, "cabinet", e.target.value)
                                  }
                                  className="mini-select"
                                  disabled={!rowPos.floor || !r.selected}
                                >
                                  <option value="">柜</option>
                                  {getCabinetOptions(rowPos.floor).map((c) => (
                                    <option key={c.code} value={c.code}>{c.code}</option>
                                  ))}
                                </select>
                                <select
                                  value={rowPos.shelf}
                                  onChange={(e) =>
                                    handlePreviewPositionChange(r.id, "shelf", e.target.value)
                                  }
                                  className="mini-select"
                                  disabled={!rowPos.cabinet || !r.selected}
                                >
                                  <option value="">层</option>
                                  {getShelfOptions(rowPos.floor, rowPos.cabinet).map((s) => (
                                    <option key={s.value} value={s.value}>{s.value}</option>
                                  ))}
                                </select>
                                <select
                                  value={rowPos.slot}
                                  onChange={(e) =>
                                    handlePreviewPositionChange(r.id, "slot", e.target.value)
                                  }
                                  className="mini-select"
                                  disabled={!rowPos.shelf || !r.selected}
                                >
                                  <option value="">格</option>
                                  {getSlotOptions(rowPos.floor, rowPos.cabinet, rowPos.shelf).map((s) => (
                                    <option key={s.value} value={s.value}>{s.value}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          {r.missingFields.length > 0 ? (
                            <span className="missing-tip" title={r.missingFields.join("、")}>
                              缺{r.missingFields.length}项
                            </span>
                          ) : r.isDuplicate ? (
                            <button
                              className="btn-small resolve-conflict-btn"
                              onClick={() => {
                                const conflicts = detectConflicts([r], queue);
                                if (conflicts.length > 0) {
                                  setConflictPairs(conflicts);
                                  setCurrentConflictIndex(0);
                                  setConflictSource("batch");
                                  setShowConflictPanel(true);
                                }
                              }}
                            >
                              ⚠ 处理冲突
                            </button>
                          ) : (
                            <span className="ok-text">就绪</span>
                          )}
                        </td>
                      </tr>
                    );})}
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
                  {(record.storageLocation || record.storagePosition) && (
                    <p className="record-storage" title={record.storagePosition ? formatStorageDisplay(record.storagePosition) : record.storageLocation}>
                      📦 馆藏：
                      <span className="storage-code-inline">
                        {record.storagePosition ? formatStoragePosition(record.storagePosition) : record.storageLocation}
                      </span>
                      {record.storagePosition && (
                        <span className="storage-detail-inline">
                          {" "}{formatStorageDisplay(record.storagePosition).replace(/^\d楼 · /, "").replace(/ · 格位\d+$/, "")}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );

  const renderPhotoTaskView = () => (
    <>
      <section className="hero hero-photo">
        <p className="breadcrumbs">
          <button className="link-btn" onClick={handleBackToMain}>
            ← 返回主页
          </button>
          <span className="sep">/</span>
          <span>需补照任务工作台</span>
        </p>
        <h1>📷 需补照标本任务</h1>
        <span>集中处理标本照片补拍工作流：查看缺失照片类型 → 前往馆藏位置取件 → 补拍完成后标记并记录备注</span>
      </section>

      <section className="metrics photo-metrics">
        <article className="metric-total">
          <small>补照任务总数</small>
          <strong>{photoMetrics.total}</strong>
        </article>
        <article className="metric-pending">
          <small>待补拍</small>
          <strong>{photoMetrics.pending}</strong>
        </article>
        <article className="metric-done">
          <small>已完成</small>
          <strong>{photoMetrics.done}</strong>
        </article>
        <article className="metric-types">
          <small>涉及照片类型</small>
          <strong>{photoMetrics.types}种</strong>
        </article>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>任务列表</p>
            <h2>
              待补拍标本清单
              <span className="preview-summary">
                · 共 {photoTaskList.length} 条记录
              </span>
            </h2>
          </div>
          <div className="chips">
            <button
              className={photoTaskFilter === "all" ? "chip-active" : ""}
              onClick={() => setPhotoTaskFilter("all")}
            >
              全部
            </button>
            <button
              className={photoTaskFilter === "pending" ? "chip-active" : ""}
              onClick={() => setPhotoTaskFilter("pending")}
            >
              待补拍
            </button>
            <button
              className={photoTaskFilter === "done" ? "chip-active" : ""}
              onClick={() => setPhotoTaskFilter("done")}
            >
              已完成
            </button>
          </div>
        </div>

        <div className="photo-task-list">
          {photoTaskList.length === 0 ? (
            <div className="empty-state">暂无补照任务记录</div>
          ) : (
            photoTaskList.map((record, index) => {
              const isPending =
                record.status === "需补照" && record.missingPhotoTypes.length > 0;
              const currentSelected = selectedPhotoTypes[record.id] || [];
              const currentRemark = tempRemarks[record.id] ?? record.photoRemark;
              return (
                <article
                  key={record.id}
                  className={`photo-task-card ${isPending ? "task-pending" : "task-done"}`}
                >
                  <div className="task-card-header">
                    <div className="task-card-index">
                      <b>{String(index + 1).padStart(2, "0")}</b>
                    </div>
                    <div className="task-card-title">
                      <div className="task-card-no">
                        <h3>{record.collectionNo}</h3>
                        <span
                          className={`status-badge ${
                            isPending ? "badge-warn" : "badge-done"
                          }`}
                        >
                          {isPending ? "待补拍" : "补照完成"}
                        </span>
                      </div>
                      <p className="task-card-species">
                        <strong>{record.speciesName}</strong>
                      </p>
                    </div>
                    <div className="task-card-actions-top">
                      <button
                        className="btn-outline"
                        onClick={() => handleOpenSpecimenDetail(record.id)}
                      >
                        查看详情
                      </button>
                    </div>
                  </div>

                  <div className="task-card-body">
                    <div className="task-info-grid">
                      <div className="task-info-item">
                        <small>馆藏位置</small>
                        <p className="storage-loc" title={record.storagePosition ? formatStorageDisplay(record.storagePosition) : ""}>
                          📦 {record.storagePosition ? formatStoragePosition(record.storagePosition) : (record.storageLocation || "未分配")}
                        </p>
                        {record.storagePosition && (
                          <small className="storage-subdetail">
                            {formatStorageDisplay(record.storagePosition)}
                          </small>
                        )}
                      </div>
                      <div className="task-info-item">
                        <small>采集地点</small>
                        <p>{record.collectionLocation || "—"}</p>
                      </div>
                      <div className="task-info-item">
                        <small>采集人</small>
                        <p>{record.collector || "—"}</p>
                      </div>
                      <div className="task-info-item">
                        <small>海拔</small>
                        <p>{record.altitude || "—"}</p>
                      </div>
                    </div>

                    <div className="photo-types-section">
                      <div className="section-label">
                        <span>缺失照片类型</span>
                        {isPending && (
                          <small>勾选已补拍的类型，默认为全选</small>
                        )}
                      </div>
                      <div className="photo-type-chips">
                        {isPending ? (
                          record.missingPhotoTypes.length > 0 ? (
                            record.missingPhotoTypes.map((pt) => (
                              <label
                                key={pt}
                                className={`photo-type-chip ${
                                  (currentSelected.length === 0
                                    ? true
                                    : currentSelected.includes(pt))
                                    ? "chip-selected"
                                    : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    currentSelected.length === 0
                                      ? true
                                      : currentSelected.includes(pt)
                                  }
                                  onChange={() => handlePhotoTypeToggle(record.id, pt)}
                                />
                                <span>{pt}</span>
                              </label>
                            ))
                          ) : (
                            <span className="no-missing">无缺失</span>
                          )
                        ) : (
                          PHOTO_TYPES.map((pt) => (
                            <span
                              key={pt}
                              className={`photo-type-chip chip-completed ${
                                record.missingPhotoTypes.includes(pt)
                                  ? "still-missing"
                                  : ""
                              }`}
                            >
                              {record.missingPhotoTypes.includes(pt) ? "⚠ " : "✓ "}
                              {pt}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {record.photoRecords.length > 0 && (
                      <div className="last-record">
                        <small>最近处理记录</small>
                        <p>
                          <span className="record-time">
                            {record.photoRecords[record.photoRecords.length - 1].timestamp}
                          </span>
                          <span className="record-op">
                            {record.photoRecords[record.photoRecords.length - 1].operator}
                          </span>
                          <span className="record-action">
                            {record.photoRecords[record.photoRecords.length - 1].action}
                          </span>
                          {record.photoRecords[record.photoRecords.length - 1].remark && (
                            <span className="record-remark">
                              ：{record.photoRecords[record.photoRecords.length - 1].remark}
                            </span>
                          )}
                        </p>
                      </div>
                    )}

                    {isPending && (
                      <div className="task-action-section">
                        <label className="remark-input">
                          <span>补照备注（可选）</span>
                          <textarea
                            placeholder="记录补拍情况，如：照片拍摄条件、需要注意的问题等..."
                            value={currentRemark}
                            onChange={(e) => handleRemarkChange(record.id, e.target.value)}
                            rows={2}
                          />
                        </label>
                        <div className="task-action-buttons">
                          <button
                            className="btn-outline"
                            onClick={() => handleSaveRemark(record.id)}
                            disabled={!tempRemarks[record.id]?.trim()}
                          >
                            仅保存备注
                          </button>
                          <button
                            className="primary btn-mark-done"
                            onClick={() => handleMarkPhotoDone(record.id)}
                          >
                            ✓ 标记已补照
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </>
  );

  const renderDetailView = () => {
    if (!detailSpecimen) {
      return (
        <section className="hero">
          <p className="breadcrumbs">
            <button className="link-btn" onClick={handleBackToPhotoTask}>
              ← 返回需补照任务
            </button>
          </p>
          <h1>标本不存在</h1>
        </section>
      );
    }
    const r = detailSpecimen;
    const isPending = r.status === "需补照" && r.missingPhotoTypes.length > 0;
    return (
      <>
        <section className="hero hero-detail">
          <p className="breadcrumbs">
            <button className="link-btn" onClick={handleBackToPhotoTask}>
              ← 返回需补照任务
            </button>
            <span className="sep">/</span>
            <button className="link-btn" onClick={handleBackToMain}>
              主页
            </button>
            <span className="sep">/</span>
            <span>标本详情</span>
          </p>
          <h1>📋 标本详情页</h1>
          <span>采集号：{r.collectionNo} — 查看完整标本信息与照片补照处理记录</span>
        </section>

        <section className="panel detail-overview">
          <div className="detail-header-row">
            <div>
              <p className="detail-label">采集号</p>
              <h2 className="detail-collection-no">{r.collectionNo}</h2>
              <p className="detail-species">
                <strong>{r.speciesName || "物种待定"}</strong>
              </p>
            </div>
            <span className={`status-badge ${getStatusBadgeClass(r.status)} status-badge-lg`}>
              {r.status}
            </span>
          </div>

          <div className="detail-info-grid">
            <div className="detail-info-cell">
              <small>采集地点</small>
              <p>📍 {r.collectionLocation || "未填写"}</p>
            </div>
            <div className="detail-info-cell">
              <small>海拔</small>
              <p>⛰️ {r.altitude || "未填写"}</p>
            </div>
            <div className="detail-info-cell">
              <small>采集人</small>
              <p>👤 {r.collector || "未填写"}</p>
            </div>
            <div className="detail-info-cell">
              <small>馆藏位置</small>
              <p>📦 {r.storagePosition ? formatStoragePosition(r.storagePosition) : (r.storageLocation || "未分配")}</p>
              {r.storagePosition && (
                <small className="storage-subdetail">
                  {formatStorageDisplay(r.storagePosition)}
                </small>
              )}
            </div>
            <div className="detail-info-cell cell-wide">
              <small>生境描述</small>
              <p>🌿 {r.habitat || "未填写"}</p>
            </div>
            <div className="detail-info-cell">
              <small>压制状态</small>
              <p>{r.pressStatus}</p>
            </div>
            <div className="detail-info-cell">
              <small>鉴定状态</small>
              <p>{r.identifyStatus}</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>照片情况</p>
              <h2>
                照片补照状态
                {isPending ? (
                  <span className="preview-summary text-warn">
                    {" "}· 缺失 {r.missingPhotoTypes.length} 种照片
                  </span>
                ) : (
                  <span className="preview-summary text-success"> · 补照完成</span>
                )}
              </h2>
            </div>
          </div>

          <div className="detail-photo-grid">
            {PHOTO_TYPES.map((pt) => {
              const missing = r.missingPhotoTypes.includes(pt);
              return (
                <div
                  key={pt}
                  className={`photo-slot ${missing ? "slot-missing" : "slot-ok"}`}
                >
                  <div className="slot-icon">{missing ? "📭" : "🖼️"}</div>
                  <div className="slot-label">{pt}</div>
                  <div className="slot-status">
                    {missing ? "待补拍" : "已具备"}
                  </div>
                </div>
              );
            })}
          </div>

          {r.photoRemark && (
            <div className="detail-remark-box">
              <small>当前备注</small>
              <p>📝 {r.photoRemark}</p>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>处理历史</p>
              <h2>补照处理记录</h2>
            </div>
            <span className="preview-summary">共 {r.photoRecords.length} 条记录</span>
          </div>

          <div className="timeline">
            {r.photoRecords.length === 0 ? (
              <div className="empty-state">暂无处理记录</div>
            ) : (
              [...r.photoRecords].reverse().map((pr, idx) => (
                <div key={pr.id} className="timeline-item">
                  <div className="timeline-dot"></div>
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span
                        className={`timeline-action ${
                          pr.action === "补照完成"
                            ? "action-done"
                            : pr.action === "标记需补照"
                            ? "action-mark"
                            : "action-note"
                        }`}
                      >
                        {pr.action}
                      </span>
                      <span className="timeline-operator">{pr.operator}</span>
                      <span className="timeline-time">{pr.timestamp}</span>
                    </div>
                    {pr.photoTypes && pr.photoTypes.length > 0 && (
                      <div className="timeline-photo-types">
                        <small>涉及照片类型：</small>
                        <div className="inline-chips">
                          {pr.photoTypes.map((pt) => (
                            <span key={pt} className="inline-chip">
                              {pt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {pr.remark && (
                      <p className="timeline-remark">📝 {pr.remark}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </>
    );
  };

  const renderConflictPanel = () => {
    if (!showConflictPanel || !currentConflict) return null;

    const { oldRecord, newRecord, resolution, resolved } = currentConflict;

    return (
      <div className="conflict-modal-overlay" onClick={handleCloseConflictPanel}>
        <div className="conflict-modal" onClick={(e) => e.stopPropagation()}>
          <div className="conflict-header">
            <div>
              <p className="conflict-breadcrumb">
                采集号冲突处理 · {currentConflictIndex + 1} / {conflictPairs.length}
              </p>
              <h2>
                ⚠️ 采集号冲突：{newRecord.collectionNo}
                <span className="conflict-progress">
                  已处理 {resolvedCount} / {conflictPairs.length}
                </span>
              </h2>
            </div>
            <button className="conflict-close" onClick={handleCloseConflictPanel}>
              ✕
            </button>
          </div>

          <div className="conflict-nav">
            <button
              className="conflict-nav-btn"
              onClick={handlePrevConflict}
              disabled={currentConflictIndex === 0}
            >
              ← 上一条
            </button>
            <div className="conflict-nav-dots">
              {conflictPairs.map((pair, idx) => (
                <span
                  key={idx}
                  className={`conflict-dot ${
                    idx === currentConflictIndex
                      ? "dot-current"
                      : pair.resolved
                      ? "dot-resolved"
                      : "dot-pending"
                  }`}
                  onClick={() => setCurrentConflictIndex(idx)}
                />
              ))}
            </div>
            <button
              className="conflict-nav-btn"
              onClick={handleNextConflict}
              disabled={currentConflictIndex === conflictPairs.length - 1}
            >
              下一条 →
            </button>
          </div>

          <div className="conflict-compare-grid">
            <div className="conflict-column conflict-old">
              <div className="conflict-col-header">
                <span className="conflict-col-badge old-badge">现有记录</span>
                <span className="conflict-col-no">{oldRecord.collectionNo}</span>
              </div>
              <div className="conflict-fields">
                {CONFLICT_FIELDS.map((field) => {
                  const oldVal = oldRecord[field.key as keyof SpecimenRecord];
                  const newVal = newRecord[field.key as keyof SpecimenRecord];
                  const isDiff = oldVal !== newVal;
                  return (
                    <div
                      key={field.key}
                      className={`conflict-field ${isDiff ? "field-diff-old" : ""}`}
                    >
                      <span className="conflict-field-label">{field.label}</span>
                      <span className="conflict-field-value">
                        {oldVal || <em>未填写</em>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="conflict-arrow-col">
              <div className="conflict-arrow">→</div>
            </div>

            <div className="conflict-column conflict-new">
              <div className="conflict-col-header">
                <span className="conflict-col-badge new-badge">新记录</span>
                <span className="conflict-col-no">{newRecord.collectionNo}</span>
              </div>
              <div className="conflict-fields">
                {CONFLICT_FIELDS.map((field) => {
                  const oldVal = oldRecord[field.key as keyof SpecimenRecord];
                  const newVal = newRecord[field.key as keyof SpecimenRecord];
                  const isDiff = oldVal !== newVal;
                  return (
                    <div
                      key={field.key}
                      className={`conflict-field ${isDiff ? "field-diff-new" : ""}`}
                    >
                      <span className="conflict-field-label">{field.label}</span>
                      <span className="conflict-field-value">
                        {newVal || <em>未填写</em>}
                        {isDiff && <span className="diff-tag">差异</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="conflict-actions">
            <div className="conflict-action-group">
              <button
                className={`conflict-btn btn-keep ${
                  resolved && resolution === "keep" ? "btn-selected" : ""
                }`}
                onClick={handleConflictKeep}
              >
                <span className="btn-icon">📋</span>
                <span className="btn-title">保留旧记录</span>
                <span className="btn-desc">放弃新录入的数据</span>
              </button>

              <button
                className={`conflict-btn btn-overwrite ${
                  resolved && resolution === "overwrite" ? "btn-selected" : ""
                }`}
                onClick={handleConflictOverwrite}
              >
                <span className="btn-icon">🔄</span>
                <span className="btn-title">覆盖字段</span>
                <span className="btn-desc">用新数据更新旧记录</span>
              </button>

              <div
                className={`conflict-btn btn-copy ${
                  resolved && resolution === "copy" ? "btn-selected" : ""
                }`}
              >
                <div className="btn-copy-header" onClick={handleConflictCopy}>
                  <span className="btn-icon">📝</span>
                  <span className="btn-title">另存为副本</span>
                  <span className="btn-desc">保留两者，新记录加后缀</span>
                </div>
                <div className="btn-copy-input">
                  <label>
                    <span>后缀名</span>
                    <input
                      type="text"
                      value={conflictCopySuffix}
                      onChange={(e) => setConflictCopySuffix(e.target.value)}
                      placeholder="-副本1"
                    />
                  </label>
                  <span className="copy-preview">
                    预览：{newRecord.collectionNo}
                    {conflictCopySuffix}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="conflict-footer">
            <button className="ghost-btn" onClick={handleCloseConflictPanel}>
              取消
            </button>
            <button
              className="primary"
              onClick={handleApplyConflicts}
              disabled={!allConflictsResolved}
            >
              应用全部处理结果 ({resolvedCount}/{conflictPairs.length})
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="app">
      {currentView === "main" && renderMainView()}
      {currentView === "photoTask" && renderPhotoTaskView()}
      {currentView === "specimenDetail" && renderDetailView()}
      {renderConflictPanel()}
    </main>
  );
}

export default App;
