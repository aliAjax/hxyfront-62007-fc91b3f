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

type IdentifyTaskStatus = "待分派" | "鉴定中" | "已完成" | "已退回";

interface IdentifyTaskRecord {
  id: string;
  specimenId: string;
  collectionNo: string;
  assignedTo: string | null;
  assignedAt: string | null;
  status: IdentifyTaskStatus;
  rejectReason?: string;
  rejectedAt?: string;
  completedAt?: string;
  completedRemark?: string;
  history: IdentifyTaskHistory[];
}

interface IdentifyTaskHistory {
  id: string;
  timestamp: string;
  operator: string;
  action: "分派任务" | "开始鉴定" | "完成鉴定" | "退回任务" | "重新分派";
  assignedTo?: string;
  remark?: string;
}

interface Identifier {
  id: string;
  name: string;
  expertise: string[];
  activeTaskCount: number;
  avatar?: string;
}

type GroupByType = "none" | "family" | "location" | "collector";
type IdentifyTaskTab = "pending" | "inProgress" | "completed" | "rejected";

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
  identifyTaskId?: string;
  family?: string;
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

interface Draft {
  id: string;
  createdAt: string;
  updatedAt: string;
  collectionNo: string;
  speciesName: string;
  collectionLocation: string;
  altitude: string;
  collector: string;
  habitat: string;
  pressStatus: string;
  identifyStatus: string;
  storagePosition: StoragePosition;
}

const DRAFT_STORAGE_KEY = "hxyfront_specimen_drafts_v1";
const AUTO_SAVE_DEBOUNCE_MS = 800;

const PRESS_STATUS_OPTIONS = ["待压制", "压制中", "已压制"];
const IDENTIFY_STATUS_OPTIONS = ["待鉴定", "鉴定中", "已鉴定"];

const EMPTY_DRAFT_FORM = {
  collectionNo: "",
  speciesName: "",
  collectionLocation: "",
  altitude: "",
  collector: "",
  habitat: "",
  pressStatus: "待压制",
  identifyStatus: "待鉴定",
};

const EMPTY_POSITION: StoragePosition = {
  floor: "",
  cabinet: "",
  shelf: "",
  slot: "",
};

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d) => d && typeof d.id === "string" && typeof d.updatedAt === "string"
    );
  } catch {
    return [];
  }
}

function saveDrafts(drafts: Draft[]): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    /* silently ignore quota errors */
  }
}

function loadLabelPrintQueue(): LabelPrintItem[] {
  try {
    const raw = localStorage.getItem(LABEL_PRINT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d) => d && typeof d.id === "string" && typeof d.collectionNo === "string"
    );
  } catch {
    return [];
  }
}

