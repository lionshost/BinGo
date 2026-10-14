// Bảng phân loại rác dùng chung với web/backend (Metro theo dõi ../frontend qua metro.config.js).
import { WASTE_GROUPS as RAW } from '../../../frontend/src/js/config/waste-taxonomy.js';

export interface WasteGroup {
  key: string;
  label: string;
  color: string;
  icon: string;
  examples: string;
  guidance: string;
}

export const WASTE_GROUPS = RAW as Record<string, WasteGroup>;
