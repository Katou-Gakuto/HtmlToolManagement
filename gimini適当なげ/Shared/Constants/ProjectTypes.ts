import { BaseData } from "../../../Shared/Types/BaseData";

/**
 * プロジェクト固有の基本型定義。
 */
export interface ProjectConfig extends BaseData {
  readonly AppName: string;
}