function saveLabelPrintQueue(items: LabelPrintItem[]): void {
  try {
    localStorage.setItem(LABEL_PRINT_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* silently ignore quota errors */
  }
}

function specimenToLabelItem(s: SpecimenRecord): LabelPrintItem {
  return {
    id: s.id,
    collectionNo: s.collectionNo,
    speciesName: s.speciesName,
    collectionLocation: s.collectionLocation,
    altitude: s.altitude,
    collector: s.collector,
    identifyStatus: s.identifyStatus,
    storageLocation: s.storageLocation,
    storagePosition: s.storagePosition ? { ...s.storagePosition } : undefined,
    family: s.family,
  };
}

function sortLabelItemsByStorage(items: LabelPrintItem[]): LabelPrintItem[] {
  return [...items].sort((a, b) => {
    const posA = a.storagePosition;
    const posB = b.storagePosition;
    if (!posA && !posB) return a.collectionNo.localeCompare(b.collectionNo);
    if (!posA) return 1;
    if (!posB) return -1;
    if (posA.floor !== posB.floor) return posA.floor.localeCompare(posB.floor);
    if (posA.cabinet !== posB.cabinet) return posA.cabinet.localeCompare(posB.cabinet);
    if (posA.shelf !== posB.shelf) return posA.shelf.localeCompare(posB.shelf);
    if (posA.slot !== posB.slot) return posA.slot.localeCompare(posB.slot);
    return a.collectionNo.localeCompare(b.collectionNo);
  });
}

function createEmptyDraft(): Draft {
  return {
    id: generateId(),
    createdAt: formatNow(),
    updatedAt: formatNow(),
    collectionNo: "",
    speciesName: "",
    collectionLocation: "",
    altitude: "",
    collector: "",
    habitat: "",
    pressStatus: "待压制",
    identifyStatus: "待鉴定",
    storagePosition: { ...EMPTY_POSITION },
  };
}

function isDraftMeaningful(d: Draft): boolean {
  return (
    d.collectionNo.trim() !== "" ||
    d.speciesName.trim() !== "" ||
    d.collectionLocation.trim() !== "" ||
    d.altitude.trim() !== "" ||
    d.collector.trim() !== "" ||
    d.habitat.trim() !== "" ||
    d.storagePosition.floor !== "" ||
    d.storagePosition.cabinet !== "" ||
    d.storagePosition.shelf !== "" ||
    d.storagePosition.slot !== "" ||
    d.pressStatus !== "待压制" ||
    d.identifyStatus !== "待鉴定"
  );
}

function getDraftTitle(d: Draft): string {
  if (d.collectionNo.trim()) return d.collectionNo.trim();
  if (d.speciesName.trim()) return d.speciesName.trim();
  if (d.collectionLocation.trim()) return d.collectionLocation.trim();
  return "未命名草稿";
}

function getDraftCompletion(d: Draft): { filled: number; total: number } {
  const fields = [
    d.collectionNo,
    d.speciesName,
    d.collectionLocation,
    d.altitude,
    d.collector,
    d.habitat,
    d.pressStatus !== "待压制" ? "x" : "",
    d.identifyStatus !== "待鉴定" ? "x" : "",
    d.storagePosition.floor && d.storagePosition.cabinet &&
    d.storagePosition.shelf && d.storagePosition.slot
      ? "x"
      : "",
  ];
  return {
    filled: fields.filter((f) => f.trim() !== "").length,
    total: fields.length,
  };
}

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
      family: inferFamily(record.speciesName || ""),
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

const IDENTIFIERS: Identifier[] = [
  { id: "id-1", name: "王教授", expertise: ["槭树科", "壳斗科", "樟科"], activeTaskCount: 2 },
  { id: "id-2", name: "李研究员", expertise: ["杜鹃花科", "山茶科", "蔷薇科"], activeTaskCount: 1 },
  { id: "id-3", name: "张博士", expertise: ["蕨类植物", "苔藓植物"], activeTaskCount: 0 },
  { id: "id-4", name: "陈老师", expertise: ["菊科", "豆科", "唇形科"], activeTaskCount: 3 },
  { id: "id-5", name: "赵专家", expertise: ["禾本科", "莎草科"], activeTaskCount: 1 },
];

const INITIAL_IDENTIFY_TASKS: IdentifyTaskRecord[] = [
  {
    id: "task-1",
    specimenId: "init-photo-1",
    collectionNo: "HX-240610-015",
    assignedTo: "王教授",
    assignedAt: "2024-06-18 10:00",
    status: "鉴定中",
    history: [
      {
        id: "th-1",
        timestamp: "2024-06-18 10:00",
        operator: "系统管理员",
        action: "分派任务",
        assignedTo: "王教授",
        remark: "樟科标本，优先处理",
      },
    ],
  },
  {
    id: "task-2",
    specimenId: "init-photo-2",
    collectionNo: "HX-240612-042",
    assignedTo: "李研究员",
    assignedAt: "2024-06-19 09:30",
    status: "已退回",
    rejectReason: "标本照片不清晰，花果特征无法辨认，需要重新拍照后再鉴定。",
    rejectedAt: "2024-06-20 14:20",
    history: [
      {
        id: "th-2",
        timestamp: "2024-06-19 09:30",
        operator: "系统管理员",
        action: "分派任务",
        assignedTo: "李研究员",
      },
      {
        id: "th-3",
        timestamp: "2024-06-20 14:20",
        operator: "李研究员",
        action: "退回任务",
        remark: "标本照片不清晰，花果特征无法辨认，需要重新拍照后再鉴定。",
      },
    ],
  },
];

const FAMILY_MAP: Record<string, string> = {
  "Acer": "槭树科",
  "槭属": "槭树科",
  "Pteridium": "蕨科",
  "蕨类": "蕨科",
  "Rhododendron": "杜鹃花科",
  "Quercus": "壳斗科",
  "Lindera": "樟科",
  "Rosa": "蔷薇科",
  "菊科": "菊科",
};

function inferFamily(speciesName: string): string | undefined {
  if (!speciesName) return undefined;
  for (const [key, family] of Object.entries(FAMILY_MAP)) {
    if (speciesName.includes(key)) {
      return family;
    }
  }
  return undefined;
}

function getTaskStatusBadgeClass(status: IdentifyTaskStatus): string {
  switch (status) {
    case "待分派":
      return "badge-pending";
    case "鉴定中":
      return "badge-review";
    case "已完成":
      return "badge-done";
    case "已退回":
      return "badge-warn";
    default:
      return "";
  }
}

type ViewType = "main" | "photoTask" | "specimenDetail" | "identifyTask" | "locationList" | "locationDetail" | "labelPrint";

type LabelSortType = "default" | "storage" | "collectionNo";

interface LabelPrintItem {
  id: string;
  collectionNo: string;
  speciesName: string;
  collectionLocation: string;
  altitude: string;
  collector: string;
  identifyStatus: string;
  storageLocation: string;
  storagePosition?: StoragePosition;
  family?: string;
}

const LABEL_PRINT_STORAGE_KEY = "hxyfront_label_print_queue_v1";

interface LocationProfile {
  name: string;
  specimenCount: number;
  altitudeValues: number[];
  altitudeRange: string;
  habitatKeywords: string[];
  specimens: SpecimenRecord[];
  lastBatch: string;
  pendingIdentifyCount: number;
  collectors: string[];
}

const HABITAT_KEYWORDS_DICT = [
  "阔叶林", "针叶林", "混交林", "竹林", "灌丛", "草甸", "草原", "荒漠",
  "湿地", "沼泽", "溪边", "山谷", "山坡", "山顶", "林下", "林缘",
  "阴湿", "向阳", "湿润", "干燥", "多雾", "岩石", "溪边", "沟谷",
  "路边", "田埂", "海边", "河岸", "湖泊", "常绿", "落叶"
];

function parseAltitude(altStr: string): number | null {
  if (!altStr) return null;
  const match = altStr.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

function extractHabitatKeywords(habitat: string): string[] {
  if (!habitat) return [];
  const keywords: string[] = [];
  for (const kw of HABITAT_KEYWORDS_DICT) {
    if (habitat.includes(kw)) {
      keywords.push(kw);
    }
  }
  if (keywords.length === 0 && habitat.trim()) {
    const words = habitat.split(/[，,。.；;、\s]+/).filter(w => w.length >= 2 && w.length <= 6);
    return words.slice(0, 4);
  }
  return keywords.slice(0, 6);
}

function extractBatchNo(collectionNo: string): string {
  if (!collectionNo) return "";
  const match = collectionNo.match(/^(HX-\d{6})/);
  if (match) return match[1];
  const match2 = collectionNo.match(/^([A-Z]+-\d+)/);
  if (match2) return match2[1];
  return collectionNo.slice(0, Math.min(10, collectionNo.length));
}

function aggregateLocations(records: SpecimenRecord[]): LocationProfile[] {
  const locationMap = new Map<string, SpecimenRecord[]>();
  records.forEach((r) => {
    const loc = r.collectionLocation?.trim();
    if (!loc) return;
    if (!locationMap.has(loc)) {
      locationMap.set(loc, []);
    }
    locationMap.get(loc)!.push(r);
  });

  const profiles: LocationProfile[] = [];
  locationMap.forEach((specimens, name) => {
    const altitudeValues = specimens
      .map((s) => parseAltitude(s.altitude))
      .filter((v): v is number => v !== null);

    const minAlt = altitudeValues.length > 0 ? Math.min(...altitudeValues) : null;
    const maxAlt = altitudeValues.length > 0 ? Math.max(...altitudeValues) : null;
    let altitudeRange = "—";
    if (minAlt !== null && maxAlt !== null) {
      altitudeRange = minAlt === maxAlt ? `${minAlt}m` : `${minAlt}m ~ ${maxAlt}m`;
    } else if (minAlt !== null) {
      altitudeRange = `${minAlt}m`;
    }

    const allHabitats = specimens.map((s) => s.habitat).filter(Boolean).join("，");
    const habitatKeywords = extractHabitatKeywords(allHabitats);

    const batchSet = specimens.map((s) => extractBatchNo(s.collectionNo)).filter(Boolean);
    const sortedBatches = [...new Set(batchSet)].sort((a, b) => b.localeCompare(a, "zh"));
    const lastBatch = sortedBatches[0] || "—";

    const pendingIdentifyCount = specimens.filter(
      (s) => s.status === "待鉴定" || s.status === "待压制"
    ).length;

    const collectors = [...new Set(specimens.map((s) => s.collector).filter(Boolean))];

    profiles.push({
      name,
      specimenCount: specimens.length,
      altitudeValues,
      altitudeRange,
      habitatKeywords,
      specimens,
      lastBatch,
      pendingIdentifyCount,
      collectors,
    });
  });

  return profiles.sort((a, b) => b.specimenCount - a.specimenCount);
}

interface ConflictPair {
  oldRecord: SpecimenRecord;
  newRecord: SpecimenRecord;
  resolved: boolean;
  resolution?: "keep" | "overwrite" | "copy";
  copySuffix?: string;
  conflictType: "queue" | "batch";
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
        conflictType: "queue",
      });
    }
    const batchPrev = seenInBatch.get(r.collectionNo);
    if (batchPrev) {
      conflicts.push({
        oldRecord: batchPrev,
        newRecord: r,
        resolved: false,
        conflictType: "batch",
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

function generateUniqueCopySuffix(
  baseNo: string,
  existingNos: Set<string>,
  defaultSuffix: string,
  usedSuffixes?: Set<string>
): string {
  const match = defaultSuffix.match(/^(.*?)(\d+)$/);
  const prefix = match ? match[1] : defaultSuffix;
  let counter = match ? parseInt(match[2], 10) : 1;

  let suffix = defaultSuffix;
  while (existingNos.has(`${baseNo}${suffix}`) || usedSuffixes?.has(suffix)) {
    counter++;
    suffix = `${prefix}${counter}`;
  }
  return suffix;
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
      family: "槭树科",
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
      family: "蕨科",
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
      family: "菊科",
    },
    {
      id: "init-4",
      collectionNo: "HX-240618-05",
      speciesName: "Rhododendron simsii",
      collectionLocation: "安徽黄山风景区",
      altitude: "1550m",
      collector: "王建国",
      habitat: "山顶灌丛，多雾",
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
      family: "杜鹃花科",
    },
    {
      id: "init-5",
      collectionNo: "HX-240618-12",
      speciesName: "Acer palmatum",
      collectionLocation: "浙江天目山",
      altitude: "1200m",
      collector: "李明阳",
      habitat: "山坡阔叶林中",
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
      family: "槭树科",
    },
    {
      id: "init-6",
      collectionNo: "HX-240619-07",
      speciesName: "Pteridium aquilinum",
      collectionLocation: "浙江天目山国家级自然保护区",
      altitude: "950m",
      collector: "李明阳",
      habitat: "林缘阴湿处",
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
      family: "蕨科",
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
      identifyTaskId: "task-1",
      family: "樟科",
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
      identifyTaskId: "task-2",
      family: "蔷薇科",
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
      family: "壳斗科",
    },
  ]);

  const [identifyTasks, setIdentifyTasks] = useState<IdentifyTaskRecord[]>(INITIAL_IDENTIFY_TASKS);
  const [identifyTaskTab, setIdentifyTaskTab] = useState<IdentifyTaskTab>("pending");
  const [groupBy, setGroupBy] = useState<GroupByType>("none");
  const [selectedSpecimens, setSelectedSpecimens] = useState<Set<string>>(new Set());
  const [selectedIdentifier, setSelectedIdentifier] = useState<string>("");
  const [assignRemark, setAssignRemark] = useState<string>("");
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [showCompleteModal, setShowCompleteModal] = useState<string | null>(null);
  const [completeRemark, setCompleteRemark] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentView, setCurrentView] = useState<ViewType>("main");
  const [detailSpecimenId, setDetailSpecimenId] = useState<string | null>(null);
  const [photoTaskFilter, setPhotoTaskFilter] = useState<"all" | "pending" | "done">("all");
  const [tempRemarks, setTempRemarks] = useState<Record<string, string>>({});
  const [selectedPhotoTypes, setSelectedPhotoTypes] = useState<Record<string, string[]>>({});
  const [selectedLocationName, setSelectedLocationName] = useState<string | null>(null);
  const [locationSearch, setLocationSearch] = useState<string>("");
  const [detailFromLocation, setDetailFromLocation] = useState<boolean>(false);

  const [showSingleForm, setShowSingleForm] = useState(false);
  const [singleForm, setSingleForm] = useState({ ...EMPTY_DRAFT_FORM });
  const [singlePosition, setSinglePosition] = useState<StoragePosition>({ ...EMPTY_POSITION });

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftsLoadedRef = useRef(false);

  const [previewPositions, setPreviewPositions] = useState<Record<string, StoragePosition>>({});
  const [batchPosition, setBatchPosition] = useState<StoragePosition>({ ...EMPTY_POSITION });

  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [conflictPairs, setConflictPairs] = useState<ConflictPair[]>([]);
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0);
  const [conflictSource, setConflictSource] = useState<"batch" | "single">("batch");
  const [singleConflictRecord, setSingleConflictRecord] = useState<SpecimenRecord | null>(null);
  const [conflictCopySuffix, setConflictCopySuffix] = useState("-副本1");

  const [labelPrintQueue, setLabelPrintQueue] = useState<LabelPrintItem[]>([]);
  const [labelSortType, setLabelSortType] = useState<LabelSortType>("default");
  const [showLabelPreview, setShowLabelPreview] = useState(false);
  const [selectedLabelSpecimens, setSelectedLabelSpecimens] = useState<Set<string>>(new Set());
  const [selectedQueueItems, setSelectedQueueItems] = useState<Set<string>>(new Set());
  const labelQueueLoadedRef = useRef(false);

  const initializeDrafts = () => {
    if (draftsLoadedRef.current) return;
    draftsLoadedRef.current = true;
    const loaded = loadDrafts();
    const meaningful = loaded.filter(isDraftMeaningful).sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt)
    );
    setDrafts(meaningful);
    saveDrafts(meaningful);

    if (meaningful.length > 0) {
      const latest = meaningful[0];
      setCurrentDraftId(latest.id);
      setSingleForm({
        collectionNo: latest.collectionNo,
        speciesName: latest.speciesName,
        collectionLocation: latest.collectionLocation,
        altitude: latest.altitude,
        collector: latest.collector,
        habitat: latest.habitat,
        pressStatus: latest.pressStatus,
        identifyStatus: latest.identifyStatus,
      });
      setSinglePosition({ ...latest.storagePosition });
      setShowSingleForm(true);
    } else {
      const nd = createEmptyDraft();
      setCurrentDraftId(nd.id);
    }
  };

  const persistDrafts = (updated: Draft[]) => {
    const meaningful = updated.filter(isDraftMeaningful);
    setDrafts(meaningful);
    saveDrafts(meaningful);
  };

  const flushAutoSave = () => {
    if (!currentDraftId) return;
    const draft: Draft = {
      id: currentDraftId,
      createdAt: formatNow(),
      updatedAt: formatNow(),
      collectionNo: singleForm.collectionNo,
      speciesName: singleForm.speciesName,
      collectionLocation: singleForm.collectionLocation,
      altitude: singleForm.altitude,
      collector: singleForm.collector,
      habitat: singleForm.habitat,
      pressStatus: singleForm.pressStatus,
      identifyStatus: singleForm.identifyStatus,
      storagePosition: { ...singlePosition },
    };

    setDrafts((prev) => {
      const existing = prev.find((d) => d.id === currentDraftId);
      let updated: Draft[];
      if (existing) {
        updated = prev.map((d) =>
          d.id === currentDraftId ? { ...draft, createdAt: existing.createdAt } : d
        );
      } else {
        updated = [draft, ...prev];
      }
      const meaningful = updated.filter(isDraftMeaningful).sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt)
      );
      saveDrafts(meaningful);
      return meaningful;
    });

    setDraftSaveStatus("saved");
    setTimeout(() => setDraftSaveStatus("idle"), 1200);
  };

  const scheduleAutoSave = () => {
    if (!showSingleForm) return;
    setDraftSaveStatus("saving");
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      flushAutoSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  };

  const handleNewDraft = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    flushAutoSave();

    setTimeout(() => {
      const nd = createEmptyDraft();
      setCurrentDraftId(nd.id);
      setSingleForm({ ...EMPTY_DRAFT_FORM });
      setSinglePosition({ ...EMPTY_POSITION });
      setDraftSaveStatus("idle");
    }, 50);
  };

  const handleSwitchDraft = (draftId: string) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    flushAutoSave();

    setTimeout(() => {
      const target = drafts.find((d) => d.id === draftId);
      if (!target) return;
      setCurrentDraftId(target.id);
      setSingleForm({
        collectionNo: target.collectionNo,
        speciesName: target.speciesName,
        collectionLocation: target.collectionLocation,
        altitude: target.altitude,
        collector: target.collector,
        habitat: target.habitat,
        pressStatus: target.pressStatus,
        identifyStatus: target.identifyStatus,
      });
      setSinglePosition({ ...target.storagePosition });
      setDraftSaveStatus("idle");
    }, 50);
  };

  const handleDeleteDraft = (draftId: string) => {
    if (autoSaveTimerRef.current && draftId === currentDraftId) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    setDrafts((prev) => {
      const updated = prev.filter((d) => d.id !== draftId);
      saveDrafts(updated);
      return updated;
    });

    if (draftId === currentDraftId) {
      const nd = createEmptyDraft();
      setCurrentDraftId(nd.id);
      setSingleForm({ ...EMPTY_DRAFT_FORM });
      setSinglePosition({ ...EMPTY_POSITION });
      setDraftSaveStatus("idle");
    }
  };

  const clearCurrentDraftAfterSave = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (currentDraftId) {
      setDrafts((prev) => {
        const updated = prev.filter((d) => d.id !== currentDraftId);
        saveDrafts(updated);
        return updated;
      });
    }
    const nd = createEmptyDraft();
    setCurrentDraftId(nd.id);
  };

  const initializeLabelQueue = () => {
    if (labelQueueLoadedRef.current) return;
    labelQueueLoadedRef.current = true;
    const loaded = loadLabelPrintQueue();
    setLabelPrintQueue(loaded);
  };

  const persistLabelQueue = (items: LabelPrintItem[]) => {
    setLabelPrintQueue(items);
    saveLabelPrintQueue(items);
  };

  const storedSpecimens = useMemo(() => {
    return queue.filter((r) => r.status === "已入库");
  }, [queue]);

  const sortedLabelQueue = useMemo(() => {
    if (labelSortType === "storage") {
      return sortLabelItemsByStorage(labelPrintQueue);
    }
    if (labelSortType === "collectionNo") {
      return [...labelPrintQueue].sort((a, b) =>
        a.collectionNo.localeCompare(b.collectionNo));
    }
    return labelPrintQueue;
  }, [labelPrintQueue, labelSortType]);

  const handleOpenLabelPrint = () => {
    setCurrentView("labelPrint");
    setSelectedLabelSpecimens(new Set());
  };

  const handleAddToLabelQueue = (specimenIds: string[]) => {
    const existingIds = new Set(labelPrintQueue.map((item) => item.id));
    const newItems: LabelPrintItem[] = [];
    specimenIds.forEach((id) => {
      if (existingIds.has(id)) return;
      const specimen = queue.find((s) => s.id === id);
      if (specimen) {
        newItems.push(specimenToLabelItem(specimen));
      }
    });
    if (newItems.length > 0) {
      persistLabelQueue([...labelPrintQueue, ...newItems]);
    }
    setSelectedLabelSpecimens(new Set());
  };

  const handleRemoveFromLabelQueue = (itemIds: string[]) => {
    const updated = labelPrintQueue.filter((item) => !itemIds.includes(item.id));
    persistLabelQueue(updated);
  };

  const handleClearLabelQueue = () => {
    if (window.confirm("确认清空打印队列？")) {
      persistLabelQueue([]);
      setSelectedQueueItems(new Set());
    }
  };

  const handleToggleQueueItemSelect = (itemId: string) => {
    setSelectedQueueItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAllQueueItems = () => {
    if (selectedQueueItems.size === sortedLabelQueue.length) {
      setSelectedQueueItems(new Set());
    } else {
      setSelectedQueueItems(new Set(sortedLabelQueue.map((item) => item.id)));
    }
  };

  const handleBatchRemoveFromQueue = () => {
    if (selectedQueueItems.size === 0) return;
    if (window.confirm(`确认从队列中移除选中的 ${selectedQueueItems.size} 份标签？`)) {
      handleRemoveFromLabelQueue(Array.from(selectedQueueItems));
      setSelectedQueueItems(new Set());
    }
  };

  const handleSortLabelQueue = (sortType: LabelSortType) => {
    setLabelSortType(sortType);
  };

  const handleToggleLabelSelect = (specimenId: string) => {
    setSelectedLabelSpecimens((prev) => {
      const next = new Set(prev);
      if (next.has(specimenId)) {
        next.delete(specimenId);
      } else {
        next.add(specimenId);
      }
      return next;
    });
  };

  const handleSelectAllLabelSpecimens = () => {
    const list = storedSpecimens;
    if (selectedLabelSpecimens.size === list.length) {
      setSelectedLabelSpecimens(new Set());
    } else {
      setSelectedLabelSpecimens(new Set(list.map((s) => s.id)));
    }
  };

  const handlePrintLabels = () => {
    setShowLabelPreview(true);
  };

  if (!draftsLoadedRef.current) {
    initializeDrafts();
  }

  if (!labelQueueLoadedRef.current) {
    initializeLabelQueue();
  }

  useMemo(() => {
    if (!showSingleForm) return;
    if (!draftsLoadedRef.current) return;

    if (drafts.length > 0) {
      let target: Draft | undefined;
      if (currentDraftId) {
        target = drafts.find((d) => d.id === currentDraftId);
      }
      if (!target) {
        target = drafts[0];
      }
      if (target) {
        const currentFormEmpty =
          !singleForm.collectionNo &&
          !singleForm.speciesName &&
          !singleForm.collectionLocation &&
          !singleForm.altitude &&
          !singleForm.collector &&
          !singleForm.habitat &&
          singleForm.pressStatus === "待压制" &&
          singleForm.identifyStatus === "待鉴定";
        const currentPosEmpty =
          !singlePosition.floor &&
          !singlePosition.cabinet &&
          !singlePosition.shelf &&
          !singlePosition.slot;
        if (currentFormEmpty && currentPosEmpty) {
          setCurrentDraftId(target.id);
          setSingleForm({
            collectionNo: target.collectionNo,
            speciesName: target.speciesName,
            collectionLocation: target.collectionLocation,
            altitude: target.altitude,
            collector: target.collector,
            habitat: target.habitat,
            pressStatus: target.pressStatus,
            identifyStatus: target.identifyStatus,
          });
          setSinglePosition({ ...target.storagePosition });
        }
      }
    } else if (!currentDraftId) {
      const nd = createEmptyDraft();
      setCurrentDraftId(nd.id);
    }
  }, [showSingleForm]);

  useMemo(() => {
    if (!showSingleForm || !draftsLoadedRef.current) return;
    scheduleAutoSave();
  }, [
    singleForm.collectionNo,
    singleForm.speciesName,
    singleForm.collectionLocation,
    singleForm.altitude,
    singleForm.collector,
    singleForm.habitat,
    singleForm.pressStatus,
    singleForm.identifyStatus,
    singlePosition.floor,
    singlePosition.cabinet,
    singlePosition.shelf,
    singlePosition.slot,
  ]);

  const existingCollectionNos = useMemo(() => {
    return new Set(queue.map((r) => r.collectionNo).filter(Boolean));
  }, [queue]);

  const pendingAssignSpecimens = useMemo(() => {
    return queue.filter((r) => r.status === "待鉴定" && !r.identifyTaskId);
  }, [queue]);

  const inProgressTasks = useMemo(() => {
    return identifyTasks.filter((t) => t.status === "鉴定中");
  }, [identifyTasks]);

  const completedTasks = useMemo(() => {
    return identifyTasks.filter((t) => t.status === "已完成");
  }, [identifyTasks]);

  const rejectedTasks = useMemo(() => {
    return identifyTasks.filter((t) => t.status === "已退回");
  }, [identifyTasks]);

  const identifyTaskMetrics = useMemo(() => {
    return {
      pending: pendingAssignSpecimens.length,
      inProgress: inProgressTasks.length,
      completed: completedTasks.length,
      rejected: rejectedTasks.length,
      total: identifyTasks.length,
    };
  }, [pendingAssignSpecimens, inProgressTasks, completedTasks, rejectedTasks, identifyTasks]);

  const metrics = useMemo(() => {
    const totalPendingIdentify = pendingAssignSpecimens.length + inProgressTasks.length + rejectedTasks.length;
    return {
      queue: queue.filter((r) => r.status !== "已入库").length,
      pendingId: totalPendingIdentify,
      stored: queue.filter((r) => r.status === "已入库").length,
      locations: new Set(queue.map((r) => r.collectionLocation).filter(Boolean)).size,
    };
  }, [queue, pendingAssignSpecimens, inProgressTasks, rejectedTasks]);

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

  const locationProfiles = useMemo(() => aggregateLocations(queue), [queue]);

  const filteredLocationProfiles = useMemo(() => {
    if (!locationSearch.trim()) return locationProfiles;
    const keyword = locationSearch.trim().toLowerCase();
    return locationProfiles.filter(
      (lp) =>
        lp.name.toLowerCase().includes(keyword) ||
        lp.habitatKeywords.some((k) => k.toLowerCase().includes(keyword)) ||
        lp.collectors.some((c) => c.toLowerCase().includes(keyword))
    );
  }, [locationProfiles, locationSearch]);

  const selectedLocationProfile = useMemo(() => {
    if (!selectedLocationName) return null;
    return locationProfiles.find((lp) => lp.name === selectedLocationName) || null;
  }, [selectedLocationName, locationProfiles]);

  const handleOpenLocationList = () => {
    setCurrentView("locationList");
    setLocationSearch("");
  };

  const handleOpenLocationDetail = (locationName: string) => {
    setSelectedLocationName(locationName);
    setCurrentView("locationDetail");
  };

  const handleBackToLocationList = () => {
    setCurrentView("locationList");
    setDetailSpecimenId(null);
  };

  const handleBackToLocationDetail = () => {
    setCurrentView("locationDetail");
    setDetailSpecimenId(null);
  };

  const handleOpenSpecimenFromLocation = (specimenId: string) => {
    setDetailSpecimenId(specimenId);
    setDetailFromLocation(true);
    setCurrentView("specimenDetail");
  };

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

  const handleOpenIdentifyTask = () => {
    setCurrentView("identifyTask");
    setIdentifyTaskTab("pending");
    setSelectedSpecimens(new Set());
    setSelectedIdentifier("");
    setAssignRemark("");
  };

  const handleBackToMain = () => {
    setCurrentView("main");
    setDetailSpecimenId(null);
  };

  const handleBackToIdentifyTask = () => {
    setCurrentView("identifyTask");
    setDetailSpecimenId(null);
  };

  const handleToggleSpecimenSelect = (specimenId: string) => {
    setSelectedSpecimens((prev) => {
      const next = new Set(prev);
      if (next.has(specimenId)) {
        next.delete(specimenId);
      } else {
        next.add(specimenId);
      }
      return next;
    });
  };

  const handleSelectAllSpecimens = () => {
    if (selectedSpecimens.size === pendingAssignSpecimens.length) {
      setSelectedSpecimens(new Set());
    } else {
      setSelectedSpecimens(new Set(pendingAssignSpecimens.map((s) => s.id)));
    }
  };

  const handleGroupSelect = (groupKey: string, specimens: SpecimenRecord[]) => {
    const allSelected = specimens.every((s) => selectedSpecimens.has(s.id));
    setSelectedSpecimens((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        specimens.forEach((s) => next.delete(s.id));
      } else {
        specimens.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const getGroupedSpecimens = useMemo(() => {
    const result: { key: string; label: string; specimens: SpecimenRecord[] }[] = [];
    if (groupBy === "none") {
      return [{ key: "all", label: "全部待分派", specimens: pendingAssignSpecimens }];
    }
    const groups = new Map<string, SpecimenRecord[]>();
    pendingAssignSpecimens.forEach((s) => {
      let key = "";
      if (groupBy === "family") {
        key = s.family || "未确定科属";
      } else if (groupBy === "location") {
        key = s.collectionLocation || "未记录采集地点";
      } else if (groupBy === "collector") {
        key = s.collector || "未记录采集人";
      }
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(s);
    });
    groups.forEach((specimens, key) => {
      result.push({ key, label: key, specimens });
    });
    return result.sort((a, b) => a.label.localeCompare(b.label, "zh"));
  }, [pendingAssignSpecimens, groupBy]);

  const handleAssignTasks = () => {
    if (selectedSpecimens.size === 0 || !selectedIdentifier) return;
    const identifier = IDENTIFIERS.find((i) => i.id === selectedIdentifier);
    if (!identifier) return;
    const now = formatNow();
    const newTasks: IdentifyTaskRecord[] = [];
    const specimenIds = Array.from(selectedSpecimens);
    queue.forEach((s) => {
      if (specimenIds.includes(s.id)) {
        const taskId = generateId();
        newTasks.push({
          id: taskId,
          specimenId: s.id,
          collectionNo: s.collectionNo,
          assignedTo: identifier.name,
          assignedAt: now,
          status: "鉴定中",
          history: [
            {
              id: generateId(),
              timestamp: now,
              operator: "当前用户",
              action: "分派任务",
              assignedTo: identifier.name,
              remark: assignRemark || undefined,
            },
          ],
        });
      }
    });
    setIdentifyTasks((prev) => [...prev, ...newTasks]);
    setQueue((prev) =>
      prev.map((s) => {
        const task = newTasks.find((t) => t.specimenId === s.id);
        if (task) {
          return { ...s, identifyTaskId: task.id };
        }
        return s;
      })
    );
    setSelectedSpecimens(new Set());
    setSelectedIdentifier("");
    setAssignRemark("");
  };

  const handleStartIdentify = (taskId: string) => {
    const now = formatNow();
    setIdentifyTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          status: "鉴定中",
          history: [
            ...t.history,
            {
              id: generateId(),
              timestamp: now,
              operator: "当前用户",
              action: "开始鉴定",
            },
          ],
        };
      })
    );
  };

  const handleOpenCompleteModal = (taskId: string) => {
    setShowCompleteModal(taskId);
    setCompleteRemark("");
  };

  const handleCompleteTask = () => {
    if (!showCompleteModal) return;
    const now = formatNow();
    setIdentifyTasks((prev) =>
      prev.map((t) => {
        if (t.id !== showCompleteModal) return t;
        return {
          ...t,
          status: "已完成",
          completedAt: now,
          completedRemark: completeRemark || undefined,
          history: [
            ...t.history,
            {
              id: generateId(),
              timestamp: now,
              operator: "当前用户",
              action: "完成鉴定",
              remark: completeRemark || undefined,
            },
          ],
        };
      })
    );
    const task = identifyTasks.find((t) => t.id === showCompleteModal);
    if (task) {
      setQueue((prev) =>
        prev.map((s) => {
          if (s.id !== task.specimenId) return s;
          return { ...s, identifyStatus: "已鉴定", status: "已入库" as const };
        })
      );
    }
    setShowCompleteModal(null);
    setCompleteRemark("");
  };

  const handleOpenRejectModal = (taskId: string) => {
    setShowRejectModal(taskId);
    setRejectReason("");
  };

  const handleRejectTask = () => {
    if (!showRejectModal || !rejectReason.trim()) return;
    const now = formatNow();
    setIdentifyTasks((prev) =>
      prev.map((t) => {
        if (t.id !== showRejectModal) return t;
        return {
          ...t,
          status: "已退回",
          rejectReason: rejectReason,
          rejectedAt: now,
          history: [
            ...t.history,
            {
              id: generateId(),
              timestamp: now,
              operator: "当前用户",
              action: "退回任务",
              remark: rejectReason,
            },
          ],
        };
      })
    );
    setShowRejectModal(null);
    setRejectReason("");
  };

  const handleReassignTask = (taskId: string) => {
    const task = identifyTasks.find((t) => t.id === taskId);
    if (!task) return;
    setQueue((prev) =>
      prev.map((s) => {
        if (s.id !== task.specimenId) return s;
        return { ...s, identifyTaskId: undefined };
      })
    );
    setIdentifyTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleOpenSpecimenDetail = (id: string) => {
    setDetailSpecimenId(id);
    setDetailFromLocation(false);
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
    const duplicateRecords = parsedRecords.filter((r) => r.isDuplicate);
    if (selectedRecords.length === 0 && duplicateRecords.length === 0) return;

    const conflictCandidates = parsedRecords.filter((r) => r.selected || r.isDuplicate);
    const conflicts = detectConflicts(conflictCandidates, queue);
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

  const handleDraftPositionChange = (
    field: keyof StoragePosition,
    value: string
  ) => {
    handlePositionChange(setSinglePosition, field, value);
  };

  const handleSubmitSingle = () => {
    const missingFields: string[] = [];
    REQUIRED_FIELDS.forEach(({ key, label }) => {
      if (!singleForm[key as keyof typeof singleForm]) {
        missingFields.push(label);
      }
    });

    const storageFormatted = formatStoragePosition(singlePosition);
    const press = singleForm.pressStatus || "待压制";
    const identify = singleForm.identifyStatus || "待鉴定";
    let computedStatus: SpecimenRecord["status"] = "待压制";
    if (press === "已压制" && identify === "已鉴定") {
      computedStatus = "已入库";
    } else if (press === "已压制") {
      computedStatus = "待鉴定";
    } else {
      computedStatus = "待压制";
    }

    const newRecord: SpecimenRecord = {
      id: generateId(),
      collectionNo: singleForm.collectionNo,
      speciesName: singleForm.speciesName,
      collectionLocation: singleForm.collectionLocation,
      altitude: singleForm.altitude,
      collector: singleForm.collector,
      habitat: singleForm.habitat,
      status: computedStatus,
      storageLocation: storageFormatted,
      storagePosition: storageFormatted ? { ...singlePosition } : undefined,
      pressStatus: press,
      identifyStatus: identify,
      missingFields,
      isDuplicate: singleForm.collectionNo
        ? existingCollectionNos.has(singleForm.collectionNo)
        : false,
      selected: false,
      missingPhotoTypes: [],
      photoRecords: [],
      photoRemark: "",
      family: inferFamily(singleForm.speciesName),
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
    clearCurrentDraftAfterSave();
    setSingleForm({ ...EMPTY_DRAFT_FORM });
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
      prev.map((pair, idx) => {
        if (idx !== currentConflictIndex) return pair;
        const existingSuffix = pair.copySuffix || conflictCopySuffix;
        return { ...pair, resolved: true, resolution: "copy", copySuffix: existingSuffix };
      })
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
    const updatedParsed = [...parsedRecords];
    const skipIds = new Set<string>();
    const newRecordsToAdd: SpecimenRecord[] = [];
    const existingNosForCopy = new Set(updatedQueue.map((r) => r.collectionNo).filter(Boolean));
    const usedSuffixesByBaseNo: Record<string, Set<string>> = {};
    const batchConflictOldIds = new Set<string>();

    const updateRecordInList = (list: SpecimenRecord[], id: string, updater: (r: SpecimenRecord) => SpecimenRecord) => {
      const idx = list.findIndex((r) => r.id === id);
      if (idx !== -1) {
        list[idx] = updater(list[idx]);
        return true;
      }
      return false;
    };

    conflictPairs.forEach((pair) => {
      if (!pair.resolved) return;

      const oldId = pair.oldRecord.id;
      const newId = pair.newRecord.id;
      const baseNo = pair.newRecord.collectionNo;
      const isBatchConflict = pair.conflictType === "batch";

      if (pair.resolution === "overwrite") {
        const applyOverwrite = (target: SpecimenRecord) => ({
          ...resolveConflictOverwrite(target, pair.newRecord),
          isDuplicate: false,
          selected: isBatchConflict ? true : target.selected,
        });
        updateRecordInList(updatedQueue, oldId, applyOverwrite);
        updateRecordInList(updatedParsed, oldId, applyOverwrite);
        if (isBatchConflict) {
          batchConflictOldIds.add(oldId);
        }
        skipIds.add(newId);
      } else if (pair.resolution === "keep") {
        const applyKeep = (target: SpecimenRecord) => ({
          ...target,
          isDuplicate: false,
          selected: isBatchConflict ? true : target.selected,
        });
        updateRecordInList(updatedQueue, oldId, applyKeep);
        updateRecordInList(updatedParsed, oldId, applyKeep);
        if (isBatchConflict) {
          batchConflictOldIds.add(oldId);
        }
        skipIds.add(newId);
      } else if (pair.resolution === "copy") {
        const usedSet = usedSuffixesByBaseNo[baseNo] || new Set<string>();
        const defaultSuffix = pair.copySuffix || conflictCopySuffix;
        const uniqueSuffix = generateUniqueCopySuffix(baseNo, existingNosForCopy, defaultSuffix, usedSet);
        usedSet.add(uniqueSuffix);
        usedSuffixesByBaseNo[baseNo] = usedSet;

        const copyRecord = resolveConflictCopy(pair.newRecord, uniqueSuffix);
        const pos = previewPositions[pair.newRecord.id];
        if (pos) {
          copyRecord.storagePosition = { ...pos };
          copyRecord.storageLocation = formatStoragePosition(pos);
        }
        copyRecord.selected = false;
        copyRecord.isDuplicate = false;
        newRecordsToAdd.push(copyRecord);
        existingNosForCopy.add(copyRecord.collectionNo);
        skipIds.add(newId);

        const applyKeepOld = (target: SpecimenRecord) => ({
          ...target,
          isDuplicate: false,
          selected: isBatchConflict ? true : target.selected,
        });
        updateRecordInList(updatedQueue, oldId, applyKeepOld);
        updateRecordInList(updatedParsed, oldId, applyKeepOld);
        if (isBatchConflict) {
          batchConflictOldIds.add(oldId);
        }
      }
    });

    const batchConflictRecords = updatedParsed.filter(
      (r) => batchConflictOldIds.has(r.id) && !skipIds.has(r.id)
    );

    const selectedRecordsToImport = updatedParsed
      .filter((r) => r.selected && !skipIds.has(r.id) && !batchConflictOldIds.has(r.id))
      .map((r) => {
        const pos = previewPositions[r.id];
        const storageFormatted = pos ? formatStoragePosition(pos) : "";
        return {
          ...r,
          selected: false,
          isDuplicate: false,
          storageLocation: storageFormatted,
          storagePosition: storageFormatted ? { ...pos } : undefined,
        };
      });

    const batchConflictFormatted = batchConflictRecords.map((r) => {
      const pos = previewPositions[r.id];
      const storageFormatted = pos ? formatStoragePosition(pos) : "";
      return {
        ...r,
        selected: false,
        isDuplicate: false,
        storageLocation: storageFormatted,
        storagePosition: storageFormatted ? { ...pos } : undefined,
      };
    });

    setQueue([...newRecordsToAdd, ...batchConflictFormatted, ...selectedRecordsToImport, ...updatedQueue]);
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
      const baseNo = pair.newRecord.collectionNo;
      const existingNos = new Set(queue.map((r) => r.collectionNo).filter(Boolean));
      const defaultSuffix = pair.copySuffix || conflictCopySuffix;
      const uniqueSuffix = generateUniqueCopySuffix(baseNo, existingNos, defaultSuffix);
      const copyRecord = resolveConflictCopy(pair.newRecord, uniqueSuffix);
      const storageFormatted = formatStoragePosition(singlePosition);
      copyRecord.storageLocation = storageFormatted;
      copyRecord.storagePosition = storageFormatted ? { ...singlePosition } : undefined;
      copyRecord.isDuplicate = false;
      setQueue((prev) => [copyRecord, ...prev]);
    } else if (pair.resolution === "keep") {
    }

    clearCurrentDraftAfterSave();
    setSingleForm({ ...EMPTY_DRAFT_FORM });
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
          <div className="side-task-entry">
            <button className="identify-task-entry" onClick={handleOpenIdentifyTask}>
              <span className="identify-task-icon">🔬</span>
              <div className="identify-task-text">
                <strong>鉴定任务分派</strong>
                <small>分组分派标本给鉴定人</small>
              </div>
              <span className="identify-task-count">{identifyTaskMetrics.pending + identifyTaskMetrics.inProgress}</span>
            </button>
          </div>
          <div className="side-task-entry">
            <button className="location-entry" onClick={handleOpenLocationList}>
              <span className="location-task-icon">📍</span>
              <div className="location-task-text">
                <strong>采集地点档案</strong>
                <small>查看各采集地点汇总信息</small>
              </div>
              <span className="location-task-count">{locationProfiles.length}</span>
            </button>
          </div>
          <div className="side-task-entry">
            <button className="label-task-entry" onClick={handleOpenLabelPrint}>
              <span className="label-task-icon">🏷️</span>
              <div className="label-task-text">
                <strong>馆藏标签打印</strong>
                <small>选择标本生成标签并打印</small>
              </div>
              <span className="label-task-count">{labelPrintQueue.length}</span>
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
                  <h2>
                    新增标本记录
                    {drafts.length > 0 && (
                      <span className="preview-summary">
                        {" "}· 草稿箱 {drafts.length} 份
                        {currentDraftId && drafts.some((d) => d.id === currentDraftId) && (
                          <span className="text-success"> · 正在编辑</span>
                        )}
                      </span>
                    )}
                    <span className="draft-save-status">
                      {draftSaveStatus === "saving" && (
                        <span className="draft-status-saving">💾 自动保存中...</span>
                      )}
                      {draftSaveStatus === "saved" && (
                        <span className="draft-status-saved">✓ 已自动保存</span>
                      )}
                    </span>
                  </h2>
                </div>
                <div className="draft-actions-bar">
                  <button
                    className="btn-outline btn-small draft-new-btn"
                    onClick={handleNewDraft}
                  >
                    📝 新建草稿
                  </button>
                </div>
              </div>

              {drafts.length > 0 && (
                <div className="draft-panel">
                  <div className="draft-panel-header">
                    <span className="draft-panel-title">
                      📁 本地草稿箱
                      <small>点击切换草稿，所有改动会自动保存</small>
                    </span>
                  </div>
                  <div className="draft-list">
                    {drafts.map((d) => {
                      const isActive = d.id === currentDraftId;
                      const completion = getDraftCompletion(d);
                      return (
                        <div
                          key={d.id}
                          className={`draft-card ${isActive ? "draft-card-active" : ""}`}
                          onClick={() => !isActive && handleSwitchDraft(d.id)}
                        >
                          <div className="draft-card-main">
                            <div className="draft-card-title-row">
                              <span className="draft-card-title" title={getDraftTitle(d)}>
                                {isActive && "▶ "}
                                {getDraftTitle(d)}
                              </span>
                              <span className="draft-card-completion">
                                {completion.filled}/{completion.total}
                              </span>
                            </div>
                            <div className="draft-card-meta">
                              <span className="draft-card-time">
                                更新：{d.updatedAt}
                              </span>
                              {d.collectionNo && (
                                <span className="draft-card-no">{d.collectionNo}</span>
                              )}
                              {d.speciesName && !d.collectionNo && (
                                <span className="draft-card-species">{d.speciesName}</span>
                              )}
                              {d.collectionLocation && (
                                <span className="draft-card-loc">📍 {d.collectionLocation}</span>
                              )}
                            </div>
                            <div className="draft-progress-bar">
                              <div
                                className="draft-progress-fill"
                                style={{
                                  width: `${(completion.filled / completion.total) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                          <button
                            className="draft-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                window.confirm(
                                  `确认删除草稿「${getDraftTitle(d)}」？此操作不可撤销。`
                                )
                              ) {
                                handleDeleteDraft(d.id);
                              }
                            }}
                            title="删除草稿"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                <label>
                  <span>压制状态</span>
                  <select
                    className="storage-select"
                    value={singleForm.pressStatus}
                    onChange={(e) => handleSingleFormChange("pressStatus", e.target.value)}
                  >
                    {PRESS_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>鉴定状态</span>
                  <select
                    className="storage-select"
                    value={singleForm.identifyStatus}
                    onChange={(e) => handleSingleFormChange("identifyStatus", e.target.value)}
                  >
                    {IDENTIFY_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
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
                        handleDraftPositionChange("floor", e.target.value)
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
                        handleDraftPositionChange("cabinet", e.target.value)
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
                        handleDraftPositionChange("shelf", e.target.value)
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
                        handleDraftPositionChange("slot", e.target.value)
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
                <button
                  className="ghost-btn"
                  onClick={() => {
                    if (
                      window.confirm("确认清空当前表单？已保存到草稿箱的内容不受影响。")
                    ) {
                      setSingleForm({ ...EMPTY_DRAFT_FORM });
                      setSinglePosition({ ...EMPTY_POSITION });
                    }
                  }}
                >
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
                    disabled={previewStats.selected === 0 && previewStats.duplicates === 0}
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

  const renderIdentifyTaskView = () => {
    const currentTabList =
      identifyTaskTab === "pending"
        ? pendingAssignSpecimens
        : identifyTaskTab === "inProgress"
        ? inProgressTasks
        : identifyTaskTab === "completed"
        ? completedTasks
        : rejectedTasks;

    return (
      <>
        <section className="hero hero-identify">
          <p className="breadcrumbs">
            <button className="link-btn" onClick={handleBackToMain}>
              ← 返回主页
            </button>
            <span className="sep">/</span>
            <span>鉴定任务分派</span>
          </p>
          <h1>🔬 鉴定任务分派工作台</h1>
          <span>将待鉴定标本按科属、采集地点或采集人分组后分派给鉴定人，跟踪任务状态并记录退回原因与完成情况</span>
        </section>

        <section className="metrics identify-metrics">
          <article className="metric-pending-assign">
            <small>待分派</small>
            <strong>{identifyTaskMetrics.pending}</strong>
          </article>
          <article className="metric-in-progress">
            <small>鉴定中</small>
            <strong>{identifyTaskMetrics.inProgress}</strong>
          </article>
          <article className="metric-completed">
            <small>已完成</small>
            <strong>{identifyTaskMetrics.completed}</strong>
          </article>
          <article className="metric-rejected">
            <small>已退回</small>
            <strong>{identifyTaskMetrics.rejected}</strong>
          </article>
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>任务管理</p>
              <h2>
                鉴定任务列表
                <span className="preview-summary">
                  {identifyTaskTab === "pending" && ` · 待分派 ${identifyTaskMetrics.pending} 份`}
                  {identifyTaskTab === "inProgress" && ` · 鉴定中 ${identifyTaskMetrics.inProgress} 份`}
                  {identifyTaskTab === "completed" && ` · 已完成 ${identifyTaskMetrics.completed} 份`}
                  {identifyTaskTab === "rejected" && ` · 已退回 ${identifyTaskMetrics.rejected} 份`}
                </span>
              </h2>
            </div>
            <div className="chips">
              <button
                className={identifyTaskTab === "pending" ? "chip-active" : ""}
                onClick={() => setIdentifyTaskTab("pending")}
              >
                待分派
              </button>
              <button
                className={identifyTaskTab === "inProgress" ? "chip-active" : ""}
                onClick={() => setIdentifyTaskTab("inProgress")}
              >
                鉴定中
              </button>
              <button
                className={identifyTaskTab === "completed" ? "chip-active" : ""}
                onClick={() => setIdentifyTaskTab("completed")}
              >
                已完成
              </button>
              <button
                className={identifyTaskTab === "rejected" ? "chip-active" : ""}
                onClick={() => setIdentifyTaskTab("rejected")}
              >
                已退回
              </button>
            </div>
          </div>

          {identifyTaskTab === "pending" && (
            <>
              <div className="assign-toolbar">
                <div className="group-selector">
                  <span className="section-label">分组方式：</span>
                  <div className="chips">
                    <button
                      className={groupBy === "none" ? "chip-active" : ""}
                      onClick={() => setGroupBy("none")}
                    >
                      不分组
                    </button>
                    <button
                      className={groupBy === "family" ? "chip-active" : ""}
                      onClick={() => setGroupBy("family")}
                    >
                      按科属
                    </button>
                    <button
                      className={groupBy === "location" ? "chip-active" : ""}
                      onClick={() => setGroupBy("location")}
                    >
                      按采集地点
                    </button>
                    <button
                      className={groupBy === "collector" ? "chip-active" : ""}
                      onClick={() => setGroupBy("collector")}
                    >
                      按采集人
                    </button>
                  </div>
                </div>
                <div className="selection-info">
                  已选 <strong>{selectedSpecimens.size}</strong> / {pendingAssignSpecimens.length} 份
                  {pendingAssignSpecimens.length > 0 && (
                    <button
                      className="btn-outline btn-small"
                      onClick={handleSelectAllSpecimens}
                      style={{ marginLeft: "10px" }}
                    >
                      {selectedSpecimens.size === pendingAssignSpecimens.length ? "取消全选" : "全选"}
                    </button>
                  )}
                </div>
              </div>

              {pendingAssignSpecimens.length === 0 ? (
                <div className="empty-state">暂无待分派的鉴定任务</div>
              ) : (
                <div className="pending-specimen-list">
                  {getGroupedSpecimens.map((group) => (
                    <div key={group.key} className="specimen-group">
                      {groupBy !== "none" && (
                        <div className="group-header">
                          <label className="group-checkbox">
                            <input
                              type="checkbox"
                              checked={group.specimens.every((s) => selectedSpecimens.has(s.id))}
                              onChange={() => handleGroupSelect(group.key, group.specimens)}
                            />
                            <span className="group-title">🌿 {group.label}</span>
                            <span className="group-count">{group.specimens.length} 份</span>
                          </label>
                        </div>
                      )}
                      <div className="specimen-cards">
                        {group.specimens.map((s, idx) => (
                          <label
                            key={s.id}
                            className={`specimen-card ${
                              selectedSpecimens.has(s.id) ? "card-selected" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedSpecimens.has(s.id)}
                              onChange={() => handleToggleSpecimenSelect(s.id)}
                            />
                            <div className="card-index">{String(idx + 1).padStart(2, "0")}</div>
                            <div className="card-body">
                              <div className="card-title">
                                <h3>{s.collectionNo || "未编号"}</h3>
                                {s.family && (
                                  <span className="family-tag">{s.family}</span>
                                )}
                              </div>
                              <p className="card-species">
                                <strong>{s.speciesName || "物种待定"}</strong>
                              </p>
                              <div className="card-meta">
                                {s.collectionLocation && (
                                  <span>📍 {s.collectionLocation}</span>
                                )}
                                {s.collector && <span>👤 {s.collector}</span>}
                                {s.altitude && <span>⛰️ {s.altitude}</span>}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingAssignSpecimens.length > 0 && (
                <div className="assign-panel">
                  <div className="section-title">
                    <span>👨‍🔬 选择鉴定人</span>
                    <small>根据专长领域选择合适的鉴定人分派任务</small>
                  </div>
                  <div className="identifier-list">
                    {IDENTIFIERS.map((idf) => (
                      <label
                        key={idf.id}
                        className={`identifier-card ${
                          selectedIdentifier === idf.id ? "identifier-selected" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="identifier"
                          value={idf.id}
                          checked={selectedIdentifier === idf.id}
                          onChange={() => setSelectedIdentifier(idf.id)}
                        />
                        <div className="identifier-avatar">
                          {idf.name.charAt(0)}
                        </div>
                        <div className="identifier-info">
                          <div className="identifier-name">{idf.name}</div>
                          <div className="identifier-expertise">
                            {idf.expertise.map((e) => (
                              <span key={e} className="expertise-tag">{e}</span>
                            ))}
                          </div>
                        </div>
                        <div className={`identifier-load load-${idf.activeTaskCount === 0 ? "low" : idf.activeTaskCount <= 2 ? "mid" : "high"}`}>
                          <span>{idf.activeTaskCount} 个进行中</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="assign-actions">
                    <label className="remark-input">
                      <span>分派备注（可选）</span>
                      <textarea
                        placeholder="填写分派说明，如：优先处理、需特别关注某特征等..."
                        value={assignRemark}
                        onChange={(e) => setAssignRemark(e.target.value)}
                        rows={2}
                      />
                    </label>
                    <button
                      className="primary"
                      onClick={handleAssignTasks}
                      disabled={selectedSpecimens.size === 0 || !selectedIdentifier}
                    >
                      分派 {selectedSpecimens.size} 份标本给 {selectedIdentifier ? IDENTIFIERS.find((i) => i.id === selectedIdentifier)?.name : "鉴定人"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {identifyTaskTab !== "pending" && (
            <div className="task-records-list">
              {currentTabList.length === 0 ? (
                <div className="empty-state">
                  {identifyTaskTab === "inProgress" && "暂无进行中的鉴定任务"}
                  {identifyTaskTab === "completed" && "暂无已完成的鉴定任务"}
                  {identifyTaskTab === "rejected" && "暂无已退回的鉴定任务"}
                </div>
              ) : (
                currentTabList.map((task, idx) => {
                  const specimen = queue.find((s) => s.id === task.specimenId);
                  return (
                    <article
                      key={task.id}
                      className={`task-record-card task-${task.status}`}
                    >
                      <div className="task-record-header">
                        <div className="task-record-index">
                          <b>{String(idx + 1).padStart(2, "0")}</b>
                        </div>
                        <div className="task-record-title">
                          <h3>{task.collectionNo}</h3>
                          <span className={`status-badge ${getTaskStatusBadgeClass(task.status)}`}>
                            {task.status}
                          </span>
                        </div>
                        <div className="task-assignee">
                          {task.assignedTo && (
                            <>
                              <span className="assignee-label">鉴定人：</span>
                              <span className="assignee-name">{task.assignedTo}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {specimen && (
                        <div className="task-record-body">
                          <div className="task-specimen-info">
                            <p>
                              <strong>{specimen.speciesName || "物种待定"}</strong>
                              {specimen.family && (
                                <span className="family-tag" style={{ marginLeft: "8px" }}>
                                  {specimen.family}
                                </span>
                              )}
                            </p>
                            <div className="card-meta">
                              {specimen.collectionLocation && (
                                <span>📍 {specimen.collectionLocation}</span>
                              )}
                              {specimen.collector && <span>👤 {specimen.collector}</span>}
                              {specimen.altitude && <span>⛰️ {specimen.altitude}</span>}
                            </div>
                          </div>
                          {task.status === "已退回" && task.rejectReason && (
                            <div className="reject-reason-box">
                              <small>退回原因</small>
                              <p>⚠️ {task.rejectReason}</p>
                              {task.rejectedAt && (
                                <small className="reject-time">退回时间：{task.rejectedAt}</small>
                              )}
                            </div>
                          )}
                          {task.status === "已完成" && task.completedRemark && (
                            <div className="complete-remark-box">
                              <small>完成备注</small>
                              <p>✅ {task.completedRemark}</p>
                              {task.completedAt && (
                                <small className="complete-time">完成时间：{task.completedAt}</small>
                              )}
                            </div>
                          )}
                          {task.history.length > 0 && (
                            <div className="task-history">
                              <small>处理记录</small>
                              <div className="history-timeline">
                                {[...task.history].reverse().map((h) => (
                                  <div key={h.id} className="history-item">
                                    <span className="history-time">{h.timestamp}</span>
                                    <span className="history-operator">{h.operator}</span>
                                    <span className={`history-action action-${
                                      h.action === "完成鉴定" ? "done" :
                                      h.action === "退回任务" ? "reject" :
                                      h.action === "分派任务" || h.action === "重新分派" ? "assign" : "start"
                                    }`}>{h.action}</span>
                                    {h.assignedTo && (
                                      <span className="history-assignee">→ {h.assignedTo}</span>
                                    )}
                                    {h.remark && (
                                      <span className="history-remark">：{h.remark}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="task-record-actions">
                        {task.status === "鉴定中" && (
                          <>
                            <button
                              className="btn-outline"
                              onClick={() => handleOpenRejectModal(task.id)}
                            >
                              退回任务
                            </button>
                            <button
                              className="primary"
                              onClick={() => handleOpenCompleteModal(task.id)}
                            >
                              ✓ 完成鉴定
                            </button>
                          </>
                        )}
                        {task.status === "已退回" && (
                          <button
                            className="btn-outline"
                            onClick={() => handleReassignTask(task.id)}
                          >
                            重新分派
                          </button>
                        )}
                        {task.status === "已完成" && task.completedAt && (
                          <span className="completed-time">完成于 {task.completedAt}</span>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </section>

        {showRejectModal && (
          <div className="modal-overlay" onClick={() => setShowRejectModal(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>退回鉴定任务</h2>
                <button className="modal-close" onClick={() => setShowRejectModal(null)}>✕</button>
              </div>
              <div className="modal-body">
                <label className="remark-input">
                  <span>退回原因 *</span>
                  <textarea
                    placeholder="请详细说明退回原因，如：标本信息不完整、照片不清晰、需要补充资料等..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={4}
                  />
                </label>
              </div>
              <div className="modal-footer">
                <button className="ghost-btn" onClick={() => setShowRejectModal(null)}>
                  取消
                </button>
                <button
                  className="primary"
                  onClick={handleRejectTask}
                  disabled={!rejectReason.trim()}
                >
                  确认退回
                </button>
              </div>
            </div>
          </div>
        )}

        {showCompleteModal && (
          <div className="modal-overlay" onClick={() => setShowCompleteModal(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>完成鉴定</h2>
                <button className="modal-close" onClick={() => setShowCompleteModal(null)}>✕</button>
              </div>
              <div className="modal-body">
                <label className="remark-input">
                  <span>鉴定备注（可选）</span>
                  <textarea
                    placeholder="记录鉴定结果、物种学名确认、备注信息等..."
                    value={completeRemark}
                    onChange={(e) => setCompleteRemark(e.target.value)}
                    rows={4}
                  />
                </label>
              </div>
              <div className="modal-footer">
                <button className="ghost-btn" onClick={() => setShowCompleteModal(null)}>
                  取消
                </button>
                <button className="primary" onClick={handleCompleteTask}>
                  ✓ 确认完成
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

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
              ← 返回
            </button>
          </p>
          <h1>标本不存在</h1>
        </section>
      );
    }
    const r = detailSpecimen;
    const isPending = r.status === "需补照" && r.missingPhotoTypes.length > 0;
    const handleBack = () => {
      if (detailFromLocation) {
        handleBackToLocationDetail();
      } else {
        handleBackToPhotoTask();
      }
    };
    return (
      <>
        <section className="hero hero-detail">
          <p className="breadcrumbs">
            <button className="link-btn" onClick={handleBack}>
              ← {detailFromLocation ? "返回地点详情" : "返回需补照任务"}
            </button>
            <span className="sep">/</span>
            <button className="link-btn" onClick={handleBackToMain}>
              主页
            </button>
            {detailFromLocation && selectedLocationName && (
              <>
                <span className="sep">/</span>
                <button className="link-btn" onClick={handleBackToLocationDetail}>
                  {selectedLocationName}
                </button>
              </>
            )}
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

  const renderLocationListView = () => (
    <>
      <section className="hero hero-location">
        <p className="breadcrumbs">
          <button className="link-btn" onClick={handleBackToMain}>
            ← 返回主页
          </button>
          <span className="sep">/</span>
          <span>采集地点档案</span>
        </p>
        <h1>📍 采集地点档案库</h1>
        <span>汇总所有入库记录中的采集地点信息，包括该地点关联的标本数量、海拔范围、生境关键词、最近采集批次和待鉴定数量，支持按地点筛选和跳转标本详情</span>
      </section>

      <section className="metrics location-metrics">
        <article className="metric-locations-total">
          <small>采集地点总数</small>
          <strong>{locationProfiles.length}</strong>
        </article>
        <article className="metric-specimens-total">
          <small>关联标本总数</small>
          <strong>{locationProfiles.reduce((sum, lp) => sum + lp.specimenCount, 0)}</strong>
        </article>
        <article className="metric-altitude-cover">
          <small>覆盖海拔跨度</small>
          <strong>
            {(() => {
              const allAlts = locationProfiles.flatMap((lp) => lp.altitudeValues);
              if (allAlts.length === 0) return "—";
              return `${Math.min(...allAlts)}m ~ ${Math.max(...allAlts)}m`;
            })()}
          </strong>
        </article>
        <article className="metric-pending-locations">
          <small>有待鉴定地点</small>
          <strong>{locationProfiles.filter((lp) => lp.pendingIdentifyCount > 0).length}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>地点列表</p>
            <h2>
              采集地点档案清单
              <span className="preview-summary">
                {locationSearch
                  ? ` · 搜索 "${locationSearch}"，找到 ${filteredLocationProfiles.length} 个地点`
                  : ` · 共 ${locationProfiles.length} 个采集地点`}
              </span>
            </h2>
          </div>
          <div className="location-search-wrap">
            <input
              type="text"
              placeholder="🔍 搜索地点名称、生境关键词或采集人..."
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              className="location-search-input"
              style={{ width: "320px" }}
            />
          </div>
        </div>

        {filteredLocationProfiles.length === 0 ? (
          <div className="empty-state">
            {locationSearch ? "未找到匹配的采集地点" : "暂无采集地点数据"}
          </div>
        ) : (
          <div className="location-grid">
            {filteredLocationProfiles.map((lp, index) => (
              <article
                key={lp.name}
                className="location-card"
                onClick={() => handleOpenLocationDetail(lp.name)}
              >
                <div className="location-card-header">
                  <div className="location-card-index">
                    <b>{String(index + 1).padStart(2, "0")}</b>
                  </div>
                  <div className="location-card-title-wrap">
                    <h3 className="location-card-title">🌿 {lp.name}</h3>
                    {lp.pendingIdentifyCount > 0 && (
                      <span className="pending-badge">
                        待鉴定 {lp.pendingIdentifyCount} 份
                      </span>
                    )}
                  </div>
                </div>

                <div className="location-card-body">
                  <div className="location-info-grid">
                    <div className="location-info-item">
                      <small>标本总数</small>
                      <p>📦 {lp.specimenCount} 份</p>
                    </div>
                    <div className="location-info-item">
                      <small>海拔范围</small>
                      <p>⛰️ {lp.altitudeRange}</p>
                    </div>
                    <div className="location-info-item">
                      <small>最近采集批次</small>
                      <p>📋 {lp.lastBatch}</p>
                    </div>
                    <div className="location-info-item">
                      <small>采集人数</small>
                      <p>👥 {lp.collectors.length} 人</p>
                    </div>
                  </div>

                  {lp.habitatKeywords.length > 0 && (
                    <div className="location-habitat-section">
                      <div className="section-label">
                        <span>生境关键词</span>
                      </div>
                      <div className="habitat-chips">
                        {lp.habitatKeywords.map((kw) => (
                          <span key={kw} className="habitat-chip">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {lp.collectors.length > 0 && (
                    <div className="location-collectors-section">
                      <div className="section-label">
                        <span>采集人</span>
                      </div>
                      <div className="collector-chips">
                        {lp.collectors.slice(0, 4).map((c) => (
                          <span key={c} className="collector-chip">
                            👤 {c}
                          </span>
                        ))}
                        {lp.collectors.length > 4 && (
                          <span className="collector-chip collector-more">
                            +{lp.collectors.length - 4} 人
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="location-card-footer">
                  <span className="view-detail-hint">查看详情 →</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );

  const renderLocationDetailView = () => {
    if (!selectedLocationProfile) {
      return (
        <section className="hero hero-location">
          <p className="breadcrumbs">
            <button className="link-btn" onClick={handleBackToLocationList}>
              ← 返回地点列表
            </button>
          </p>
          <h1>地点不存在</h1>
        </section>
      );
    }
    const lp = selectedLocationProfile;
    return (
      <>
        <section className="hero hero-location">
          <p className="breadcrumbs">
            <button className="link-btn" onClick={handleBackToLocationList}>
              ← 返回地点列表
            </button>
            <span className="sep">/</span>
            <button className="link-btn" onClick={handleBackToMain}>
              主页
            </button>
            <span className="sep">/</span>
            <span>地点详情</span>
          </p>
          <h1>📍 {lp.name}</h1>
          <span>
            共采集 {lp.specimenCount} 份标本，海拔范围 {lp.altitudeRange}，
            {lp.pendingIdentifyCount > 0
              ? ` ${lp.pendingIdentifyCount} 份待鉴定`
              : " 全部已完成鉴定"}
          </span>
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>地点概览</p>
              <h2>采集地点综合信息</h2>
            </div>
          </div>

          <div className="location-detail-overview">
            <div className="detail-info-grid location-detail-grid">
              <div className="detail-info-cell">
                <small>标本总数</small>
                <p>📦 {lp.specimenCount} 份</p>
              </div>
              <div className="detail-info-cell">
                <small>海拔范围</small>
                <p>⛰️ {lp.altitudeRange}</p>
              </div>
              <div className="detail-info-cell">
                <small>最近采集批次</small>
                <p>📋 {lp.lastBatch}</p>
              </div>
              <div className="detail-info-cell">
                <small>待鉴定数量</small>
                <p className={lp.pendingIdentifyCount > 0 ? "text-warn" : "text-success"}>
                  {lp.pendingIdentifyCount > 0
                    ? `⚠️ ${lp.pendingIdentifyCount} 份待鉴定`
                    : "✅ 全部完成"}
                </p>
              </div>
            </div>

            {lp.habitatKeywords.length > 0 && (
              <div className="location-detail-section">
                <div className="section-title">
                  <span>🌿 生境关键词</span>
                  <small>从该地点所有标本的生境描述中自动提取</small>
                </div>
                <div className="habitat-chips habitat-chips-lg">
                  {lp.habitatKeywords.map((kw) => (
                    <span key={kw} className="habitat-chip habitat-chip-lg">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lp.collectors.length > 0 && (
              <div className="location-detail-section">
                <div className="section-title">
                  <span>👥 采集人员</span>
                  <small>参与该地点标本采集的所有人员</small>
                </div>
                <div className="collector-chips collector-chips-lg">
                  {lp.collectors.map((c) => (
                    <span key={c} className="collector-chip collector-chip-lg">
                      👤 {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>关联标本</p>
              <h2>
                该地点采集的标本清单
                <span className="preview-summary">
                  {" "}· 共 {lp.specimens.length} 份标本
                  {lp.pendingIdentifyCount > 0 && (
                    <span className="text-warn">
                      {" "}· {lp.pendingIdentifyCount} 份待鉴定
                    </span>
                  )}
                </span>
              </h2>
            </div>
          </div>

          <div className="records">
            {lp.specimens.length === 0 ? (
              <div className="empty-state">暂无关联标本</div>
            ) : (
              lp.specimens.map((record, index) => (
                <article
                  key={record.id || record.collectionNo + index}
                  className="location-specimen-card"
                >
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div className="record-content">
                    <div className="record-header">
                      <h3>{record.collectionNo || "未编号"}</h3>
                      <div className="record-actions-wrap">
                        <span className={`status-badge ${getStatusBadgeClass(record.status)}`}>
                          {record.status}
                        </span>
                        <button
                          className="link-btn specimen-detail-btn"
                          onClick={() => handleOpenSpecimenFromLocation(record.id)}
                        >
                          查看详情 →
                        </button>
                      </div>
                    </div>
                    <p>
                      <strong>{record.speciesName || "物种待定"}</strong>
                      {record.family && (
                        <span className="family-tag-inline"> · {record.family}</span>
                      )}
                      {record.altitude && ` · 海拔${record.altitude.replace(/m$/, "")}m`}
                      {record.collector && ` · ${record.collector}采集`}
                    </p>
                    {record.habitat && (
                      <p className="record-habitat">生境：{record.habitat}</p>
                    )}
                    {(record.storageLocation || record.storagePosition) && (
                      <p
                        className="record-storage"
                        title={
                          record.storagePosition
                            ? formatStorageDisplay(record.storagePosition)
                            : record.storageLocation
                        }
                      >
                        📦 馆藏：
                        <span className="storage-code-inline">
                          {record.storagePosition
                            ? formatStoragePosition(record.storagePosition)
                            : record.storageLocation}
                        </span>
                        {record.storagePosition && (
                          <span className="storage-detail-inline">
                            {" "}
                            {formatStorageDisplay(record.storagePosition)
                              .replace(/^\d楼 · /, "")
                              .replace(/ · 格位\d+$/, "")}
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
  };

  const renderLabelPrintView = () => {
    if (!labelQueueLoadedRef.current) {
      initializeLabelQueue();
    }

    const labelQueueIds = new Set(labelPrintQueue.map((item) => item.id));

    return (
      <>
        <section className="hero hero-label">
          <p className="breadcrumbs">
            <button className="link-btn" onClick={handleBackToMain}>
              ← 返回主页
            </button>
            <span className="sep">/</span>
            <span>标签打印队列</span>
          </p>
          <h1>🏷️ 馆藏标签打印队列</h1>
          <span>从已入库记录中选择标本生成馆藏标签，支持打印前预览、批量移除、按柜位排序，并自动保留最近一次打印队列</span>
        </section>

        <section className="metrics label-metrics">
          <article className="metric-stored">
            <small>已入库标本</small>
            <strong>{storedSpecimens.length}</strong>
          </article>
          <article className="metric-queue">
            <small>打印队列</small>
            <strong>{labelPrintQueue.length}</strong>
          </article>
          <article className="metric-selected">
            <small>已选择</small>
            <strong>{selectedLabelSpecimens.size}</strong>
          </article>
          <article className="metric-sort">
            <small>当前排序</small>
            <strong>
              {labelSortType === "default"
                ? "默认"
                : labelSortType === "storage"
                ? "按柜位"
                : "按采集号"}
            </strong>
          </article>
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>选择标本</p>
              <h2>
                已入库标本清单
                <span className="preview-summary">
                  {" "}· 共 {storedSpecimens.length} 份已入库标本
                  {selectedLabelSpecimens.size > 0 &&
                    `，已选 ${selectedLabelSpecimens.size} 份`}
                </span>
              </h2>
            </div>
            <div className="label-toolbar">
              {storedSpecimens.length > 0 && (
                <button
                  className="btn-outline btn-small"
                  onClick={handleSelectAllLabelSpecimens}
                >
                  {selectedLabelSpecimens.size === storedSpecimens.length
                    ? "取消全选"
                    : "全选"}
                </button>
              )}
              <button
                className="primary btn-small"
                onClick={() =>
                  handleAddToLabelQueue(Array.from(selectedLabelSpecimens))
                }
                disabled={selectedLabelSpecimens.size === 0}
              >
                加入打印队列 ({selectedLabelSpecimens.size})
              </button>
            </div>
          </div>

          {storedSpecimens.length === 0 ? (
            <div className="empty-state">暂无已入库的标本</div>
          ) : (
            <div className="label-specimen-list">
              {storedSpecimens.map((record, index) => {
                const isSelected = selectedLabelSpecimens.has(record.id);
                const inQueue = labelQueueIds.has(record.id);
                return (
                  <label
                    key={record.id}
                    className={`label-specimen-card ${
                      isSelected ? "card-selected" : ""
                    } ${inQueue ? "card-in-queue" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleLabelSelect(record.id)}
                    />
                    <div className="card-index">{String(index + 1).padStart(2, "0")}</div>
                    <div className="card-body">
                      <div className="card-title">
                        <h3>{record.collectionNo || "未编号"}</h3>
                        {record.family && (
                          <span className="family-tag">{record.family}</span>
                        )}
                        {inQueue && (
                          <span className="in-queue-tag">已在队列</span>
                        )}
                      </div>
                      <p className="card-species">
                        <strong>{record.speciesName || "物种待定"}</strong>
                      </p>
                      <div className="card-meta">
                        {record.collectionLocation && (
                          <span>📍 {record.collectionLocation}</span>
                        )}
                        {record.collector && <span>👤 {record.collector}</span>}
                        {record.altitude && <span>⛰️ {record.altitude}</span>}
                      </div>
                      {record.storagePosition && (
                        <div className="card-storage">
                          📦 {formatStoragePosition(record.storagePosition)}
                          <span className="storage-detail-inline">
                            {" "}
                            {formatStorageDisplay(record.storagePosition)
                              .replace(/^\d楼 · /, "")
                              .replace(/ · 格位\d+$/, "")}
                          </span>
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>打印队列</p>
              <h2>
                待打印标签队列
                <span className="preview-summary">
                  {" "}· 共 {sortedLabelQueue.length} 份
                </span>
              </h2>
            </div>
            <div className="label-toolbar">
              {labelPrintQueue.length > 0 && (
                <>
                  <button
                    className="btn-outline btn-small"
                    onClick={handleSelectAllQueueItems}
                  >
                    {selectedQueueItems.size === sortedLabelQueue.length
                      ? "取消全选"
                      : "全选队列"}
                  </button>
                  <button
                    className="btn-outline btn-small btn-danger-outline"
                    onClick={handleBatchRemoveFromQueue}
                    disabled={selectedQueueItems.size === 0}
                  >
                    批量移除 ({selectedQueueItems.size})
                  </button>
                </>
              )}
              <div className="chips">
                <button
                  className={labelSortType === "default" ? "chip-active" : ""}
                  onClick={() => handleSortLabelQueue("default")}
                >
                  默认排序
                </button>
                <button
                  className={labelSortType === "storage" ? "chip-active" : ""}
                  onClick={() => handleSortLabelQueue("storage")}
                >
                  按柜位排序
                </button>
                <button
                  className={labelSortType === "collectionNo" ? "chip-active" : ""}
                  onClick={() => handleSortLabelQueue("collectionNo")}
                >
                  按采集号
                </button>
              </div>
              <button
                className="btn-outline btn-small"
                onClick={handleClearLabelQueue}
                disabled={labelPrintQueue.length === 0}
              >
                清空队列
              </button>
              <button
                className="primary btn-small"
                onClick={handlePrintLabels}
                disabled={labelPrintQueue.length === 0}
              >
                🖨️ 预览并打印
              </button>
            </div>
          </div>

          {sortedLabelQueue.length === 0 ? (
            <div className="empty-state">
              打印队列为空，请从上方已入库标本中选择加入
            </div>
          ) : (
            <div className="label-queue-list">
              {sortedLabelQueue.map((item, index) => {
                const isSelected = selectedQueueItems.has(item.id);
                return (
                <div key={item.id} className={`label-queue-item ${isSelected ? "queue-item-selected" : ""}`}>
                  <input
                    type="checkbox"
                    className="queue-item-checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleQueueItemSelect(item.id)}
                  />
                  <div className="queue-item-index">
                    <b>{String(index + 1).padStart(2, "0")}</b>
                  </div>
                  <div className="queue-item-content">
                    <div className="queue-item-header">
                      <h3>{item.collectionNo}</h3>
                      <span className={`status-badge ${
                        item.identifyStatus === "已鉴定"
                          ? "badge-done"
                          : "badge-review"
                      }`}>
                        {item.identifyStatus}
                      </span>
                    </div>
                    <p className="queue-item-species">
                      <strong>{item.speciesName || "物种待定"}</strong>
                    </p>
                    <div className="queue-item-meta">
                      <span>📍 {item.collectionLocation || "—"}</span>
                      <span>⛰️ {item.altitude || "—"}</span>
                      <span>👤 {item.collector || "—"}</span>
                    </div>
                    {item.storagePosition && (
                      <div className="queue-item-storage">
                        📦 {formatStoragePosition(item.storagePosition)}
                        <span className="storage-detail-inline">
                          {" "}
                          {formatStorageDisplay(item.storagePosition)
                            .replace(/^\d楼 · /, "")
                            .replace(/ · 格位\d+$/, "")}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    className="queue-item-remove"
                    onClick={() => {
                      handleRemoveFromLabelQueue([item.id]);
                      if (selectedQueueItems.has(item.id)) {
                        setSelectedQueueItems((prev) => {
                          const next = new Set(prev);
                          next.delete(item.id);
                          return next;
                        });
                      }
                    }}
                    title="从队列中移除"
                  >
                    ✕
                  </button>
                </div>
              )})}
            </div>
          )}
        </section>

        {showLabelPreview && (
          <div className="label-preview-overlay" onClick={() => setShowLabelPreview(false)}>
            <div className="label-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="label-preview-header">
                <div>
                  <p className="conflict-breadcrumb">标签预览</p>
                  <h2>
                    🖨️ 馆藏标签预览
                    <span className="conflict-progress">
                      共 {sortedLabelQueue.length} 份标签
                    </span>
                  </h2>
                </div>
                <button
                  className="conflict-close"
                  onClick={() => setShowLabelPreview(false)}
                >
                  ✕
                </button>
              </div>

              <div className="label-preview-toolbar">
                <div className="label-layout-options">
                  <span className="section-label">布局：</span>
                  <div className="chips">
                    <button className="chip-active">单列</button>
                    <button>双列</button>
                    <button>三列</button>
                  </div>
                </div>
                <div className="label-print-actions">
                  <button
                    className="btn-outline"
                    onClick={() => window.print()}
                  >
                    🖨️ 打印
                  </button>
                </div>
              </div>

              <div className="label-preview-content">
                {sortedLabelQueue.map((item, index) => (
                  <div key={item.id} className="specimen-label">
                    <div className="label-header">
                      <div className="label-collection-no">
                        {item.collectionNo}
                      </div>
                      <div className="label-storage">
                        {item.storagePosition
                          ? formatStoragePosition(item.storagePosition)
                          : "—"}
                      </div>
                    </div>
                    <div className="label-species">{item.speciesName || "物种待定"}</div>
                    {item.family && (
                      <div className="label-family">{item.family}</div>
                    )}
                    <div className="label-info">
                      <div className="label-info-row">
                        <span className="label-info-label">采集地点：</span>
                        <span className="label-info-value">
                          {item.collectionLocation || "—"}
                        </span>
                      </div>
                      <div className="label-info-row">
                        <span className="label-info-label">海拔：</span>
                        <span className="label-info-value">
                          {item.altitude || "—"}
                        </span>
                      </div>
                      <div className="label-info-row">
                        <span className="label-info-label">采集人：</span>
                        <span className="label-info-value">
                          {item.collector || "—"}
                        </span>
                      </div>
                      <div className="label-info-row">
                        <span className="label-info-label">鉴定状态：</span>
                        <span className="label-info-value">
                          {item.identifyStatus}
                        </span>
                      </div>
                    </div>
                    <div className="label-footer">
                      <span className="label-index">第 {index + 1} 张</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="label-preview-footer">
                <button
                  className="ghost-btn"
                  onClick={() => setShowLabelPreview(false)}
                >
                  关闭
                </button>
                <button
                  className="primary"
                  onClick={() => window.print()}
                >
                  🖨️ 打印全部标签
                </button>
              </div>
            </div>
          </div>
        )}
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
                      value={currentConflict.copySuffix || conflictCopySuffix}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConflictPairs((prev) =>
                          prev.map((pair, idx) =>
                            idx === currentConflictIndex
                              ? { ...pair, copySuffix: val }
                              : pair
                          )
                        );
                      }}
                      placeholder="-副本1"
                    />
                  </label>
                  <span className="copy-preview">
                    预览：{newRecord.collectionNo}
                    {currentConflict.copySuffix || conflictCopySuffix}
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
      {currentView === "identifyTask" && renderIdentifyTaskView()}
      {currentView === "specimenDetail" && renderDetailView()}
      {currentView === "locationList" && renderLocationListView()}
      {currentView === "locationDetail" && renderLocationDetailView()}
      {currentView === "labelPrint" && renderLabelPrintView()}
      {renderConflictPanel()}
    </main>
  );
}

export default App;
